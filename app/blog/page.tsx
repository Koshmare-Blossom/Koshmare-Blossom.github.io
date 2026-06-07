import Link from "next/link";
import { getPosts } from "@/lib/posts";

export default function Blog() {
  const posts = getPosts();

  return (
    <div className="max-w-6xl mx-auto px-6 py-20">
      <div className="mb-16">
        <p className="font-mono text-sm text-[#64748b] mb-3">blog</p>
        <h1 className="text-3xl font-semibold text-[#e2e8f0] mb-4">
          Write-ups & research notes
        </h1>
        <p className="text-[#64748b] max-w-xl leading-relaxed">
          Notes on kernel internals, CVE analysis, and things I find interesting
          along the way.
        </p>
      </div>

      {posts.length === 0 ? (
        <p className="font-mono text-sm text-[#64748b]">
          Nothing here yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group flex items-baseline justify-between py-4 border-b border-[#1e1e30] hover:border-[#e879f933] transition-colors"
            >
              <span className="text-[#e2e8f0] group-hover:text-[#f0abfc] transition-colors">
                {post.title}
              </span>
              <span className="font-mono text-xs text-[#64748b] shrink-0 ml-4">
                {post.date}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
