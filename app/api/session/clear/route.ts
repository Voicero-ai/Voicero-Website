import { NextRequest, NextResponse } from "next/server";
import { cors } from "../../../../lib/cors";
import { query } from "../../../../lib/db";

export const dynamic = "force-dynamic";

interface Session {
  id: string;
  websiteId: string;
  textOpen: boolean;
}

interface AiThread {
  id: string;
  threadId: string;
  websiteId: string;
  lastMessageAt: Date;
  messages: AiMessage[];
}

interface AiMessage {
  id: string;
  threadId: string;
  role: string;
  content: string;
  createdAt: Date;
}

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json();

    if (!sessionId) {
      return cors(
        request,
        NextResponse.json({ error: "Session ID is required" }, { status: 400 })
      );
    }

    // Fetch the current session
    const sessions = (await query(
      "SELECT id, websiteId, textOpen FROM Session WHERE id = ?",
      [sessionId]
    )) as Session[];

    if (sessions.length === 0) {
      return cors(
        request,
        NextResponse.json({ error: "Session not found" }, { status: 404 })
      );
    }

    const session = sessions[0];

    // Create a new thread with explicit UUID primary key to avoid PK issues
    const newThreadDbId = crypto.randomUUID();
    const newPublicThreadId = crypto.randomUUID();
    await query(
      "INSERT INTO AiThread (id, threadId, websiteId, createdAt, lastMessageAt) VALUES (?, ?, ?, NOW(), NOW())",
      [newThreadDbId, newPublicThreadId, session.websiteId]
    );

    // Update the session: set textOpen to false
    await query("UPDATE Session SET textOpen = ? WHERE id = ?", [
      false,
      sessionId,
    ]);

    // Connect the new thread to the session
    await query("INSERT INTO _AiThreadToSession (A, B) VALUES (?, ?)", [
      newThreadDbId,
      sessionId,
    ]);

    // Get all threads for this session ordered by lastMessageAt
    const threads = (await query(
      `SELECT t.id, t.threadId, t.websiteId, t.lastMessageAt, t.createdAt
       FROM AiThread t
       JOIN _AiThreadToSession ats ON t.id = ats.A
       WHERE ats.B = ?
       ORDER BY t.lastMessageAt DESC`,
      [sessionId]
    )) as AiThread[];

    // Get messages for all threads
    for (const thread of threads) {
      const messages = (await query(
        "SELECT * FROM AiMessage WHERE threadId = ? ORDER BY createdAt ASC",
        [thread.id]
      )) as AiMessage[];

      thread.messages = messages;
    }

    // Reconstruct the updated session object
    const updatedSession = {
      id: session.id,
      websiteId: session.websiteId,
      textOpen: false,
      threads,
    };

    return cors(request, NextResponse.json({ session: updatedSession }));
  } catch (error) {
    console.error("Session clear error:", error);
    return cors(
      request,
      NextResponse.json({ error: "Internal server error" }, { status: 500 })
    );
  }
}
