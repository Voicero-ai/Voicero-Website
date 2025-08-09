import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../lib/auth";
import { query } from "../../../../lib/db";

export const dynamic = "force-dynamic";

interface AiThread {
  id: string;
  threadId: string;
  createdAt: Date;
  website: {
    id: string;
    url: string;
  };
  messages: AiMessage[];
}

interface AiMessage {
  id: string;
  threadId: string;
  role: string;
  content: string;
  createdAt: Date;
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const threadId = searchParams.get("sessionId");

    if (!threadId) {
      return new NextResponse("Thread ID is required", { status: 400 });
    }

    // Get the thread and check if it belongs to the user
    const threadResults = (await query(
      `SELECT t.id, t.threadId, t.createdAt, w.id as website_id, w.url as website_url 
       FROM AiThread t
       JOIN Website w ON t.websiteId = w.id
       WHERE t.id = ? AND w.userId = ?`,
      [threadId, session.user.id]
    )) as any[];

    if (threadResults.length === 0) {
      return new NextResponse("Thread not found", { status: 404 });
    }

    const threadData = threadResults[0];

    // Get messages for this thread
    const messages = (await query(
      `SELECT id, threadId, role, content, createdAt 
       FROM AiMessage 
       WHERE threadId = ? 
       ORDER BY createdAt ASC`,
      [threadId]
    )) as AiMessage[];

    // Construct the thread object
    const thread: AiThread = {
      id: threadData.id,
      threadId: threadData.threadId,
      createdAt: threadData.createdAt,
      website: {
        id: threadData.website_id,
        url: threadData.website_url,
      },
      messages: messages,
    };

    const formattedSession = {
      id: thread.id,
      type: "text",
      website: {
        id: thread.website.id,
        domain: thread.website.url,
      },
      startedAt:
        thread.createdAt instanceof Date
          ? thread.createdAt.toISOString()
          : new Date(thread.createdAt).toISOString(),
      messages: thread.messages.map((msg) => {
        let content = msg.content;
        let metadata = {
          scrollToText: undefined as string | undefined,
          jsonResponse: undefined as any,
          url: undefined as string | undefined,
        };

        // Handle JSON responses
        try {
          if (typeof content === "string") {
            // Remove JSON code block markers if present
            let jsonContent = content;
            if (content.includes("```json")) {
              jsonContent = content.replace(/```json\n|\n```/g, "");
            }

            const parsed = JSON.parse(jsonContent);
            metadata.jsonResponse = parsed;

            if (parsed.answer) {
              content = parsed.answer;
            }

            // Handle different action types
            if (parsed.action) {
              switch (parsed.action) {
                case "scroll":
                  metadata.scrollToText = parsed.scroll_to_text;
                  break;
                case "redirect":
                case "buy":
                case "update":
                case "remove":
                  metadata.url = parsed.url;
                  break;
              }
            }
          }
        } catch (e) {
          // If parsing fails, use the content as-is (plain text)
          console.log("Message is plain text:", content);
          // Clear metadata for non-JSON responses
          metadata = {
            scrollToText: undefined,
            jsonResponse: undefined,
            url: undefined,
          };
        }

        return {
          id: msg.id,
          type: msg.role as "user" | "ai",
          content: content,
          timestamp:
            msg.createdAt instanceof Date
              ? msg.createdAt.toISOString()
              : new Date(msg.createdAt).toISOString(),
          metadata: Object.values(metadata).some((v) => v !== undefined)
            ? metadata
            : undefined,
        };
      }),
    };

    return NextResponse.json(formattedSession);
  } catch (error) {
    console.error("[CHAT_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
