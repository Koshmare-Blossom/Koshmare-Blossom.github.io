"use client";

import { useEffect, useState } from "react";

const initialRepos = [ 
  {
    name: "whisper",
    desc: "Hell's Gate / Halo's Gate for Linux. Indirect syscalls via runtime libc ELF parsing.",
    cve: null,
    lang: "Go",
    url: "https://github.com/Koshmare-Blossom/whisper",
    stars: 0,
  },
  {
    name: "eclipse",
    desc: "Linux Sleep Obfuscation.",
    cve: null,
    lang: "Go",
    url: "https://github.com/Koshmare-Blossom/eclipse",
    stars: 0,
  },
  {
    name: "unveil",
    desc: "LLVM-based devirtualization.",
    cve: null,
    lang: ["Go", "C"],
    url: "https://github.com/Koshmare-Blossom/unveil",
    stars: 0,
  },
  {
    name: "Dear-Linux-With-Love",
    desc: "Linux kernel exploits, rewritten with love.",
    cve: null,
    lang: "Go",
    url: "https://github.com/Koshmare-Blossom/Dear-Linux-With-Love",
    stars: 0,
  },
  {
    name: "PinTheft-go",
    desc: "A Go implementation of PinTheft (CVE-2026-43494)",
    cve: "CVE-2026-43494",
    lang: "Go",
    url: "https://github.com/Koshmare-Blossom/PinTheft-go",
    stars: 0,
  },
  {
    name: "PinTheft-asm",
    desc: "A x86_64 ASM implementation of PinTheft (CVE-2026-43494)",
    cve: "CVE-2026-43494",
    lang: "ASM",
    url: "https://github.com/Koshmare-Blossom/PinTheft-asm",
    stars: 1,
  },
  {
    name: "DirtyFrag-go",
    desc: "A Go implementation of dirtyfrag (CVE-2026-43284 / CVE-2026-43500)",
    cve: "CVE-2026-43284 / CVE-2026-43500",
    lang: "Go",
    url: "https://github.com/Koshmare-Blossom/DirtyFrag-go",
    stars: 0,
  },
  {
    name: "DirtyDecrypt-go",
    desc: "A Go implementation of dirtydecrypt (CVE-2026-31635)",
    cve: "CVE-2026-31635",
    lang: "Go",
    url: "https://github.com/Koshmare-Blossom/DirtyDecrypt-go",
    stars: 0,
  },
  {
    name: "Fragnesia-go",
    desc: "A Go implementation of fragnesia (CVE-2026-46300)",
    cve: "CVE-2026-46300",
    lang: "Go",
    url: "https://github.com/Koshmare-Blossom/Fragnesia-go",
    stars: 1,
  },
  {
    name: "CIFSwitch-go",
    desc: "A Go implementation of CIFSwitch (CVE-2026-46243)",
    cve: "CVE-2026-46243",
    lang: "Go",
    url: "https://github.com/Koshmare-Blossom/CIFSwitch-go",
    stars: 1,
  },
  {
    name: "Copyfail-sh",
    desc: "A Bash implementation of copyfail (CVE-2026-31431)",
    cve: "CVE-2026-31431",
    lang: "Shell",
    url: "https://github.com/Koshmare-Blossom/Copyfail-sh",
    stars: 3,
  },
];

const langColor: Record<string, string> = {
  Go: "#00acd7",
  ASM: "#a78bfa",
  Shell: "#e879f9",
  C: "#94a3b8",
};

export default function Research() {
  const [repos, setRepos] = useState(initialRepos);

  useEffect(() => {
    const fetchStars = async () => {
      try {
        const updatedRepos = await Promise.all(
          initialRepos.map(async (repo) => {
            const res = await fetch("https://api.github.com/repos/Koshmare-Blossom/" + repo.name);
            if (res.ok) {
              const data = await res.json();
              return { ...repo, stars: data.stargazers_count };
            }
            return repo;
          })
        );
        setRepos(updatedRepos);
      } catch (err) {
        console.error("failed to fetch stars", err);
      }
    };
    fetchStars();
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-6 py-20">
      <div className="mb-16">
        <p className="font-mono text-sm text-[#64748b] mb-3">research</p>
        <h1 className="text-3xl font-semibold text-[#e2e8f0] mb-4">
          PoC reimplementations
        </h1>
        <p className="text-[#64748b] max-w-xl leading-relaxed">
          Reimplementing existing PoCs in different languages.
          For researchers who need to see it, not just read about it.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {repos.map((repo) => (
          <a
            key={repo.name}
            href={repo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start justify-between p-5 border border-[#1e1e30] rounded-lg bg-[#0f0f1a] hover:border-[#e879f933] transition-all"
          >
            <div className="flex-1 min-w-0 pr-4">
              <div className="flex items-center gap-3 mb-1">
                <span className="font-mono text-sm text-[#e2e8f0] group-hover:text-[#f0abfc] transition-colors">
                  {repo.name}
                </span>
              </div>
              <p className="text-[#64748b] text-xs leading-relaxed">
                {repo.desc}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {repo.stars > 0 && (
                <span className="font-mono text-xs text-[#64748b]">
                  ★ {repo.stars}
                </span>
              )}
              <div className="flex items-center gap-1.5">
                {(Array.isArray(repo.lang) ? repo.lang : [repo.lang]).map(
                  (l: string) => (
                    <span
                      key={l}
                      className="font-mono text-xs px-2 py-0.5 rounded"
                      style={{
                        color: langColor[l] ?? "#94a3b8",
                        background: (langColor[l] ?? "#94a3b8") + "15",
                      }}
                    >
                      {l}
                    </span>
                  )
                )}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
