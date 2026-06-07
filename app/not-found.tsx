import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-40 flex flex-col items-center text-center">
      <p className="font-mono text-6xl text-[#1e1e30] mb-6">404</p>
      <h1 className="text-xl font-semibold text-[#e2e8f0] mb-3">
        Page not found
      </h1>
      <p className="text-[#64748b] text-sm mb-8">
        This page doesn&apos;t exist. Or maybe it was never meant to.
      </p>
      <Link
        href="/"
        className="font-mono text-sm text-[#e879f9] hover:underline"
      >
        ← go back home
      </Link>
    </div>
  );
}
