import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cors } from "../../../lib/cors";
export const dynamic = "force-dynamic";
const prisma = new PrismaClient();

export async function OPTIONS(request: NextRequest) {
  const response = new NextResponse(null, { status: 204 });
  return cors(request, response);
}

export async function POST(request: NextRequest) {
  try {
    console.log("🚀 Thread history request received");

    // Get the authorization header
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.log("❌ Missing or invalid authorization header");
      return cors(
        request,
        NextResponse.json(
          { error: "Missing or invalid authorization header" },
          { status: 401 }
        )
      );
    }

    // Extract the access key
    const accessKey = authHeader.split(" ")[1];
    if (!accessKey) {
      console.log("❌ No access key provided");
      return cors(
        request,
        NextResponse.json({ error: "No access key provided" }, { status: 401 })
      );
    }

    // Get request body
    const { threadId } = await request.json();
    if (!threadId) {
      return cors(
        request,
        NextResponse.json({ error: "Thread ID is required" }, { status: 400 })
      );
    }

    // Verify website access
    const website = await prisma.website.findFirst({
      where: {
        accessKeys: {
          some: {
            key: accessKey,
          },
        },
      },
    });

    if (!website) {
      return cors(
        request,
        NextResponse.json({ error: "Invalid access key" }, { status: 401 })
      );
    }

    // Find the thread in our database
    const aiThread = await prisma.aiThread.findFirst({
      where: {
        OR: [{ id: threadId }, { threadId: threadId }],
        websiteId: website.id,
      },
      include: {
        messages: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!aiThread) {
      return cors(
        request,
        NextResponse.json({ error: "Thread not found" }, { status: 404 })
      );
    }

    // Format messages - only include user messages and valid JSON assistant responses
    const messages = aiThread.messages
      .map((msg) => {
        // For user messages, return as is
        if (msg.role === "user") {
          return {
            role: msg.role,
            content: msg.content,
            createdAt: msg.createdAt,
          };
        }

        // For assistant messages, handle both JSON and plain text responses
        if (msg.role === "assistant") {
          try {
            // Try to parse as JSON first
            if (
              typeof msg.content === "string" &&
              msg.content.trim().startsWith("{")
            ) {
              const parsedContent = JSON.parse(msg.content);
              return {
                role: msg.role,
                content: parsedContent,
                createdAt: msg.createdAt,
              };
            }
            // If not JSON, return content as is
            return {
              role: msg.role,
              content: msg.content,
              createdAt: msg.createdAt,
            };
          } catch (e) {
            // If JSON parsing fails, return the content as is
            return {
              role: msg.role,
              content: msg.content,
              createdAt: msg.createdAt,
            };
          }
        }

        return null;
      })
      .filter(Boolean);

    return cors(
      request,
      NextResponse.json({
        messages: messages.reverse(), // Most recent first
        threadId: aiThread.threadId,
      })
    );
  } catch (error) {
    console.error("❌ Thread history error:", error);
    return cors(
      request,
      NextResponse.json(
        { error: "Failed to fetch thread history" },
        { status: 500 }
      )
    );
  }
}
