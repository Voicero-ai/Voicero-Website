// app/api/session/windows/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { cors } from "../../../../lib/cors";

export const runtime = "nodejs"; // 👈 ensures the route is deployed as a Node lambda
export const dynamic = "force-dynamic";

interface Session {
  id: string;
  textOpen: boolean;
}

interface AiThread {
  id: string;
  threadId: string;
  createdAt: Date;
  lastMessageAt: Date;
  websiteId: string;
  sessionId: string;
}

interface AiMessage {
  id: string;
  threadId: string;
  role: string;
  content: string;
  createdAt: Date;
}

// ---- Pre‑flight -------------------------------------------------
export async function OPTIONS(req: NextRequest) {
  return cors(req, new NextResponse(null, { status: 204 }));
}

// ---- POST  ------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const { sessionId, windowState } = await req.json();
    if (!sessionId || !windowState) {
      return cors(
        req,
        NextResponse.json(
          { error: "Session ID and window state are required" },
          { status: 400 }
        )
      );
    }

    // Track URL movement from referer header
    const refererUrl = req.headers.get("referer");
    if (refererUrl) {
      console.log(
        `Session windows: tracking referer URL ${refererUrl} for session ${sessionId}`
      );
      // URL movement tracking removed
    }

    const currentSessions = (await query(
      "SELECT textOpen FROM Session WHERE id = ?",
      [sessionId]
    )) as Session[];

    if (currentSessions.length === 0) {
      return cors(
        req,
        NextResponse.json({ error: "Session not found" }, { status: 404 })
      );
    }

    const currentSession = currentSessions[0];

    const textOpen = windowState.textOpen ?? currentSession.textOpen;

    // Update session
    await query("UPDATE Session SET textOpen = ? WHERE id = ?", [
      textOpen,
      sessionId,
    ]);

    // Get updated session with threads and messages
    const sessions = (await query(
      "SELECT id, textOpen FROM Session WHERE id = ?",
      [sessionId]
    )) as Session[];

    const threads = (await query(
      "SELECT id, threadId, createdAt, lastMessageAt, websiteId, sessionId FROM AiThread WHERE sessionId = ? ORDER BY lastMessageAt DESC",
      [sessionId]
    )) as AiThread[];

    // Get messages for each thread
    for (let i = 0; i < threads.length; i++) {
      const messages = (await query(
        "SELECT id, threadId, role, content, createdAt FROM AiMessage WHERE threadId = ?",
        [threads[i].id]
      )) as AiMessage[];

      (threads[i] as any).messages = messages;
    }

    const session = {
      ...sessions[0],
      threads,
    };

    return cors(req, NextResponse.json({ session }));
  } catch (error) {
    console.error("Window state update error:", error);
    return cors(
      req,
      NextResponse.json({ error: "Internal server error" }, { status: 500 })
    );
  }
}
