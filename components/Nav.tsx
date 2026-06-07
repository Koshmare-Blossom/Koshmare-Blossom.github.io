import Link from "next/link";
import NavLinks from "./NavLinks";

export default function Nav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-[#1e1e30] bg-[#07070f]/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link
          href="/"
          className="font-mono text-sm text-[#e2e8f0] hover:text-[#e879f9] transition-colors"
        >
          koshmare<span className="text-[#e879f9]">~</span>blossom
        </Link>
        <NavLinks />
      </div>
    </nav>
  );
}
