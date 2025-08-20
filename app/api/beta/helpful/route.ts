import { NextRequest, NextResponse } from "next/server";
import * as mysql from "mysql2/promise";
import { verifyToken, getWebsiteIdFromToken } from '../../../../lib/token-verifier';

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
    const { conversationId, helpful } = await request.json();

    console.log("doing voice helpful request", { conversationId, helpful });

    // Verify the Bearer token
    const authHeader = request.headers.get("authorization");
    console.log("authHeader", authHeader);
    const isTokenValid = await verifyToken(authHeader);

    if (!isTokenValid) {
      console.log("done voice helpful error", { reason: "invalid_token" });
      return NextResponse.json(
        { error: "Unauthorized - Invalid token" },
        { status: 401 }
      );
    }

    const websiteId = await getWebsiteIdFromToken(authHeader);
    if (!websiteId) {
      console.log("done voice helpful error", { reason: "no_website_id" });
      return NextResponse.json(
        { error: "Could not determine website ID from token" },
        { status: 400 }
      );
    }

    console.log("found website", { websiteId });

    // Validate inputs
    if (!conversationId || typeof helpful !== "string") {
      console.log("done voice helpful error", {
        reason: "invalid_inputs",
        conversationId,
        helpful,
      });
      return NextResponse.json(
        { error: "conversationId and helpful are required" },
        { status: 400 }
      );
    }

    const normalizedHelpful =
      helpful.toLowerCase() === "good"
        ? "good"
        : helpful.toLowerCase() === "bad"
        ? "bad"
        : null;
    if (!normalizedHelpful) {
      console.log("done voice helpful error", {
        reason: "invalid_helpful",
        helpful,
      });
      return NextResponse.json(
        { error: "helpful must be 'good' or 'bad'" },
        { status: 400 }
      );
    }

    console.log("normalized helpful", {
      original: helpful,
      normalized: normalizedHelpful,
    });

    // Connect to database
    connection = await mysql.createConnection(dbConfig);
    console.log("connected to database");

    // Ensure the voice conversation belongs to the website in token
    const [convRows] = await connection.execute(
      `SELECT vc.id
       FROM VoiceConversations vc
       JOIN Session s ON vc.sessionId COLLATE utf8mb4_unicode_ci = s.id COLLATE utf8mb4_unicode_ci
       WHERE vc.id = ? AND s.websiteId = ?`,
      [conversationId, websiteId]
    );

    if (!convRows || (convRows as any[]).length === 0) {
      console.log("done voice helpful error", {
        reason: "conversation_not_found",
        conversationId,
        websiteId,
      });
      return NextResponse.json(
        { error: "Conversation not found or access denied" },
        { status: 404 }
      );
    }

    console.log("found voice conversation", { conversationId, websiteId });

    console.log("doing set voice helpful", { conversationId });

    // Update conversation rated flag and helpful value
    const [updateResult] = await connection.execute(
      `UPDATE VoiceConversations SET rated = true, helpful = ? WHERE id = ?`,
      [normalizedHelpful, conversationId]
    );

    console.log("updated voice conversation", {
      affectedRows: (updateResult as any)?.affectedRows,
    });

    const affectedRows = (updateResult as any)?.affectedRows ?? 0;
    if (affectedRows === 0) {
      console.log("done voice helpful error", {
        reason: "conversation_update_failed",
        conversationId,
      });
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    console.log("done set voice helpful", {
      conversationId,
      helpful: normalizedHelpful,
    });

    return NextResponse.json(
      {
        success: true,
        conversationId,
        helpful: normalizedHelpful,
        rated: true,
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
    console.error("Error in voice helpful route:", error);
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
      console.log("closed database connection");
    }
  }
}
