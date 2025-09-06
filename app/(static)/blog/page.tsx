import React from "react";
import Link from "next/link";
import { PageSEO } from "@/components/SEO";

interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  date: string;
  author: string;
  readTime: string;
  category: string;
}

const blogPosts: BlogPost[] = [
  {
    id: "voice-ai-trends-2024",
    title: "The Future of Voice AI: Top Trends Shaping 2024 and Beyond",
    excerpt:
      "Discover the latest developments in voice AI technology, from advanced natural language processing to real-time voice synthesis that's revolutionizing customer interactions.",
    date: "December 15, 2024",
    author: "David Fales",
    readTime: "5 min read",
    category: "Technology Trends",
  },
  {
    id: "implementing-voice-ai-business",
    title: "How to Successfully Implement Voice AI in Your Business",
    excerpt:
      "A comprehensive guide to integrating voice AI solutions into your business operations, including best practices, common pitfalls, and ROI considerations.",
    date: "December 10, 2024",
    author: "Nolan Smith",
    readTime: "7 min read",
    category: "Implementation Guide",
  },
  {
    id: "voice-ai-customer-experience",
    title: "Transforming Customer Experience with Advanced Voice AI",
    excerpt:
      "Learn how voice AI is reshaping customer service, providing 24/7 support, and creating more personalized interactions that drive customer satisfaction.",
    date: "December 5, 2024",
    author: "David Fales",
    readTime: "6 min read",
    category: "Customer Experience",
  },
];

export default function BlogPage() {
  return (
    <>
      <PageSEO
        title="Voice AI Blog - Latest Insights and Trends | Voicero.AI"
        description="Stay updated with the latest voice AI trends, implementation guides, and industry insights from Voicero.AI experts."
        path="/blog"
      />

      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
        <div className="max-w-6xl mx-auto px-4 py-16">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="text-5xl font-bold text-white mb-6">
              Voice AI <span className="text-purple-400">Blog</span>
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Explore the latest insights, trends, and best practices in voice
              AI technology
            </p>
          </div>

          {/* Blog Posts Grid */}
          <div className="grid gap-8 md:gap-12">
            {blogPosts.map((post, index) => (
              <article
                key={post.id}
                className="bg-white/10 backdrop-blur-lg border border-purple-500/20 rounded-2xl p-8 hover:bg-white/15 transition-all duration-300 hover:border-purple-400/40"
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-4">
                      <span className="bg-purple-600/20 text-purple-300 px-3 py-1 rounded-full text-sm font-medium">
                        {post.category}
                      </span>
                      <span className="text-gray-400 text-sm">{post.date}</span>
                    </div>

                    <h2 className="text-2xl font-bold text-white mb-4 hover:text-purple-300 transition-colors">
                      <Link href={`/blog/${post.id}`}>{post.title}</Link>
                    </h2>

                    <p className="text-gray-300 text-lg leading-relaxed mb-6">
                      {post.excerpt}
                    </p>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center">
                          <span className="text-white font-medium text-sm">
                            {post.author
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </span>
                        </div>
                        <div>
                          <p className="text-white font-medium text-sm">
                            {post.author}
                          </p>
                          <p className="text-gray-400 text-xs">
                            {post.readTime}
                          </p>
                        </div>
                      </div>

                      <Link
                        href={`/blog/${post.id}`}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                      >
                        Read More
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* Newsletter Signup */}
          <div className="mt-16 bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 rounded-2xl p-8 text-center">
            <h3 className="text-2xl font-bold text-white mb-4">
              Stay Updated with Voice AI Insights
            </h3>
            <p className="text-gray-300 mb-6">
              Get the latest articles, trends, and implementation guides
              delivered to your inbox
            </p>
            <div className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
              <input
                type="email"
                placeholder="Enter your email"
                className="flex-1 bg-white/10 border border-purple-500/30 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-400"
              />
              <button className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium transition-colors whitespace-nowrap">
                Subscribe
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
