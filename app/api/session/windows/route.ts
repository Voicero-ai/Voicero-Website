// app/api/session/windows/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cors } from "../../../../lib/cors";

export const runtime = "nodejs"; // 👈 ensures the route is deployed as a Node lambda
export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

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

    const currentSession = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        textOpen: true,
      },
    });

    if (!currentSession) {
      return cors(
        req,
        NextResponse.json({ error: "Session not found" }, { status: 404 })
      );
    }

    const updateData = {
      textOpen: windowState.textOpen ?? currentSession.textOpen,
    };

    const session = await prisma.session.update({
      where: { id: sessionId },
      data: updateData,
      include: {
        threads: {
          include: { messages: true },
          orderBy: { lastMessageAt: "desc" },
        },
      },
    });

    return cors(req, NextResponse.json({ session }));
  } catch (error) {
    console.error("Window state update error:", error);
    return cors(
      req,
      NextResponse.json({ error: "Internal server error" }, { status: 500 })
    );
  }
}
