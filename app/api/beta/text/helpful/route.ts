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
  let connection: mysql.Connection | undefined;
  try {
    let parsedBody: any;
    try {
      parsedBody = await request.json();
    } catch (e) {
      console.log("done set helpful error", { reason: "invalid_json" });
      return NextResponse.json(
        { error: "Invalid JSON body" },
        {
          status: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        }
      );
    }

    const { chatId, conversationId, helpful } = parsedBody || {};

    // Verify the Bearer token
    const authHeader = request.headers.get("authorization");
    const isTokenValid = await verifyToken(authHeader);

    if (!isTokenValid) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid token" },
        {
          status: 401,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        }
      );
    }

    const websiteId = await getWebsiteIdFromToken(authHeader);
    if (!websiteId) {
      return NextResponse.json(
        { error: "Could not determine website ID from token" },
        {
          status: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        }
      );
    }

    // Validate inputs
    if (!chatId || !conversationId || typeof helpful !== "string") {
      return NextResponse.json(
        {
          error: "chatId, conversationId, and helpful are required",
          missing: {
            chatId: !chatId,
            conversationId: !conversationId,
            helpful: typeof helpful !== "string",
          },
        },
        {
          status: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        }
      );
    }

    const normalizedHelpfulInput = (helpful as string).trim().toLowerCase();
    const normalizedHelpful =
      normalizedHelpfulInput === "good"
        ? "good"
        : normalizedHelpfulInput === "bad"
        ? "bad"
        : null;
    if (!normalizedHelpful) {
      return NextResponse.json(
        { error: "helpful must be 'good' or 'bad'" },
        {
          status: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        }
      );
    }

    // Connect to database
    connection = await mysql.createConnection(dbConfig);

    // Ensure the conversation belongs to the website in token
    const [convRows] = await connection.execute(
      `SELECT tc.id
       FROM TextConversations tc
       JOIN Session s ON tc.sessionId COLLATE utf8mb4_unicode_ci = s.id COLLATE utf8mb4_unicode_ci
       WHERE tc.id = ? AND s.websiteId = ?`,
      [conversationId, websiteId]
    );

    if (!convRows || (convRows as any[]).length === 0) {
      return NextResponse.json(
        { error: "Conversation not found or access denied" },
        {
          status: 404,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        }
      );
    }

    console.log("doing set helpful", { conversationId, chatId });

    // Update conversation rated flag (column is varchar, set to 'true')
    await connection.execute(
      `UPDATE TextConversations SET rated = 'true' WHERE id = ?`,
      [conversationId]
    );

    // Update the chat helpful value, ensure it belongs to the conversation
    const isResponseId =
      typeof chatId === "string" && chatId.startsWith("resp_");
    const updateSql = isResponseId
      ? `UPDATE TextChats SET helpful = ? WHERE responseId = ? AND textConversationId = ?`
      : `UPDATE TextChats SET helpful = ? WHERE id = ? AND textConversationId = ?`;
    const [updateResult] = await connection.execute(updateSql, [
      normalizedHelpful,
      chatId,
      conversationId,
    ]);

    // Confirm the chat update actually affected a row
    const affectedRows = (updateResult as any)?.affectedRows ?? 0;
    if (affectedRows === 0) {
      console.log("done set helpful error", {
        conversationId,
        chatId,
        reason: "chat_not_found",
      });
      return NextResponse.json(
        { error: "Chat not found for this conversation" },
        {
          status: 404,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        }
      );
    }

    console.log("done set helpful", { conversationId, chatId });

    return NextResponse.json(
      {
        success: true,
        chatId,
        conversationId,
        helpful: normalizedHelpful,
        rated: "true",
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
    console.error("Error in helpful route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
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
