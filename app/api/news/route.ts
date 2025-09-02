import { NextRequest, NextResponse } from "next/server";
import { cors } from "../../../lib/cors";
import { query } from "../../../lib/db";
import {
  verifyToken,
  getWebsiteIdFromToken,
} from "../../../lib/token-verifier";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../lib/auth";
export const dynamic = "force-dynamic";

// Define types for our data structures
interface ShopifyBlog {
  id: string;
  title: string;
  handle: string;
  url: string;
  createdAt: Date;
  updatedAt: Date;
  blogPosts: ShopifyBlogPost[];
}

interface ShopifyBlogPost {
  id: string;
  title: string;
  handle: string;
  url: string;
  content: string;
  excerpt: string | null;
  image: string | null;
  publishedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  author: string | null;
  tags: string[] | null;
  blogId: string;
}

// WordPress blog interfaces
interface WordPressBlog {
  id: string;
  title: string;
  type: "posts";
  content: WordPressContent[];
}

interface WordPressContent {
  id: number;
  wpId: number;
  title: string;
  slug: string;
  content: string;
  excerpt?: string | null;
  link: string;
  author?: string | null;
  createdAt: Date;
  updatedAt: Date;
  categories?: WordPressCategory[];
  tags?: WordPressTag[];
  type: "post";
  // Additional fields that might be useful for a news/blog API
  url: string;
  handle: string;
  hot: number;
}

interface WordPressCategory {
  id: number;
  wpId: number;
  name: string;
  slug: string;
  description?: string;
}

interface WordPressTag {
  id: number;
  wpId: number;
  name: string;
  slug: string;
}

// Add OPTIONS handler for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    // Support multiple auth modes: session OR bearer token
    const authHeader = request.headers.get("authorization");
    const { searchParams } = new URL(request.url);

    // Parse optional JSON body safely
    let bodyWebsiteId: string | null = null;
    try {
      const parsed = await request.json();
      bodyWebsiteId = parsed?.websiteId ?? null;
    } catch (_) {
      // no body provided
    }

    // Accept websiteId from either body or query (?websiteId= / ?id=)
    let websiteId: string | null =
      bodyWebsiteId || searchParams.get("websiteId") || searchParams.get("id");

    // Try session-based auth first
    let userId: string | null = null;
    const session = await getServerSession(authOptions);
    if (session?.user?.email) {
      const users = (await query(
        `SELECT id FROM User WHERE email = ? LIMIT 1`,
        [session.user.email]
      )) as { id: string }[];
      if (users.length > 0) {
        userId = users[0].id;
      }
    }

    if (userId && websiteId) {
      // Verify website ownership for session user
      const ownershipRows = (await query(
        `SELECT id, userId FROM Website WHERE id = ? LIMIT 1`,
        [websiteId]
      )) as { id: string; userId: string }[];
      const owner = ownershipRows[0];
      if (!owner) {
        return cors(
          request,
          NextResponse.json({ error: "Website not found" }, { status: 404 })
        );
      }
      if (owner.userId !== userId) {
        return cors(
          request,
          NextResponse.json(
            { error: "Unauthorized to access this website" },
            { status: 403 }
          )
        );
      }
    } else {
      // Fallback to Bearer token auth
      const isTokenValid = await verifyToken(authHeader);
      if (!isTokenValid) {
        return cors(
          request,
          NextResponse.json(
            {
              error:
                "Unauthorized. Please log in or provide a valid access key.",
            },
            { status: 401 }
          )
        );
      }

      const websiteIdFromToken = await getWebsiteIdFromToken(authHeader);
      if (!websiteIdFromToken) {
        return cors(
          request,
          NextResponse.json(
            { error: "Could not determine website ID from token" },
            { status: 400 }
          )
        );
      }

      if (websiteId && websiteId !== websiteIdFromToken) {
        return cors(
          request,
          NextResponse.json(
            { error: "Unauthorized to access this website" },
            { status: 403 }
          )
        );
      }
      websiteId = websiteIdFromToken;
    }

    if (!websiteId) {
      return cors(
        request,
        NextResponse.json({ error: "Website ID is required" }, { status: 400 })
      );
    }

    // Verify website exists and get website data
    const websites = (await query(`SELECT w.* FROM Website w WHERE w.id = ?`, [
      websiteId,
    ])) as any[];

    if (!websites.length) {
      return cors(
        request,
        NextResponse.json({ error: "Website not found" }, { status: 404 })
      );
    }

    const website = websites[0];

    // Check if this is a Shopify website
    if (website.type === "Shopify") {
      // Fetch all ShopifyBlogs for this website
      const blogs = (await query(
        `SELECT * FROM ShopifyBlog WHERE websiteId = ? ORDER BY title ASC`,
        [websiteId]
      )) as ShopifyBlog[];

      // For each blog, fetch its posts
      for (const blog of blogs) {
        const posts = (await query(
          `SELECT * FROM ShopifyBlogPost WHERE blogId = ? ORDER BY publishedAt DESC`,
          [blog.id]
        )) as ShopifyBlogPost[];

        blog.blogPosts = posts;
      }

      return cors(
        request,
        NextResponse.json({
          success: true,
          blogs: blogs,
          websiteId: websiteId,
          domain: website.domain || website.url,
          platform: "Shopify",
        })
      );
    } else {
      // Handle WordPress and other non-Shopify websites
      console.log("doing: Fetching WordPress content for website:", websiteId);

      const wordpressBlogs: WordPressBlog[] = [];

      // Fetch WordPress Posts
      const posts = (await query(
        `SELECT p.*, a.name as authorName 
         FROM WordpressPost p 
         LEFT JOIN WordpressAuthor a ON p.authorId = a.wpId 
         WHERE p.websiteId = ? 
         ORDER BY p.updatedAt DESC`,
        [websiteId]
      )) as any[];

      if (posts.length > 0) {
        const postsWithRelations = await Promise.all(
          posts.map(async (post) => {
            // Fetch categories for this post
            const categories = (await query(
              `SELECT c.* FROM WordpressCategory c 
              JOIN _WordpressCategoryToWordpressPost cp ON c.id = cp.A 
              WHERE cp.B = ?`,
              [post.id]
            )) as WordPressCategory[];

            // Fetch tags for this post
            const tags = (await query(
              `SELECT t.* FROM WordpressTag t 
              JOIN _WordpressPostToWordpressTag pt ON t.id = pt.A 
              WHERE pt.B = ?`,
              [post.id]
            )) as WordPressTag[];

            return {
              id: post.id,
              wpId: post.wpId,
              title: post.title,
              slug: post.slug,
              content: post.content,
              excerpt: post.excerpt,
              link: post.link,
              author: post.authorName,
              createdAt: post.createdAt,
              updatedAt: post.updatedAt,
              categories,
              tags,
              type: "post" as const,
              url: `/${post.slug}`,
              handle: post.slug,
              hot: parseInt(post.hot) || 0,
            };
          })
        );

        wordpressBlogs.push({
          id: "posts",
          title: "Blog Posts",
          type: "posts",
          content: postsWithRelations,
        });
      }

      console.log("done: WordPress content fetched", {
        websiteId,
        blogsCount: wordpressBlogs.length,
        totalItems: wordpressBlogs.reduce(
          (sum, blog) => sum + blog.content.length,
          0
        ),
      });

      return cors(
        request,
        NextResponse.json({
          success: true,
          blogs: wordpressBlogs,
          websiteId: websiteId,
          domain: website.domain || website.url,
          platform: "WordPress",
        })
      );
    }
  } catch (error: any) {
    console.error("News content fetch error:", error);
    return cors(
      request,
      NextResponse.json(
        { error: "Failed to retrieve news content", details: error.message },
        { status: 500 }
      )
    );
  }
}
