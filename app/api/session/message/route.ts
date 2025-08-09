import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cors } from "../../../../lib/cors";
import { query } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Session {
  id: string;
}

interface AiThread {
  id: string;
  threadId: string;
  lastMessageAt: Date;
}

interface AiMessage {
  id: string;
  threadId: string;
  role: string;
  content: string;
  type: string;
  pageUrl: string | null;
  scrollToText: string | null;
  createdAt: Date;
}

// ---- Pre‑flight -------------------------------------------------
export async function OPTIONS(req: NextRequest) {
  return cors(req, new NextResponse(null, { status: 204 }));
}

// ---- POST  ------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const { sessionId, message } = await req.json();

    if (!sessionId || !message) {
      return cors(
        req,
        NextResponse.json(
          { error: "Session ID and message are required" },
          { status: 400 }
        )
      );
    }

    // Find the session
    const sessions = (await query("SELECT id FROM Session WHERE id = ?", [
      sessionId,
    ])) as Session[];

    if (sessions.length === 0) {
      return cors(
        req,
        NextResponse.json({ error: "Session not found" }, { status: 404 })
      );
    }

    // Get the most recent thread
    const threads = (await query(
      `SELECT t.id, t.threadId, t.lastMessageAt 
       FROM AiThread t
       JOIN _AiThreadToSession ats ON t.id = ats.A
       WHERE ats.B = ?
       ORDER BY t.lastMessageAt DESC
       LIMIT 1`,
      [sessionId]
    )) as AiThread[];

    if (threads.length === 0) {
      return cors(
        req,
        NextResponse.json(
          { error: "No threads found for session" },
          { status: 404 }
        )
      );
    }

    const mostRecentThread = threads[0];

    // Create a new assistant message in the thread
    // Handle both string and object message content
    let content: string;
    let type: string = "text";
    let pageUrl: string | null = null;
    let scrollToText: string | null = null;

    if (typeof message === "object" && message !== null) {
      if (message.type) {
        type = message.type;
      }

      if (message.content) {
        content =
          typeof message.content === "string"
            ? message.content
            : JSON.stringify(message.content);
      } else {
        content = JSON.stringify(message);
      }

      if (message.pageUrl) {
        pageUrl = message.pageUrl;
      }

      if (message.scrollToText) {
        scrollToText = message.scrollToText;
      }
    } else {
      content = message;
    }

    // Create a new message
    const messageResult = await query(
      `INSERT INTO AiMessage (threadId, role, content, type, pageUrl, scrollToText)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [mostRecentThread.id, "assistant", content, type, pageUrl, scrollToText]
    );

    const messageId = (messageResult as any).insertId;

    // Update the lastMessageAt timestamp of the thread
    await query("UPDATE AiThread SET lastMessageAt = ? WHERE id = ?", [
      new Date(),
      mostRecentThread.id,
    ]);

    // Get the created message
    const messages = (await query("SELECT * FROM AiMessage WHERE id = ?", [
      messageId,
    ])) as AiMessage[];

    return cors(
      req,
      NextResponse.json({
        success: true,
        message: messages[0],
      })
    );
  } catch (error) {
    console.error("Message attachment error:", error);
    return cors(
      req,
      NextResponse.json({ error: "Internal server error" }, { status: 500 })
    );
  }
}
