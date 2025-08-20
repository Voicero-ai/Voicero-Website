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
 * Beta Text Session API Route
 *
 * This endpoint retrieves session data and all TextConversations with their most recent text chats.
 * It verifies the Bearer token and returns session information for the authenticated website.
 *
 * Expected Response Format:
 * {
 *   sessionId: string,
 *   websiteId: string,
 *   textConversations: [
 *     {
 *       id: string,
 *       sessionId: string,
 *       createdAt: string,
 *       mostRecentConversationAt: string,
 *       firstConversationAt: string,
 *       conversationDuration: number,
 *       totalMessages: number,
 *       mostRecentChat: {
 *         id: string,
 *         messageType: string,
 *         content: string,
 *         createdAt: string,
 *         responseId: string
 *       }
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

    console.log("getting session data for website", { websiteId });

    // Connect to database
    connection = await mysql.createConnection(dbConfig);

    // Get the most recent session for this website
    const [sessionRows] = await connection.execute(
      "SELECT id, websiteId, createdAt, textOpen FROM Session WHERE websiteId = ? ORDER BY createdAt DESC LIMIT 1",
      [websiteId]
    );

    if (!sessionRows || (sessionRows as any[]).length === 0) {
      return NextResponse.json(
        { error: "No session found for this website" },
        { status: 404 }
      );
    }

    const session = (sessionRows as any[])[0];
    const sessionId = session.id;

    console.log("found session", { sessionId, websiteId });

    // Get all TextConversations for this session
    const [conversationRows] = await connection.execute(
      `SELECT 
        tc.id,
        tc.sessionId,
        tc.createdAt,
        tc.mostRecentConversationAt,
        tc.firstConversationAt,
        tc.conversationDuration,
        tc.totalMessages,
        tc.closed
      FROM TextConversations tc 
      WHERE tc.sessionId = ? 
      ORDER BY tc.mostRecentConversationAt DESC`,
      [sessionId]
    );

    const conversations = (conversationRows as any[]).map((conv) => ({
      id: conv.id,
      sessionId: conv.sessionId,
      createdAt: conv.createdAt,
      mostRecentConversationAt: conv.mostRecentConversationAt,
      firstConversationAt: conv.firstConversationAt,
      conversationDuration: conv.conversationDuration,
      totalMessages: conv.totalMessages,
      closed: conv.closed,
      mostRecentChat: null as any, // Will be populated below
    }));

    console.log("found conversations", { count: conversations.length });

    // For each conversation, get the most recent text chat
    for (let i = 0; i < conversations.length; i++) {
      const conversation = conversations[i];

      const [chatRows] = await connection.execute(
        `SELECT 
          tch.id,
          tch.messageType,
          tch.content,
          tch.createdAt,
          tch.responseId
        FROM TextChats tch 
        WHERE tch.textConversationId = ? 
        ORDER BY tch.createdAt DESC 
        LIMIT 1`,
        [conversation.id]
      );

      if (chatRows && (chatRows as any[]).length > 0) {
        const mostRecentChat = (chatRows as any[])[0];
        conversations[i].mostRecentChat = {
          id: mostRecentChat.id,
          messageType: mostRecentChat.messageType,
          content: mostRecentChat.content,
          createdAt: mostRecentChat.createdAt,
          responseId: mostRecentChat.responseId,
        };
      }
    }

    return NextResponse.json(
      {
        sessionId: sessionId,
        websiteId: websiteId,
        sessionCreatedAt: session.createdAt,
        textOpen: session.textOpen,
        textConversations: conversations,
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
    console.error("Error in session route:", error);
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
