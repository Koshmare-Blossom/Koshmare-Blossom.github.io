import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-6xl mx-auto px-6 min-h-screen bg-black text-[#d1d5db] py-40 flex flex-col items-center text-center">
      <p className="font-mono text-xl text-red-500 font-bold mb-6">KERNEL_PANIC: PAGE_NOT_FOUND (404)</p>
      <h1 className="text-xl font-semibold text-[#e2e8f0] mb-3">
        The kernel could not find the resource you were looking for.
      </h1>
      <p className="text-[#64748b] text-sm mb-8">
        System halted to prevent further confusion.
      </p>
      <Link
        href="/"
        className="font-mono text-sm text-[#e879f9] hover:underline"
      >
        ← reboot to home
      </Link>
    </div>
  );
}
