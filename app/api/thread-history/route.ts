import { NextRequest, NextResponse } from "next/server";
import { cors } from "@/lib/cors";
import { query } from "@/lib/db";
import { verifyToken, getWebsiteIdFromToken } from "@/lib/token-verifier";

export const dynamic = "force-dynamic";

// Define types
interface Website {
  id: string;
}

interface AiThread {
  id: string;
  threadId: string;
  websiteId: string;
  messages: AiMessage[];
}

interface AiMessage {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
}

export async function OPTIONS(request: NextRequest) {
  const response = new NextResponse(null, { status: 204 });
  return cors(request, response);
}

export async function POST(request: NextRequest) {
  try {
    console.log("🚀 Thread history request received");

    // Verify the Bearer token
    const authHeader = request.headers.get("authorization");
    const isTokenValid = await verifyToken(authHeader);

    if (!isTokenValid) {
      console.log("❌ Invalid token");
      return cors(
        request,
        NextResponse.json(
          { error: "Unauthorized - Invalid token" },
          { status: 401 }
        )
      );
    }

    // Get the website ID from the verified token
    const websiteId = await getWebsiteIdFromToken(authHeader);

    if (!websiteId) {
      console.log("❌ Could not determine website ID from token");
      return cors(
        request,
        NextResponse.json(
          { error: "Could not determine website ID from token" },
          { status: 400 }
        )
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

    // Verify website exists
    const websites = (await query(
      `SELECT w.id FROM Website w WHERE w.id = ?`,
      [websiteId]
    )) as Website[];

    if (websites.length === 0) {
      return cors(
        request,
        NextResponse.json({ error: "Website not found" }, { status: 404 })
      );
    }

    const website = websites[0];

    // Find the thread in our database
    const threads = (await query(
      `SELECT * FROM AiThread
       WHERE (id = ? OR threadId = ?) AND websiteId = ?`,
      [threadId, threadId, website.id]
    )) as AiThread[];

    if (threads.length === 0) {
      return cors(
        request,
        NextResponse.json({ error: "Thread not found" }, { status: 404 })
      );
    }

    const aiThread = threads[0];

    // Get messages for the thread
    const messages = (await query(
      `SELECT * FROM AiMessage
       WHERE threadId = ?
       ORDER BY createdAt ASC`,
      [aiThread.id]
    )) as AiMessage[];

    // Assign messages to the thread
    aiThread.messages = messages;

    // Format messages - only include user messages and valid JSON assistant responses
    const formattedMessages = aiThread.messages
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
        messages: formattedMessages.reverse(), // Most recent first
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
