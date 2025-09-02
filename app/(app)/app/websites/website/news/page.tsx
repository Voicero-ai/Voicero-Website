"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  FaSync,
  FaNewspaper,
  FaCalendarAlt,
  FaUser,
  FaTag,
  FaClock,
  FaExternalLinkAlt,
  FaFire,
  FaSnowflake,
} from "react-icons/fa";

interface ShopifyBlogPost {
  id: string;
  title: string;
  handle: string;
  url: string;
  content: string;
  excerpt: string | null;
  image: string | null;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  author: string | null;
  tags: string[] | null;
  blogId: string;
  hot: number;
}

// Base blog interface with common properties
interface BaseBlog {
  id: string;
  title: string;
}

interface ShopifyBlog extends BaseBlog {
  handle: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  blogPosts: ShopifyBlogPost[];
  content?: never; // Ensure type safety for union
}

interface WordPressBlog extends BaseBlog {
  type: string;
  content: WordPressContent[];
  updatedAt?: string;
  blogPosts?: never; // Ensure type safety for union
}

// Base post interface with common properties
interface BasePost {
  id: string;
  title: string;
  content: string;
  excerpt?: string | null;
  author?: string | null;
  publishedAt: string;
  updatedAt: string;
  url: string;
  handle: string;
  hot: number;
  image?: string | null;
  tags?: string[] | null;
  blogId?: string;
}

interface WordPressContent extends BasePost {
  slug: string;
  link: string;
  createdAt: string;
}

interface ApiResponse {
  success: boolean;
  blogs: (ShopifyBlog | WordPressBlog)[];
  websiteId: string;
  domain: string;
  platform: string;
}

export default function NewsPage() {
  const searchParams = useSearchParams();
  const websiteId = searchParams.get("id");

  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [activeBlogId, setActiveBlogId] = useState<string | null>(null);
  const [showAllPosts, setShowAllPosts] = useState<boolean>(false);
  const [expandedPosts, setExpandedPosts] = useState<Record<string, boolean>>(
    {}
  );
  const [hotPosts, setHotPosts] = useState<string[]>([]);
  const [isTogglingHot, setIsTogglingHot] = useState<Record<string, boolean>>(
    {}
  );

  // Toggle post expansion
  const togglePostExpansion = (postId: string) => {
    setExpandedPosts((prev) => ({
      ...prev,
      [postId]: !prev[postId],
    }));
  };

  // Toggle hot status
  const toggleHotStatus = async (postId: string, currentHotStatus: number) => {
    if (!websiteId) return;

    // Prevent multiple clicks
    if (isTogglingHot[postId]) return;

    setIsTogglingHot((prev) => ({
      ...prev,
      [postId]: true,
    }));

    try {
      const res = await fetch("/api/news/hot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          websiteId,
          postId,
          hot: currentHotStatus === 1 ? 0 : 1,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to update hot status");
      }

      // Refresh the data
      fetchBlogs(true);
    } catch (e: any) {
      console.error("Error toggling hot status:", e);
      alert(e?.message || "Failed to update hot status");
    } finally {
      setIsTogglingHot((prev) => ({
        ...prev,
        [postId]: false,
      }));
    }
  };

  // Local SWR-style cache
  const CACHE_KEY_PREFIX = "voicero.shopifyBlogs.cache:";
  const cacheKey = websiteId ? `${CACHE_KEY_PREFIX}${websiteId}` : "";

  const fetchBlogs = async (warmStart: boolean = false) => {
    if (!websiteId) return;
    if (warmStart) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    console.log("doing news-fetch", { websiteId });
    try {
      const res = await fetch("/api/news", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ websiteId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to fetch blog data");
      }
      const json = (await res.json()) as ApiResponse;
      setData(json);
      console.log("done news-fetch", { websiteId, json });

      // Set active blog to first blog if none selected and not showing all posts
      if (json.blogs.length > 0 && !activeBlogId && !showAllPosts) {
        setActiveBlogId(json.blogs[0].id);
      }

      // update cache
      try {
        if (cacheKey)
          localStorage.setItem(
            cacheKey,
            JSON.stringify({ ts: Date.now(), data: json })
          );
      } catch {}
      console.log("done news-fetch", { websiteId });
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
    } finally {
      if (warmStart) setIsRefreshing(false);
      else setIsLoading(false);
    }
  };

  // Stale-while-revalidate: show cached data immediately, then refresh
  useEffect(() => {
    if (!websiteId) return;
    let usedCache = false;
    try {
      if (cacheKey) {
        const raw = localStorage.getItem(cacheKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.data) {
            setData(parsed.data as ApiResponse);
            if (
              parsed.data.blogs.length > 0 &&
              !activeBlogId &&
              !showAllPosts
            ) {
              setActiveBlogId(parsed.data.blogs[0].id);
            }
            usedCache = true;
          }
        }
      }
    } catch {}
    setIsLoading(!usedCache);
    fetchBlogs(usedCache);
  }, [websiteId]);

  // Format date helper
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  // Get active blog
  const activeBlog = data?.blogs.find((blog) => blog.id === activeBlogId);

  // Debug the active blog
  useEffect(() => {
    if (activeBlog) {
      console.log("Active Blog:", activeBlog);
      console.log("Has blogPosts:", "blogPosts" in activeBlog);
      console.log("Has content:", "content" in activeBlog);
      if ("content" in activeBlog) {
        console.log("Content length:", activeBlog.content?.length);
      }
      if ("blogPosts" in activeBlog) {
        console.log("BlogPosts length:", activeBlog.blogPosts?.length);
      }
    }
  }, [activeBlog]);

  if (!websiteId) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="p-4 bg-red-50 text-red-700 rounded-lg">
          Missing website id.
        </div>
      </div>
    );
  }

  if (isLoading && !data) {
    return (
      <div className="max-w-3xl mx-auto p-8 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 mb-4 rounded-full border-4 border-brand-lavender-light/40 border-t-brand-accent animate-spin" />
        <h2 className="text-xl font-semibold text-brand-text-primary mb-2">
          Loading blog content
        </h2>
        <p className="text-sm text-brand-text-secondary">
          Fetching blogs and posts from your Shopify store...
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-text-primary">
            {data?.platform === "WordPress" ? "WordPress" : "Shopify"} Blog
            Content
          </h1>
          {data?.domain && (
            <p className="text-sm text-brand-text-secondary">{data.domain}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchBlogs(true)}
            disabled={isRefreshing}
            className="px-3 py-2 bg-brand-accent text-white rounded-lg hover:bg-brand-accent/90 disabled:opacity-50 flex items-center gap-2"
            title="Refresh blogs"
          >
            <FaSync className={isRefreshing ? "animate-spin" : ""} />
            {isRefreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>
      )}

      {data?.blogs && data.blogs.length === 0 ? (
        <div className="p-6 bg-amber-50 text-amber-800 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">No blogs found</h2>
          <p>
            This Shopify store doesn't have any blogs or the blogs haven't been
            synced yet.
          </p>
        </div>
      ) : (
        <>
          {/* Blog selection as horizontal tabs */}
          <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/30 p-4 mb-8">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => {
                  setShowAllPosts(true);
                  setActiveBlogId(null);
                }}
                className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                  showAllPosts
                    ? "bg-brand-accent text-white"
                    : "bg-brand-lavender-light/10 hover:bg-brand-lavender-light/20 text-brand-text-primary"
                }`}
              >
                <FaNewspaper
                  className={showAllPosts ? "text-white" : "text-brand-accent"}
                />
                <div>
                  <div className="font-medium">All Posts</div>
                  <div className="text-xs opacity-80">
                    {data?.blogs.reduce(
                      (total, blog) =>
                        total +
                        (blog.blogPosts?.length || blog.content?.length || 0),
                      0
                    )}{" "}
                    posts
                  </div>
                </div>
              </button>
              {data?.blogs.map((blog) => (
                <button
                  key={blog.id}
                  onClick={() => {
                    setActiveBlogId(blog.id);
                    setShowAllPosts(false);
                  }}
                  className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                    blog.id === activeBlogId
                      ? "bg-brand-accent text-white"
                      : "bg-brand-lavender-light/10 hover:bg-brand-lavender-light/20 text-brand-text-primary"
                  }`}
                >
                  <FaNewspaper
                    className={
                      blog.id === activeBlogId
                        ? "text-white"
                        : "text-brand-accent"
                    }
                  />
                  <div>
                    <div className="font-medium">{blog.title}</div>
                    <div className="text-xs opacity-80">
                      {blog.blogPosts?.length || blog.content?.length || 0}{" "}
                      posts
                      {"type" in blog &&
                        blog.type === "posts" &&
                        " (WordPress)"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Blog Content */}
          {showAllPosts ? (
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/30 p-6">
                <h2 className="text-xl font-bold text-black mb-1">
                  All Blog Posts
                </h2>
                <div className="text-sm text-brand-text-secondary flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <FaClock className="opacity-70" />
                    {data?.blogs.length} blogs
                  </span>
                </div>
              </div>

              {data?.blogs.reduce(
                (total, blog) =>
                  total + (blog.blogPosts?.length || blog.content?.length || 0),
                0
              ) === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/30 p-6">
                  <p className="text-brand-text-secondary">
                    No posts found in any blogs.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {data?.blogs
                    .flatMap((blog): BasePost[] => {
                      if ("blogPosts" in blog && blog.blogPosts) {
                        return blog.blogPosts as unknown as BasePost[];
                      } else if ("content" in blog && blog.content) {
                        return blog.content as BasePost[];
                      }
                      return [];
                    })
                    .sort((a: BasePost, b: BasePost) => {
                      if (a.hot === 1 && b.hot !== 1) return -1;
                      if (a.hot !== 1 && b.hot === 1) return 1;
                      return (
                        new Date(b.publishedAt).getTime() -
                        new Date(a.publishedAt).getTime()
                      );
                    })
                    .map((post: BasePost) => (
                      <div
                        key={post.id}
                        className={`bg-white rounded-xl shadow-sm border ${
                          post.hot === 1
                            ? "border-amber-400"
                            : "border-brand-lavender-light/30"
                        } overflow-hidden`}
                      >
                        {post.image && (
                          <div className="w-full h-48 overflow-hidden">
                            <img
                              src={post.image}
                              alt={post.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="p-6">
                          <div
                            className="flex items-center justify-between cursor-pointer"
                            onClick={() => togglePostExpansion(post.id)}
                          >
                            <div className="flex items-center gap-2">
                              {post.hot === 1 && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                  <FaFire className="mr-1 text-amber-500" /> Hot
                                </span>
                              )}
                              <h3 className="text-lg font-semibold text-black mb-2">
                                {post.title}
                              </h3>
                            </div>
                            <div className="flex gap-2">
                              <button
                                className={`p-2 rounded-full ${
                                  post.hot === 1
                                    ? "bg-amber-100 text-amber-600"
                                    : "bg-gray-100 text-gray-500"
                                } hover:bg-brand-lavender-light/10`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleHotStatus(post.id, post.hot);
                                }}
                              >
                                {isTogglingHot[post.id] ? (
                                  <svg
                                    className="animate-spin h-5 w-5"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                  >
                                    <circle
                                      className="opacity-25"
                                      cx="12"
                                      cy="12"
                                      r="10"
                                      stroke="currentColor"
                                      strokeWidth="4"
                                    ></circle>
                                    <path
                                      className="opacity-75"
                                      fill="currentColor"
                                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    ></path>
                                  </svg>
                                ) : post.hot === 1 ? (
                                  <FaSnowflake className="h-5 w-5" />
                                ) : (
                                  <FaFire className="h-5 w-5" />
                                )}
                              </button>
                              <button className="text-brand-accent p-2 rounded-full hover:bg-brand-lavender-light/10">
                                {expandedPosts[post.id] ? (
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-5 w-5"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                ) : (
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-5 w-5"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                )}
                              </button>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 text-sm text-brand-text-secondary">
                            <div className="flex items-center gap-1">
                              <FaCalendarAlt className="opacity-70" />
                              {formatDate(post.publishedAt)}
                            </div>
                            {post.author && (
                              <div className="flex items-center gap-1">
                                <FaUser className="opacity-70" />
                                {post.author}
                              </div>
                            )}
                            {post.tags && post.tags.length > 0 && (
                              <div className="flex items-center gap-1">
                                <FaTag className="opacity-70" />
                                {post.tags.join(", ")}
                              </div>
                            )}
                            <div className="flex items-center gap-1">
                              <FaNewspaper className="opacity-70" />
                              {data?.blogs.find(
                                (blog) => blog.id === post.blogId
                              )?.title || "Unknown Blog"}
                            </div>
                          </div>

                          {post.excerpt && (
                            <div className="text-black mb-4">
                              {post.excerpt}
                            </div>
                          )}

                          {expandedPosts[post.id] && (
                            <div
                              className="mt-4 mb-6 text-black"
                              style={{ color: "black" }}
                              dangerouslySetInnerHTML={{
                                __html: post.content.replace(
                                  /<([a-z][a-z0-9]*)[^>]*>/gi,
                                  (match: string, tag: string) => {
                                    if (
                                      [
                                        "p",
                                        "h1",
                                        "h2",
                                        "h3",
                                        "h4",
                                        "h5",
                                        "h6",
                                        "span",
                                        "strong",
                                        "b",
                                        "div",
                                        "li",
                                        "ul",
                                        "ol",
                                      ].includes(tag.toLowerCase())
                                    ) {
                                      return match.replace(
                                        ">",
                                        ' style="color: black !important;">'
                                      );
                                    }
                                    return match;
                                  }
                                ),
                              }}
                            />
                          )}

                          <div className="flex justify-between items-center border-t border-brand-lavender-light/20 pt-4">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  togglePostExpansion(post.id);
                                }}
                                className="px-4 py-2 bg-brand-accent text-white rounded-lg hover:bg-brand-accent/90 flex items-center gap-1"
                              >
                                {expandedPosts[post.id]
                                  ? "Collapse Article"
                                  : "Expand Article"}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleHotStatus(post.id, post.hot);
                                }}
                                disabled={isTogglingHot[post.id]}
                                className={`px-4 py-2 rounded-lg flex items-center gap-1 ${
                                  post.hot === 1
                                    ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                } ${
                                  isTogglingHot[post.id]
                                    ? "opacity-50 cursor-not-allowed"
                                    : ""
                                }`}
                              >
                                {isTogglingHot[post.id] ? (
                                  <>
                                    <svg
                                      className="animate-spin h-4 w-4 mr-1"
                                      xmlns="http://www.w3.org/2000/svg"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                    >
                                      <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                      ></circle>
                                      <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                      ></path>
                                    </svg>
                                    Processing...
                                  </>
                                ) : post.hot === 1 ? (
                                  <>
                                    <FaSnowflake className="mr-1" /> Remove Hot
                                  </>
                                ) : (
                                  <>
                                    <FaFire className="mr-1" /> Mark as Hot
                                  </>
                                )}
                              </button>
                            </div>
                            <span className="text-xs text-brand-text-secondary">
                              Updated {formatDate(post.updatedAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : activeBlog ? (
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/30 p-6">
                <h2 className="text-xl font-bold text-black mb-1">
                  {activeBlog.title}
                </h2>
                <div className="text-sm text-brand-text-secondary flex items-center gap-4">
                  {activeBlog.updatedAt ? (
                    <span className="flex items-center gap-1">
                      <FaClock className="opacity-70" />
                      Updated {formatDate(activeBlog.updatedAt)}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <FaClock className="opacity-70" />
                      {data?.blogs.length}{" "}
                      {data?.platform === "WordPress"
                        ? "WordPress Posts"
                        : "Blog Posts"}
                    </span>
                  )}
                </div>
              </div>

              {("blogPosts" in activeBlog &&
                activeBlog.blogPosts?.length === 0) ||
              ("content" in activeBlog && activeBlog.content?.length === 0) ? (
                <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/30 p-6">
                  <p className="text-brand-text-secondary">
                    No posts in this blog.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {(() => {
                    // Get the posts array based on blog type
                    let posts: BasePost[] = [];
                    if ("blogPosts" in activeBlog && activeBlog.blogPosts) {
                      posts = activeBlog.blogPosts as unknown as BasePost[];
                    } else if ("content" in activeBlog && activeBlog.content) {
                      posts = activeBlog.content as BasePost[];
                    }
                    console.log("Posts to display:", posts.length);
                    return posts;
                  })()
                    .sort((a: BasePost, b: BasePost) => {
                      // Sort by hot status first (hot posts at the top)
                      if (a.hot === 1 && b.hot !== 1) return -1;
                      if (a.hot !== 1 && b.hot === 1) return 1;
                      // Then sort by date (newest first)
                      return (
                        new Date(b.publishedAt).getTime() -
                        new Date(a.publishedAt).getTime()
                      );
                    })
                    .map((post: BasePost) => (
                      <div
                        key={post.id}
                        className={`bg-white rounded-xl shadow-sm border ${
                          post.hot === 1
                            ? "border-amber-400"
                            : "border-brand-lavender-light/30"
                        } overflow-hidden`}
                      >
                        {post.image && (
                          <div className="w-full h-48 overflow-hidden">
                            <img
                              src={post.image}
                              alt={post.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="p-6">
                          <div
                            className="flex items-center justify-between cursor-pointer"
                            onClick={() => togglePostExpansion(post.id)}
                          >
                            <div className="flex items-center gap-2">
                              {post.hot === 1 && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                  <FaFire className="mr-1 text-amber-500" /> Hot
                                </span>
                              )}
                              <h3 className="text-lg font-semibold text-black mb-2">
                                {post.title}
                              </h3>
                            </div>
                            <div className="flex gap-2">
                              <button
                                className={`p-2 rounded-full ${
                                  post.hot === 1
                                    ? "bg-amber-100 text-amber-600"
                                    : "bg-gray-100 text-gray-500"
                                } hover:bg-brand-lavender-light/10`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleHotStatus(post.id, post.hot);
                                }}
                              >
                                {isTogglingHot[post.id] ? (
                                  <svg
                                    className="animate-spin h-5 w-5"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                  >
                                    <circle
                                      className="opacity-25"
                                      cx="12"
                                      cy="12"
                                      r="10"
                                      stroke="currentColor"
                                      strokeWidth="4"
                                    ></circle>
                                    <path
                                      className="opacity-75"
                                      fill="currentColor"
                                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    ></path>
                                  </svg>
                                ) : post.hot === 1 ? (
                                  <FaSnowflake className="h-5 w-5" />
                                ) : (
                                  <FaFire className="h-5 w-5" />
                                )}
                              </button>
                              <button className="text-brand-accent p-2 rounded-full hover:bg-brand-lavender-light/10">
                                {expandedPosts[post.id] ? (
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-5 w-5"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                ) : (
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-5 w-5"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                )}
                              </button>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 text-sm text-brand-text-secondary">
                            <div className="flex items-center gap-1">
                              <FaCalendarAlt className="opacity-70" />
                              {formatDate(post.publishedAt)}
                            </div>
                            {post.author && (
                              <div className="flex items-center gap-1">
                                <FaUser className="opacity-70" />
                                {post.author}
                              </div>
                            )}
                            {post.tags && post.tags.length > 0 && (
                              <div className="flex items-center gap-1">
                                <FaTag className="opacity-70" />
                                {post.tags.join(", ")}
                              </div>
                            )}
                          </div>

                          {post.excerpt && (
                            <div className="text-black mb-4">
                              {post.excerpt}
                            </div>
                          )}

                          {/* Display full article content when expanded */}
                          {expandedPosts[post.id] && (
                            <div
                              className="mt-4 mb-6 text-black"
                              style={{ color: "black" }}
                              dangerouslySetInnerHTML={{
                                __html: post.content.replace(
                                  /<([a-z][a-z0-9]*)[^>]*>/gi,
                                  (match: string, tag: string) => {
                                    if (
                                      [
                                        "p",
                                        "h1",
                                        "h2",
                                        "h3",
                                        "h4",
                                        "h5",
                                        "h6",
                                        "span",
                                        "strong",
                                        "b",
                                        "div",
                                        "li",
                                        "ul",
                                        "ol",
                                      ].includes(tag.toLowerCase())
                                    ) {
                                      return match.replace(
                                        ">",
                                        ' style="color: black !important;">'
                                      );
                                    }
                                    return match;
                                  }
                                ),
                              }}
                            />
                          )}

                          <div className="flex justify-between items-center border-t border-brand-lavender-light/20 pt-4">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  togglePostExpansion(post.id);
                                }}
                                className="px-4 py-2 bg-brand-accent text-white rounded-lg hover:bg-brand-accent/90 flex items-center gap-1"
                              >
                                {expandedPosts[post.id]
                                  ? "Collapse Article"
                                  : "Expand Article"}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleHotStatus(post.id, post.hot);
                                }}
                                disabled={isTogglingHot[post.id]}
                                className={`px-4 py-2 rounded-lg flex items-center gap-1 ${
                                  post.hot === 1
                                    ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                } ${
                                  isTogglingHot[post.id]
                                    ? "opacity-50 cursor-not-allowed"
                                    : ""
                                }`}
                              >
                                {isTogglingHot[post.id] ? (
                                  <>
                                    <svg
                                      className="animate-spin h-4 w-4 mr-1"
                                      xmlns="http://www.w3.org/2000/svg"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                    >
                                      <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                      ></circle>
                                      <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                      ></path>
                                    </svg>
                                    Processing...
                                  </>
                                ) : post.hot === 1 ? (
                                  <>
                                    <FaSnowflake className="mr-1" /> Remove Hot
                                  </>
                                ) : (
                                  <>
                                    <FaFire className="mr-1" /> Mark as Hot
                                  </>
                                )}
                              </button>
                            </div>
                            <span className="text-xs text-brand-text-secondary">
                              Updated {formatDate(post.updatedAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/30 p-6">
              <p className="text-brand-text-secondary">
                Select a blog from above to view its posts.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
