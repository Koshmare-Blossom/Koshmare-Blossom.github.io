"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/research", label: "research" },
  { href: "/blog", label: "blog" },
  { href: "/about", label: "about" },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-6">
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={`font-mono text-sm transition-colors ${
            pathname === href
              ? "text-[#e879f9]"
              : "text-[#64748b] hover:text-[#e2e8f0]"
          }`}
        >
          {label}
        </Link>
      ))}

      <a
        href="https://x.com/koshmareflower"
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-sm text-[#64748b] hover:text-[#e879f9] transition-colors"
      >
        x
      </a>

      <a
        href="https://github.com/Koshmare-Blossom"
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-sm text-[#64748b] hover:text-[#e879f9] transition-colors"
      >
        github
      </a>
    </div>
  );
}
