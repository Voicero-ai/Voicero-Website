import { NextRequest, NextResponse } from "next/server";
import * as mysql from "mysql2/promise";
import {
  verifyToken,
  getWebsiteIdFromToken,
} from "../../../../../lib/token-verifier";

export const dynamic = "force-dynamic";

// Database connection
const dbConfig = {
  host: process.env.DATABASE_HOST!,
  user: process.env.DATABASE_USER!,
  password: process.env.DATABASE_PASSWORD!,
  database: process.env.DATABASE_NAME!,
  port: parseInt(process.env.DATABASE_PORT!) || 3306,
  charset: "utf8mb4",
};

/**
 * Beta Text News API Route
 *
 * This endpoint retrieves Shopify blog posts for the authenticated website.
 * It verifies the Bearer token and returns all blog posts associated with that website.
 *
 * Expected Response Format:
 * {
 *   websiteId: string,
 *   blogPosts: [
 *     {
 *       id: string,
 *       shopifyId: number,
 *       title: string,
 *       handle: string,
 *       content: string,
 *       author: string,
 *       image: string,
 *       createdAt: string,
 *       updatedAt: string,
 *       blogId: string,
 *       blogTitle: string,
 *       blogHandle: string,
 *       isPublished: boolean,
 *       publishedAt: string,
 *       summary: string,
 *       tags: json,
 *       templateSuffix: string,
 *       type: string
 *     }
 *   ]
 * }
 */

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function GET(request: NextRequest) {
  let connection;
  try {
    // Verify the Bearer token
    const authHeader = request.headers.get("authorization");
    console.log("authHeader", authHeader);
    const isTokenValid = await verifyToken(authHeader);

    if (!isTokenValid) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid token" },
        { status: 401 }
      );
    }

    // Get the website ID from the verified token
    const websiteId = await getWebsiteIdFromToken(authHeader);

    if (!websiteId) {
      return NextResponse.json(
        { error: "Could not determine website ID from token" },
        { status: 400 }
      );
    }

    console.log("getting news for website", { websiteId });

    // Connect to database
    connection = await mysql.createConnection(dbConfig);

    // Get all Shopify blog posts for this website with blog collection info
    const [blogRows] = await connection.execute(
      `SELECT 
        sbp.id,
        sbp.shopifyId,
        sbp.title,
        sbp.handle,
        sbp.content,
        sbp.author,
        sbp.hot,
        sbp.image,
        sbp.createdAt,
        sbp.updatedAt,
        sbp.blogId,
        sbp.isPublished,
        sbp.publishedAt,
        sbp.summary,
        sbp.tags,
        sbp.templateSuffix,
        sbp.type,
        sb.title as blogTitle,
        sb.handle as blogHandle
      FROM ShopifyBlogPost sbp
      JOIN ShopifyBlog sb ON sbp.blogId = sb.id
      WHERE sbp.websiteId = ? 
      ORDER BY sbp.createdAt DESC`,
      [websiteId]
    );

    let blogPosts = (blogRows as any[]).map((post) => ({
      id: post.id,
      shopifyId: post.shopifyId,
      title: post.title,
      handle: post.handle,
      content: post.content,
      author: post.author,
      hot: post.hot,
      image: post.image,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      blogId: post.blogId,
      blogTitle: post.blogTitle,
      blogHandle: post.blogHandle,
      isPublished: post.isPublished,
      publishedAt: post.publishedAt,
      summary: post.summary,
      tags: post.tags,
      templateSuffix: post.templateSuffix,
      type: post.type,
    }));

    // If no Shopify posts found, check for WordPress posts
    if (blogPosts.length === 0) {
      console.log(
        "doing: No Shopify posts found, checking for WordPress posts"
      );

      const [wpRows] = await connection.execute(
        `SELECT 
          wp.id,
          wp.wpId,
          wp.title,
          wp.slug as handle,
          wp.content,
          wa.name as author,
          wp.hot,
          wp.createdAt,
          wp.updatedAt,
          wp.link,
          wp.excerpt as summary
        FROM WordpressPost wp
        LEFT JOIN WordpressAuthor wa ON wp.authorId = wa.wpId
        WHERE wp.websiteId = ? 
        ORDER BY wp.createdAt DESC`,
        [websiteId]
      );

      blogPosts = (wpRows as any[]).map((post) => ({
        id: post.id,
        shopifyId: post.wpId || null,
        title: post.title,
        handle: post.handle,
        content: post.content,
        author: post.author,
        hot: post.hot,
        image: null,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        blogId: "wordpress-blog",
        blogTitle: "Blog",
        blogHandle: "blog",
        isPublished: true,
        publishedAt: post.createdAt,
        summary: post.summary,
        tags: null,
        templateSuffix: null,
        type: "post",
      }));

      console.log("done: WordPress posts found", { count: blogPosts.length });
    } else {
      console.log("found blog posts", { count: blogPosts.length });
    }

    return NextResponse.json(
      {
        websiteId: websiteId,
        blogPosts: blogPosts,
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      }
    );
  } catch (error) {
    console.error("Error in news route:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
      },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      }
    );
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}
