import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import rehypeHighlight from "rehype-highlight";
import { common } from "lowlight";
import llvm from "highlight.js/lib/languages/llvm";
import { getPost, getPosts } from "@/lib/posts";

const highlightLanguages = { ...common, llvm };

export function generateStaticParams() {
  return getPosts().map((post) => ({ slug: post.slug }));
}

export const dynamicParams = false;

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  return (
    <article className="max-w-3xl mx-auto px-6 py-20">
      <Link
        href="/blog"
        className="font-mono text-sm text-[#64748b] hover:text-[#f0abfc] transition-colors"
      >
        &larr; blog
      </Link>

      <h1 className="text-3xl font-semibold text-[#e2e8f0] mt-6 mb-2">
        {post.title}
      </h1>
      <p className="font-mono text-xs text-[#64748b] mb-10">{post.date}</p>

      <div className="prose-dark">
        <MDXRemote
          source={post.content}
          options={{
            mdxOptions: {
              rehypePlugins: [
                [rehypeHighlight, { languages: highlightLanguages }],
              ],
            },
          }}
        />
      </div>
    </article>
  );
}
