import { NextRequest, NextResponse } from "next/server";
import * as mysql from "mysql2/promise";
import { verifyToken, getWebsiteIdFromToken } from "@/lib/token-verifier";

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
 * Beta Text Conversation API Route
 *
 * This endpoint retrieves all TextChats for a specific conversation.
 * It verifies the Bearer token and returns all chat messages for the given conversationId.
 *
 * Expected Request Body:
 * {
 *   conversationId: string
 * }
 *
 * Expected Response Format:
 * {
 *   conversationId: string,
 *   sessionId: string,
 *   textChats: [
 *     {
 *       id: string,
 *       messageType: string,
 *       content: string,
 *       createdAt: string,
 *       responseId: string,
 *       action: string,
 *       actionType: string,
 *       research: string,
 *       researchContext: string,
 *       foundAnswer: number
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

export async function POST(request: NextRequest) {
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

    // Parse request body
    const { conversationId } = await request.json();

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }

    console.log("getting conversation data", { conversationId, websiteId });

    // Connect to database
    connection = await mysql.createConnection(dbConfig);

    // First verify the conversation belongs to a session for this website
    const [conversationRows] = await connection.execute(
      `SELECT tc.id, tc.sessionId, tc.closed, s.websiteId 
       FROM TextConversations tc 
       JOIN Session s ON tc.sessionId COLLATE utf8mb4_unicode_ci = s.id COLLATE utf8mb4_unicode_ci 
       WHERE tc.id = ? AND s.websiteId = ?`,
      [conversationId, websiteId]
    );

    if (!conversationRows || (conversationRows as any[]).length === 0) {
      return NextResponse.json(
        { error: "Conversation not found or access denied" },
        { status: 404 }
      );
    }

    const conversation = (conversationRows as any[])[0];
    const sessionId = conversation.sessionId;
    const closed = conversation.closed;

    console.log("found conversation", { conversationId, sessionId, websiteId });

    // Get all TextChats for this conversation, ordered by creation time
    const [chatRows] = await connection.execute(
      `SELECT 
        tch.id,
        tch.messageType,
        tch.content,
        tch.createdAt,
        tch.responseId,
        tch.action,
        tch.actionType,
        tch.research,
        tch.researchContext,
        tch.foundAnswer
      FROM TextChats tch 
      WHERE tch.textConversationId = ? 
      ORDER BY tch.createdAt ASC`,
      [conversationId]
    );

    const textChats = (chatRows as any[]).map((chat) => ({
      id: chat.id,
      messageType: chat.messageType,
      content: chat.content,
      createdAt: chat.createdAt,
      responseId: chat.responseId,
      action: chat.action,
      actionType: chat.actionType,
      research: chat.research,
      researchContext: chat.researchContext,
      foundAnswer: chat.foundAnswer,
    }));

    console.log("found text chats", { count: textChats.length });

    return NextResponse.json(
      {
        conversationId: conversationId,
        sessionId: sessionId,
        closed: closed,
        textChats: textChats,
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
    console.error("Error in conversation route:", error);
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
