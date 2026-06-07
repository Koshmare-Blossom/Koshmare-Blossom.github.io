import Image from "next/image";

const tools = ["Go", "x86_64 ASM", "Bash / Shell", "Linux kernel", "GDB", "IDA"];

const links = [
  { label: "GitHub", url: "https://github.com/Koshmare-Blossom" },
  { label: "X / Twitter", url: "https://x.com/koshmareflower" },
  { label: "koshmare-blossom@proton.me", url: "mailto:koshmare-blossom@proton.me" },
];

export default function About() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-20">
      <div className="max-w-2xl">

        {/* Header */}
        <div className="flex items-center gap-6 mb-12">
          <Image
            src="/avatar.jpg"
            alt="Koshmare-Blossom"
            width={80}
            height={80}
            className="rounded-full border border-[#1e1e30]"
          />
          <div>
            <h1 className="text-2xl font-semibold text-[#e2e8f0] mb-1">
              Koshmare-Blossom
            </h1>
            <p className="font-mono text-sm text-[#64748b]">
              Linux kernel researcher · PoC reimplementations
            </p>
          </div>
        </div>

        {/* About */}
        <div className="flex flex-col gap-6 mb-12 text-[#94a3b8] leading-relaxed">
          <p>
            I work on Linux kernel security research. Most of what I publish
            is reimplementations of existing PoCs - taking a CVE, understanding
            it fully, and rewriting it in a different language to see what
            the original was hiding.
          </p>
          <p>
            Go is my main language. I also write x86_64 ASM when I need to
            get closer to the metal, and Bash when one script is enough.
          </p>
          <p>
            I don&apos;t have much to say about myself outside of that.
            I like romance anime. That&apos;s enough.
          </p>
        </div>

        {/* Tools */}
        <div className="mb-12">
          <p className="font-mono text-xs text-[#64748b] uppercase tracking-widest mb-4">
            tools
          </p>
          <div className="flex flex-wrap gap-2">
            {tools.map((tool) => (
              <span
                key={tool}
                className="font-mono text-xs px-3 py-1 border border-[#1e1e30] rounded text-[#94a3b8]"
              >
                {tool}
              </span>
            ))}
          </div>
        </div>

        {/* Links */}
        <div>
          <p className="font-mono text-xs text-[#64748b] uppercase tracking-widest mb-4">
            links
          </p>
          <div className="flex flex-col gap-2">
            {links.map(({ label, url }) => (
              <a
                key={label}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-sm text-[#e2e8f0] hover:text-[#e879f9] transition-colors w-fit"
              >
                {label} →
              </a>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
