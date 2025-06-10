import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cors } from "../../../../lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

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
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        threads: {
          orderBy: { lastMessageAt: "desc" },
          take: 1,
        },
      },
    });

    if (!session) {
      return cors(
        req,
        NextResponse.json({ error: "Session not found" }, { status: 404 })
      );
    }

    // Get the most recent thread
    if (!session.threads || session.threads.length === 0) {
      return cors(
        req,
        NextResponse.json(
          { error: "No threads found for session" },
          { status: 404 }
        )
      );
    }

    const mostRecentThread = session.threads[0];

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

    const newMessage = await prisma.aiMessage.create({
      data: {
        threadId: mostRecentThread.id,
        role: "assistant",
        content,
        type,
        pageUrl,
        scrollToText,
      },
    });

    // Update the lastMessageAt timestamp of the thread
    await prisma.aiThread.update({
      where: { id: mostRecentThread.id },
      data: { lastMessageAt: new Date() },
    });

    return cors(
      req,
      NextResponse.json({
        success: true,
        message: newMessage,
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
