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
  type?: string | null;
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

    // Check if the thread is an AiThread
    const aiThreadResults = (await query(
      `SELECT t.id, t.threadId, t.createdAt, w.id as website_id, w.url as website_url, 'aithread' as source_type
       FROM AiThread t
       JOIN Website w ON t.websiteId = w.id
       WHERE t.id = ? AND w.userId = ?`,
      [threadId, session.user.id]
    )) as any[];

    // Check if the thread is a TextConversation
    const textThreadResults = (await query(
      `SELECT tc.id, tc.sessionId as thread_id, tc.createdAt, w.id as website_id, w.url as website_url, 'textconversation' as source_type
       FROM TextConversations tc
       JOIN Session s ON tc.sessionId COLLATE utf8mb4_unicode_ci = s.id COLLATE utf8mb4_unicode_ci
       JOIN Website w ON s.websiteId = w.id
       WHERE tc.id = ? AND w.userId = ?`,
      [threadId, session.user.id]
    )) as any[];

    // Check if the thread is a VoiceConversation
    const voiceThreadResults = (await query(
      `SELECT vc.id, vc.sessionId as thread_id, vc.createdAt, w.id as website_id, w.url as website_url, 'voiceconversation' as source_type
       FROM VoiceConversations vc
       JOIN Session s ON vc.sessionId = s.id
       JOIN Website w ON s.websiteId = w.id
       WHERE vc.id = ? AND w.userId = ?`,
      [threadId, session.user.id]
    )) as any[];

    // Combine results
    const threadResults = [
      ...aiThreadResults,
      ...textThreadResults,
      ...voiceThreadResults,
    ];

    if (threadResults.length === 0) {
      return new NextResponse("Thread not found", { status: 404 });
    }

    const threadData = threadResults[0];

    // Get messages for this thread based on its source type
    let messages: AiMessage[] = [];

    if (threadData.source_type === "aithread") {
      messages = (await query(
        `SELECT id, threadId, role, content, createdAt 
         FROM AiMessage 
         WHERE threadId = ? 
         ORDER BY createdAt ASC`,
        [threadId]
      )) as AiMessage[];
    } else if (threadData.source_type === "textconversation") {
      const textMessages = (await query(
        `SELECT id, textConversationId as threadId, 
         CASE WHEN messageType = 'user' THEN 'user' ELSE 'assistant' END as role,
         content, createdAt 
         FROM TextChats 
         WHERE textConversationId = ? 
         ORDER BY createdAt ASC`,
        [threadId]
      )) as any[];

      // Convert to AiMessage format
      messages = textMessages.map((msg) => ({
        ...msg,
        type: msg.role === "user" ? "text" : null,
      }));
    } else if (threadData.source_type === "voiceconversation") {
      const voiceMessages = (await query(
        `SELECT id, voiceConversationId as threadId, 
         CASE WHEN messageType = 'user' THEN 'user' ELSE 'assistant' END as role,
         content, createdAt 
         FROM VoiceChats 
         WHERE voiceConversationId = ? 
         ORDER BY createdAt ASC`,
        [threadId]
      )) as any[];

      // Convert to AiMessage format
      messages = voiceMessages.map((msg) => ({
        ...msg,
        type: msg.role === "user" ? "voice" : null,
      }));
    }

    // Construct the thread object
    const thread: AiThread = {
      id: threadData.id,
      threadId: threadData.threadId || threadData.thread_id,
      createdAt: threadData.createdAt,
      website: {
        id: threadData.website_id,
        url: threadData.website_url,
      },
      messages: messages,
    };

    // Determine the type based on source_type or by looking at the first message
    let sessionType = "text";
    if (threadData.source_type === "voiceconversation") {
      sessionType = "voice";
    } else if (
      messages.length > 0 &&
      messages.some((m) => m.type === "voice")
    ) {
      sessionType = "voice";
    }

    const formattedSession = {
      id: thread.id,
      type: sessionType,
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
