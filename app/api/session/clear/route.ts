import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cors } from "../../../../lib/cors";

export const dynamic = "force-dynamic";
const prisma = new PrismaClient();

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
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        threads: {
          include: {
            messages: true,
          },
          orderBy: {
            lastMessageAt: "desc",
          },
        },
      },
    });

    if (!session) {
      return cors(
        request,
        NextResponse.json({ error: "Session not found" }, { status: 404 })
      );
    }

    // Create a new thread
    const newThread = await prisma.aiThread.create({
      data: {
        threadId: Date.now().toString(), // Generate a unique thread ID
        websiteId: session.websiteId,
        lastMessageAt: new Date(),
      },
    });

    // Update the session: connect the new thread
    const updatedSession = await prisma.session.update({
      where: {
        id: sessionId,
      },
      data: {
        textOpen: false,
        threads: {
          connect: {
            id: newThread.id,
          },
        },
      },
      include: {
        threads: {
          include: {
            messages: true,
          },
          orderBy: {
            lastMessageAt: "desc",
          },
        },
      },
    });

    return cors(request, NextResponse.json({ session: updatedSession }));
  } catch (error) {
    console.error("Session clear error:", error);
    return cors(
      request,
      NextResponse.json({ error: "Internal server error" }, { status: 500 })
    );
  }
}
