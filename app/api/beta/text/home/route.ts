import { NextRequest, NextResponse } from "next/server";
import * as mysql from "mysql2/promise";
import { verifyToken, getWebsiteIdFromToken } from '../../../../../lib/token-verifier';

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
 * Beta Text Home API Route
 *
 * This endpoint retrieves:
 * - Popup questions for the authenticated website
 * - Most recent conversation with AI
 * - Top 2 most recent blog posts
 *
 * It verifies the Bearer token and returns data associated with that website.
 *
 * Expected Response Format:
 * {
 *   websiteId: string,
 *   popupQuestions: [
 *     {
 *       id: string,
 *       question: string,
 *       createdAt: string
 *     }
 *   ],
 *   recentConversation: {
 *     conversationId: string,
 *     sessionId: string,
 *     lastMessage: string,
 *     lastMessageTime: string
 *   },
 *   recentBlogPosts: [
 *     {
 *       id: string,
 *       title: string,
 *       content: string,
 *       image: string,
 *       createdAt: string,
 *       handle: string,
 *       blogId: string,
 *       tags: json,
 *       hot: number,
 *       blogTitle: string,
 *       blogHandle: string
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

    console.log("getting home data for website", { websiteId });

    // Connect to database
    connection = await mysql.createConnection(dbConfig);

    // Get popup questions for this website
    const [popupRows] = await connection.execute(
      `SELECT id, question, createdAt 
       FROM PopUpQuestion 
       WHERE websiteId = ? 
       ORDER BY createdAt DESC`,
      [websiteId]
    );

    const popupQuestions = (popupRows as any[]).map((popup) => ({
      id: popup.id,
      question: popup.question,
      createdAt: popup.createdAt,
    }));

    // Get most recent conversation for this website
    const [conversationRows] = await connection.execute(
      `SELECT 
        tc.id as conversationId,
        tc.sessionId,
        tc.closed,
        tch.content as lastMessage,
        tch.createdAt as lastMessageTime
       FROM TextConversations tc 
       JOIN Session s ON tc.sessionId COLLATE utf8mb4_unicode_ci = s.id COLLATE utf8mb4_unicode_ci 
       LEFT JOIN TextChats tch ON tc.id = tch.textConversationId
       WHERE s.websiteId = ? 
       AND tch.id = (
         SELECT MAX(tch2.id) 
         FROM TextChats tch2 
         WHERE tch2.textConversationId = tc.id
       )
       ORDER BY tch.createdAt DESC 
       LIMIT 1`,
      [websiteId]
    );

    let recentConversation = null;
    if (conversationRows && (conversationRows as any[]).length > 0) {
      const conv = (conversationRows as any[])[0];
      recentConversation = {
        conversationId: conv.conversationId,
        sessionId: conv.sessionId,
        closed: conv.closed,
        lastMessage: conv.lastMessage,
        lastMessageTime: conv.lastMessageTime,
      };
    }

    // Get blog posts: hot posts first, then most recent to fill remaining slots
    const [blogRows] = await connection.execute(
      `SELECT 
        sbp.id,
        sbp.title,
        sbp.content,
        sbp.image,
        sbp.createdAt,
        sbp.handle,
        sbp.blogId,
        sbp.tags,
        sbp.hot,
        sb.title as blogTitle,
        sb.handle as blogHandle
       FROM ShopifyBlogPost sbp
       JOIN ShopifyBlog sb ON sbp.blogId = sb.id
       WHERE sbp.websiteId = ? 
       ORDER BY sbp.hot DESC, sbp.createdAt DESC 
       LIMIT 2`,
      [websiteId]
    );

    const recentBlogPosts = (blogRows as any[]).map((post) => ({
      id: post.id,
      title: post.title,
      content: post.content,
      image: post.image,
      createdAt: post.createdAt,
      handle: post.handle,
      blogId: post.blogId,
      tags: post.tags,
      hot: post.hot,
      blogTitle: post.blogTitle,
      blogHandle: post.blogHandle,
    }));

    console.log("found home data", {
      popupCount: popupQuestions.length,
      hasConversation: !!recentConversation,
      blogCount: recentBlogPosts.length,
    });

    return NextResponse.json(
      {
        websiteId: websiteId,
        popupQuestions: popupQuestions,
        recentConversation: recentConversation,
        recentBlogPosts: recentBlogPosts,
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
    console.error("Error in home route:", error);
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
