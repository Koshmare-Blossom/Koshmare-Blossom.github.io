---
title: "Writing a Naive LLVM-based Devirtualizer in Go"
date: "2026-06-15"
description: "Reimplementing eversinc33's LLVM devirtualizer in Go: lifting a stack VM to LLVM IR, letting the optimizer fold the virtualization away, and beating MBA, opaque predicates and real loops along the way."
---

I have a habit of taking something written in one language and rewriting it in
another, just to find out what the original was hiding. This time the victim is
[eversinc33's naive LLVM-based devirtualizer](https://eversinc33.com/2026/05/07/llvm-devirtualizer).
The original is C++. I wanted the lifter in Go.

The interesting part of that article is not the C++. It is the trick: you do not
write a deobfuscator at all. You translate the virtual machine's bytecode into
LLVM IR, hand it to `opt`, and the compiler's own optimizer deletes the
virtualization for you. The smart code is already written. It ships with clang.

So the question I actually wanted to answer was: how little of my own code can I
write and still make `opt` collapse a virtualized flag checker back into plain
comparisons? Go turns out to be a good language to answer that in, precisely
because it has no real LLVM API. That constraint forces the design to stay
honest.

<figure>
  <img src="/devirt-pipeline.svg" alt="Devirtualization pipeline: VM bytecode is lifted to verbose LLVM IR, then opt folds it into clean IR" />
  <figcaption>The whole pipeline. The lifter is deliberately naive; opt does the real work.</figcaption>
</figure>

## What virtualization-based protection is

A VM-based protector does not hide your function. It replaces it. Instead of
native `cmp`/`je`, your logic gets compiled to bytecode for a custom virtual
machine, and the binary ships an interpreter for that VM. When you disassemble,
you see the interpreter dispatch loop and a blob of bytes, not the logic. To
understand the program you first have to understand the VM, then hand-execute
its bytecode. That is the wall protectors like VMProtect, Themida or
BinaryShield put in front of you.

Our target is a small stack machine. Here is the entire instruction set:

```go
const (
	OP_PUSH   byte = 0x01 // push imm (i64)
	OP_LOADIN byte = 0x02 // push input[idx]
	OP_ADD    byte = 0x03
	OP_SUB    byte = 0x04
	OP_XOR    byte = 0x05
	OP_MUL    byte = 0x06
	OP_CMP    byte = 0x07 // a, b -> (a == b) ? 1 : 0
	OP_AND    byte = 0x08
	OP_JZ     byte = 0x09 // pop; if zero, jump
	OP_JMP    byte = 0x0A
	OP_RET    byte = 0x0B // pop -> return value
)
```

The crackme it runs is a per-byte flag check, except every byte is XORed with a
position-dependent key first, so the expected bytes never appear as constants in
the bytecode:

```go
// for each i: if (input[i] ^ key[i]) != (flag[i] ^ key[i]) return 0
for i := 0; i < len(flag); i++ {
	k := int64(keyByte(i))
	ct := int64(flag[i]) ^ k // obfuscated expected value
	p = append(p,
		loadin(byte(i)),
		push(k),
		instr(OP_XOR),
		push(ct),
		instr(OP_CMP),
		jump(OP_JZ, "fail"),
	)
}
```

A reverser staring at the assembled bytecode only sees `loadin`, `xor` against
some key, and a compare against some ciphertext byte. The flag is not there.

## The plan: lift, do not interpret

The naive approach is one sentence. For every VM instruction, emit the LLVM IR
that performs the same operation, then run the optimizer. We never simplify
anything ourselves. Two design decisions make it work, and both are the kind of
thing you only believe once you have watched `opt` chew on it.

### Decision 1: one basic block per instruction

We make zero effort to recover control flow structure. Every bytecode offset
gets its own LLVM basic block. Sequential instructions end with an explicit
branch to the next block. Jumps branch to the target offset's block. It looks
absurd, hundreds of blocks each holding a couple of instructions. `simplifycfg`
merges them all back together later. Recovering structure is the optimizer's
job, not mine.

### Decision 2: the VM stack lives inside the IR

This is the load-bearing idea, and it is where my first attempt died, exactly as
the original article warned.

My instinct as a Go programmer was to keep the VM stack as a Go slice of LLVM
values at lift time: push an SSA value, pop it later, wire it directly into the
next instruction. That is host-side bookkeeping. It breaks the moment control
flow branches. A value pushed in one block and popped in another is not
dominated by its use, and SSA falls apart. You end up needing to reconstruct phi
nodes by hand at every merge point, which is the entire problem you were trying
to make the compiler solve.

The fix is to stop being clever. Put the stack in memory:

```go
// entry block, once
l.emit("%%stack = alloca [256 x i64]")
l.emit("%%sp = alloca i64")
l.emit("store i64 0, ptr %%sp")
```

`push` and `pop` become load/store against that `alloca`. Here is `push`:

```go
func (l *lifter) pushVal(val string) {
	sp := l.reg()
	l.emit("%s = load i64, ptr %%sp", sp)
	slot := l.reg()
	l.emit("%s = getelementptr [256 x i64], ptr %%stack, i64 0, i64 %s", slot, sp)
	l.emit("store i64 %s, ptr %s", val, slot)
	nsp := l.reg()
	l.emit("%s = add i64 %s, 1", nsp, sp)
	l.emit("store i64 %s, ptr %%sp", nsp)
}
```

This generates spectacularly verbose IR. Every `push` is two loads, a GEP and two
stores. Every VM op touches memory several times. Good. That is the point. By
keeping the stack in memory instead of in my Go code, I am handing LLVM a problem
it is extremely good at: `mem2reg` and `sroa` promote those allocas to SSA
registers, inserting phi nodes wherever control flow merges. The stack I refused
to reason about gets reasoned about for free, correctly, by the part of the
compiler that does dominance analysis for a living.

The opcode lifters themselves are boring, which is how you want them. `LOADIN`:

```go
case OP_LOADIN:
	p := l.reg()
	l.emit("%s = getelementptr i8, ptr %%input, i64 %d", p, d.idx)
	b := l.reg()
	l.emit("%s = load i8, ptr %s", b, p)
	z := l.reg()
	l.emit("%s = zext i8 %s to i64", z, b)
	l.pushVal(z)
```

`CMP` pops two, compares, pushes the boolean. `JZ` pops one and emits a
`br i1`. `RET` pops and returns. That is the whole lifter. No pattern matching,
no peephole rules, no knowledge of what the program does.

## Watching the VM dissolve

Lift the basic crackme and you get about 1280 lines of IR that is almost
entirely stack traffic. Then:

```bash
opt -O1 -S vm.ll -o vm.opt.ll
```

121 lines come out. The stack is gone. And the part that matters:

```llvm
entry:
  %t2 = load i8, ptr %input, align 1
  %t33 = icmp eq i8 %t2, 103
  br i1 %t33, label %op_0019, label %op_01cc

op_0019:
  %t43 = getelementptr i8, ptr %input, i64 1
  %t44 = load i8, ptr %t43, align 1
  %t75 = icmp eq i8 %t44, 48
  br i1 %t75, label %op_0032, label %op_01cc
```

Look at what happened to the obfuscation. The bytecode computed
`input[i] ^ key[i]` and compared it to `flag[i] ^ key[i]`. `instcombine` knows
that `a ^ k == b ^ k` is just `a == b`, so it cancelled the key on both sides.
The comparisons are now directly against the plaintext flag bytes: 103 is `g`,
48 is `0`, 95 is `_`. Read the constants down the chain and the flag falls out:
`g0_d3virt_w1th_g0!`. We never wrote a single line of code that knows about XOR.

This is the whole thesis. Represent the semantics faithfully in IR and the
optimizer does the deobfuscation, because to the optimizer there is no
obfuscation, only redundant code.

## Hardening the handlers, and what survives

A real protector does not emit a naked XOR. So I added a `hard` mode with two
classic tricks to see what `opt` shrugs off.

**Mixed Boolean-Arithmetic.** Instead of `xor`, the handler computes
`(a | b) - (a & b)`, which is an MBA identity for `a ^ b`. The lifter emits the
literal `or`/`and`/`sub`:

```go
case OP_XOR_MBA:
	b := l.popVal()
	a := l.popVal()
	or := l.reg(); l.emit("%s = or i64 %s, %s", or, a, b)
	an := l.reg(); l.emit("%s = and i64 %s, %s", an, a, b)
	r := l.reg();  l.emit("%s = sub i64 %s, %s", r, or, an)
	l.pushVal(r)
```

`instcombine` folds `(a | b) - (a & b)` straight back to `xor`. Not every MBA
identity dies this easily, that is an arms race with its own literature, but the
common ones LLVM already knows.

**Opaque predicates.** Each comparison gets wrapped in a branch guarded by
`((x | 1) & 1) == 1`, which is always true, leading to a dead block full of junk
arithmetic. The lifter emits it honestly, true branch and junk branch both. LLVM
proves the predicate is constant `true`, deletes the junk block, and `dce`
removes the now-dead arithmetic.

The verbose `hard` IR starts at ~1590 lines. After `-O1` it is the same 121 lines
as the basic version, and the recovered flag is identical. The hardening added
noise to the bytecode and changed nothing about the result. That is worth sitting
with: from the optimizer's point of view, MBA and opaque predicates are just more
dead code.

Because I drive the passes from Go, I can print the reduction one pass at a time
and watch the VM come apart:

```text
pipeline                           lines
(raw lift)                         1587
mem2reg                            1365
+sroa                              1365
+sccp,instcombine                  887
+gvn,simplifycfg,dce               287
full -O1                           121
```

<figure>
  <img src="/devirt-reduction.svg" alt="Bar chart of LLVM IR line count after each optimization pass, dropping from 1587 to 121" />
  <figcaption>Each pass strips out one recognizable layer of the virtualization.</figcaption>
</figure>

`mem2reg` promotes the stack pointer, `sccp` turns the now-scalar stack indices
into constants, `sroa` shatters the stack array into individual registers,
`instcombine` cancels the XOR and the MBA, and `simplifycfg` collapses the
block-per-instruction soup. Every pass is doing exactly one recognizable part of
the devirtualization.

## Loops actually work, which is the real surprise

A flat flag check is the easy case. The honest test is a loop, because a loop is
where my naive "stack in memory" trick either pays off or detonates. So `loop`
mode adds locals (`LDLOC`/`STLOC`) and a backward jump, and computes a rolling
XOR checksum:

```text
acc := 0
for i := 0; i < LEN; i++ { acc ^= input[i] }
return acc == CHECKSUM
```

The loop counter and accumulator live in VM locals, which I materialize in IR the
same way as the stack: an `alloca [16 x i64]`. Now there is a real loop carrying
state across a back edge. This is precisely the situation where host-side stack
bookkeeping needs hand-written phi nodes. With the state in memory, `mem2reg`
inserts those phi nodes itself when it promotes the locals. I do not write a
single phi.

After `-O1` the VM is gone again. LLVM promoted the locals to SSA, saw the trip
count was fixed, and fully unrolled the loop into a chain of `xor`s ending in one
compare against the checksum constant. The interpreter, the stack, the locals,
the back edge: all of it folded into straight-line arithmetic over the input.

## Driving LLVM from Go

The one place Go fought me was talking to LLVM at all. The natural choice is the
cgo binding, `tinygo.org/x/go-llvm`. It downloads and compiles fine against the
LLVM 22 headers, then refuses to link: the binding is wired to `-lLLVM-20` and
the link dies on undefined references to `PassBuilder` and `DILocation`. Making
it work means rebuilding the binding against the installed LLVM. That is a
yak-shave with no payoff for this project.

So I did the boring thing that actually works: emit IR as text and drive `opt`
and `clang` over `os/exec`. The lifter writes a `.ll` file, Go runs the pass
pipeline, greps the surviving `icmp eq i8` comparisons to reconstruct the flag,
then compiles the optimized IR and runs it against the recovered flag to prove
the lift preserved semantics:

```text
check("g0_d3virt_w1th_g0!") = 1  -> PASS
check("xxxxxxxxxxxxxxxxxx") = 0  -> FAIL
```

Emitting textual IR also turned out to be the more instructive choice. There is
no API hiding what gets generated. You see every `getelementptr` and every
redundant load, which is the whole reason the before/after is so stark.

## What I actually learned

The lifter is a few hundred lines of Go that knows nothing about cryptography,
control flow recovery, or deobfuscation. All of that intelligence is borrowed
from `opt`. The two ideas that carry the entire technique are: represent VM
semantics faithfully in IR, and keep VM state in memory so the compiler's SSA
construction handles control flow for you. Get those right and MBA, opaque
predicates and loops stop being obstacles, because none of them survive contact
with an optimizer that treats them as ordinary redundant code.

This is "naive" devirtualization and it has real limits. It assumes you have
already reversed the VM well enough to lift each handler correctly, which for a
commercial protector is most of the work. It does not handle self-modifying
bytecode or handlers whose semantics depend on runtime state you cannot model
statically. But as a way to understand the shape of the problem, rewriting it in
a language with no LLVM API was the right move. It left nowhere to hide the
trick.

The code for this post is on GitHub:
[unveil](https://github.com/Koshmare-Blossom/unveil).

Credit where it is due: the approach and the original C++ implementation are
[eversinc33's](https://eversinc33.com/2026/05/07/llvm-devirtualizer). I just
wanted to see it in Go.
