export default function Footer() {
  return (
    <footer className="border-t border-[#1e1e30] py-8 mt-20">
      <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
        <span className="font-mono text-xs text-[#64748b]">
          © 2026 Koshmare-Blossom. All rights reserved.
        </span>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/Koshmare-Blossom"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-[#64748b] hover:text-[#e879f9] transition-colors"
          >
            github
          </a>
          <a
            href="https://x.com/koshmareflower"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-[#64748b] hover:text-[#e879f9] transition-colors"
          >
            x / twitter
          </a>
        </div>
      </div>
    </footer>
  );
}
