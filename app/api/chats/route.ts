import { auth } from "../../../lib/auth";
import { NextResponse } from "next/server";
import { query } from "../../../lib/db";

export const dynamic = "force-dynamic";

// Define types for our data structures
interface Website {
  id: string;
  url: string;
  name: string | null;
}

interface AiMessage {
  content: string;
  type: string | null;
  role: string;
}

interface AiThread {
  id: string;
  threadId: string;
  title: string | null;
  createdAt: Date;
  lastMessageAt: Date;
  websiteId: string;
  website?: Website;
  messages: AiMessage[];
  messageCount?: number;
  source_type?: string; // Can be 'aithread', 'textconversation', or 'voiceconversation'
  _count?: {
    messages: number;
  };
}

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const websiteId = searchParams.get("websiteId");
    const action = searchParams.get("action") as
      | "click"
      | "scroll"
      | "purchase"
      | "redirect"
      | null;
    const sort =
      (searchParams.get("sort") as
        | "recent"
        | "oldest"
        | "longest"
        | "shortest") || "recent";
    const pageRaw = parseInt(searchParams.get("page") || "1");
    const limitRaw = parseInt(searchParams.get("limit") || "10");
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    let limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 10;
    // Clamp limit to prevent huge fetches
    if (limit > 100) limit = 100;
    const skip = (page - 1) * limit;

    // Build the base query for AiThreads
    let aiThreadQuery = `
      SELECT at.id, at.threadId, at.createdAt, at.lastMessageAt as mostRecentConversationAt,
             'aithread' as source_type, COUNT(am.id) as messageCount 
      FROM AiThread at
      JOIN Website w ON at.websiteId = w.id
      LEFT JOIN AiMessage am ON at.id = am.threadId
      WHERE w.userId = ?
    `;

    const queryParams: any[] = [session.user.id];

    // Add websiteId filter if provided
    let textThreadQuery = `
      SELECT tc.id, tc.sessionId as threadId, tc.createdAt, tc.mostRecentConversationAt,
             'textconversation' as source_type, tc.totalMessages as messageCount
      FROM TextConversations tc
      JOIN Session s ON tc.sessionId COLLATE utf8mb4_unicode_ci = s.id COLLATE utf8mb4_unicode_ci
      JOIN Website w ON s.websiteId = w.id
      WHERE w.userId = ?
    `;

    let voiceThreadQuery = `
      SELECT vc.id, vc.sessionId as threadId, vc.createdAt, vc.mostRecentConversationAt,
             'voiceconversation' as source_type, vc.totalMessages as messageCount
      FROM VoiceConversations vc
      JOIN Session s ON vc.sessionId = s.id
      JOIN Website w ON s.websiteId = w.id
      WHERE w.userId = ?
    `;

    const textParams = [session.user.id];
    const voiceParams = [session.user.id];

    // Add websiteId filter if provided
    if (websiteId) {
      aiThreadQuery += " AND w.id = ?";
      textThreadQuery += " AND w.id = ?";
      voiceThreadQuery += " AND w.id = ?";
      queryParams.push(websiteId);
      textParams.push(websiteId);
      voiceParams.push(websiteId);
    }

    // Add action filter if provided
    let actionFilterQuery = "";
    // Precompute action filter values so we can reuse for both queries
    let actionValues: string[] = [];
    if (action) {
      const actionQueries: Record<string, string[]> = {
        click: ['"action":"click'],
        scroll: ['"action":"scroll'],
        purchase: ['"action":"purchase'],
        redirect: ['"action":"redirect', "pageUrl", "redirect_url", 'url":'],
      };

      const actionSearchTerms =
        action === "redirect" ? actionQueries.redirect : actionQueries[action];

      actionFilterQuery =
        " AND EXISTS (SELECT 1 FROM AiMessage am2 WHERE am2.threadId = at.id AND am2.role = 'assistant' AND (";

      const actionConditions: string[] = [];
      actionSearchTerms.forEach((term) => {
        actionConditions.push("am2.content LIKE ?");
        actionValues.push(`%${term}%`);
      });

      actionFilterQuery += actionConditions.join(" OR ");
      actionFilterQuery += "))";

      aiThreadQuery += actionFilterQuery;
      queryParams.push(...actionValues);

      // Skip TextConversations and VoiceConversations if filtering by action
      // since they don't support actions (they would all be filtered out)
      textThreadQuery = "";
      voiceThreadQuery = "";
    }

    // Add group by clause
    aiThreadQuery += " GROUP BY at.id";

    // Add sort order to all queries
    if (sort === "recent") {
      aiThreadQuery += " ORDER BY at.lastMessageAt DESC";
      if (textThreadQuery)
        textThreadQuery += " ORDER BY tc.mostRecentConversationAt DESC";
      if (voiceThreadQuery)
        voiceThreadQuery += " ORDER BY vc.mostRecentConversationAt DESC";
    } else if (sort === "oldest") {
      aiThreadQuery += " ORDER BY at.lastMessageAt ASC";
      if (textThreadQuery)
        textThreadQuery += " ORDER BY tc.mostRecentConversationAt ASC";
      if (voiceThreadQuery)
        voiceThreadQuery += " ORDER BY vc.mostRecentConversationAt ASC";
    } else if (sort === "longest") {
      aiThreadQuery += " ORDER BY messageCount DESC";
      if (textThreadQuery) textThreadQuery += " ORDER BY tc.totalMessages DESC";
      if (voiceThreadQuery)
        voiceThreadQuery += " ORDER BY vc.totalMessages DESC";
    } else if (sort === "shortest") {
      aiThreadQuery += " ORDER BY messageCount ASC";
      if (textThreadQuery) textThreadQuery += " ORDER BY tc.totalMessages ASC";
      if (voiceThreadQuery)
        voiceThreadQuery += " ORDER BY vc.totalMessages ASC";
    }

    // GROUP BY clause must come before ORDER BY in MySQL
    // Add group by clause to text and voice queries if not empty
    if (textThreadQuery) {
      // Move GROUP BY before ORDER BY
      if (textThreadQuery.includes("ORDER BY")) {
        textThreadQuery = textThreadQuery.replace(
          "ORDER BY",
          "GROUP BY tc.id ORDER BY"
        );
      } else {
        textThreadQuery += " GROUP BY tc.id";
      }
    }

    if (voiceThreadQuery) {
      // Move GROUP BY before ORDER BY
      if (voiceThreadQuery.includes("ORDER BY")) {
        voiceThreadQuery = voiceThreadQuery.replace(
          "ORDER BY",
          "GROUP BY vc.id ORDER BY"
        );
      } else {
        voiceThreadQuery += " GROUP BY vc.id";
      }
    }

    // Execute the queries to get threads
    const aiThreads = (await query(aiThreadQuery, queryParams)) as any[];
    const textThreads = textThreadQuery
      ? ((await query(textThreadQuery, textParams)) as any[])
      : [];
    const voiceThreads = voiceThreadQuery
      ? ((await query(voiceThreadQuery, voiceParams)) as any[])
      : [];

    // Combine all results
    const allThreads = [...aiThreads, ...textThreads, ...voiceThreads];

    // Sort combined results according to the sort parameter
    if (sort === "recent") {
      allThreads.sort((a, b) => {
        // Safely handle date conversion
        const dateA =
          a.mostRecentConversationAt instanceof Date
            ? a.mostRecentConversationAt.getTime()
            : new Date(a.mostRecentConversationAt).getTime();
        const dateB =
          b.mostRecentConversationAt instanceof Date
            ? b.mostRecentConversationAt.getTime()
            : new Date(b.mostRecentConversationAt).getTime();
        return dateB - dateA;
      });
    } else if (sort === "oldest") {
      allThreads.sort((a, b) => {
        // Safely handle date conversion
        const dateA =
          a.mostRecentConversationAt instanceof Date
            ? a.mostRecentConversationAt.getTime()
            : new Date(a.mostRecentConversationAt).getTime();
        const dateB =
          b.mostRecentConversationAt instanceof Date
            ? b.mostRecentConversationAt.getTime()
            : new Date(b.mostRecentConversationAt).getTime();
        return dateA - dateB;
      });
    } else if (sort === "longest") {
      allThreads.sort((a, b) => b.messageCount - a.messageCount);
    } else if (sort === "shortest") {
      allThreads.sort((a, b) => a.messageCount - b.messageCount);
    }

    // Apply pagination to the combined results
    const totalCount = allThreads.length;
    const threads = allThreads.slice(skip, skip + limit);

    // We already have the total count from allThreads.length

    // For each thread, get website and messages
    for (const thread of threads) {
      if (thread.source_type === "aithread") {
        // Get website details for AiThread
        const websites = (await query(
          "SELECT id, url, name FROM Website WHERE id = ?",
          [thread.websiteId]
        )) as Website[];

        thread.website = websites[0];

        // Get messages for AiThread
        const messages = (await query(
          "SELECT content, type, role FROM AiMessage WHERE threadId = ? ORDER BY createdAt ASC",
          [thread.id]
        )) as AiMessage[];

        thread.messages = messages;
      } else if (thread.source_type === "textconversation") {
        // Get Session and Website for TextConversation
        const sessionResults = (await query(
          `SELECT s.id, s.websiteId, w.url, w.name
           FROM Session s 
           JOIN Website w ON s.websiteId = w.id
           WHERE s.id = ?`,
          [thread.threadId]
        )) as any[];

        if (sessionResults.length > 0) {
          const sessionData = sessionResults[0];
          thread.website = {
            id: sessionData.websiteId,
            url: sessionData.url,
            name: sessionData.name,
          };

          // Get messages for TextConversation
          const messages = (await query(
            `SELECT content, messageType as type, 
             CASE WHEN messageType = 'user' THEN 'user' ELSE 'assistant' END as role 
             FROM TextChats WHERE textConversationId = ? ORDER BY createdAt ASC`,
            [thread.id]
          )) as AiMessage[];

          thread.messages = messages;
        }
      } else if (thread.source_type === "voiceconversation") {
        // Get Session and Website for VoiceConversation
        const sessionResults = (await query(
          `SELECT s.id, s.websiteId, w.url, w.name
           FROM Session s 
           JOIN Website w ON s.websiteId = w.id
           WHERE s.id = ?`,
          [thread.threadId]
        )) as any[];

        if (sessionResults.length > 0) {
          const sessionData = sessionResults[0];
          thread.website = {
            id: sessionData.websiteId,
            url: sessionData.url,
            name: sessionData.name,
          };

          // Get messages for VoiceConversation and explicitly set voice type for user messages
          const messageRows = (await query(
            `SELECT content, messageType, 
             CASE WHEN messageType = 'user' THEN 'user' ELSE 'assistant' END as role 
             FROM VoiceChats WHERE voiceConversationId = ? ORDER BY createdAt ASC`,
            [thread.id]
          )) as any[];

          // Map the messages and explicitly set the type field for voice messages
          const messages = messageRows.map((m) => ({
            content: m.content,
            role: m.role,
            // For user messages in voice conversations, explicitly set type to "voice"
            type: m.messageType === "user" ? "voice" : null,
          }));

          thread.messages = messages;
        }
      }

      // Set _count for consistent access to message count
      const count = thread.messageCount || 0;
      thread._count = { messages: count };

      // Log the count for debugging
      console.log(
        `Set message count for thread ${thread.id}, type: ${thread.source_type}, count: ${count}`
      );
    }

    // Transform the data to match the frontend structure
    const formattedThreads = threads.map((thread: AiThread) => {
      // Log thread information for debugging
      console.log(
        `Processing thread ${thread.id}, source_type: ${
          thread.source_type
        }, messageCount: ${thread.messageCount || 0}`
      );

      const initialMessage =
        thread.messages && Array.isArray(thread.messages)
          ? thread.messages.find((m) => m.role === "user")
          : undefined;

      // Determine if this is a voice conversation based on source_type
      const isVoiceConversation = thread.source_type === "voiceconversation";

      // Check for AI actions in assistant messages
      const hasMessages = thread.messages && Array.isArray(thread.messages);
      const hasClick = hasMessages
        ? thread.messages.some(
            (m) =>
              m.role === "assistant" &&
              m.content &&
              m.content.includes('"action":"click')
          )
        : false;
      const hasScroll = hasMessages
        ? thread.messages.some(
            (m) =>
              m.role === "assistant" &&
              m.content &&
              m.content.includes('"action":"scroll')
          )
        : false;
      const hasPurchase = hasMessages
        ? thread.messages.some(
            (m) =>
              m.role === "assistant" &&
              m.content &&
              m.content.includes('"action":"purchase')
          )
        : false;
      const hasRedirect = hasMessages
        ? thread.messages.some(
            (m) =>
              m.role === "assistant" &&
              m.content &&
              (m.content.includes('"action":"redirect') ||
                m.content.includes("pageUrl") ||
                m.content.includes("redirect_url") ||
                m.content.includes('url":'))
          )
        : false;

      // Calculate accurate message count by looking at actual messages when possible
      const actualMessageCount = hasMessages
        ? thread.messages.length
        : thread._count?.messages || thread.messageCount || 0;

      // Log message count details
      console.log(
        `Thread ${thread.id}: actual messages: ${
          hasMessages ? thread.messages.length : "N/A"
        }, _count: ${thread._count?.messages || "N/A"}, messageCount: ${
          thread.messageCount || "N/A"
        }`
      );

      return {
        id: thread.id || "unknown-id",
        type: isVoiceConversation ? "voice" : initialMessage?.type || "text", // Override type for voice conversations
        startedAt:
          thread.createdAt instanceof Date
            ? thread.createdAt.toISOString()
            : new Date(thread.createdAt).toISOString(),
        initialQuery: initialMessage?.content || "New Conversation",
        messageCount: actualMessageCount,
        website: thread.website
          ? {
              id: thread.website.id || "unknown",
              domain: thread.website.url || "unknown",
              name: thread.website.name || "Unknown Website",
            }
          : {
              id: "unknown",
              domain: "unknown",
              name: "Unknown Website",
            },
        hasAction:
          hasClick || hasScroll || hasPurchase || hasRedirect
            ? {
                click: hasClick,
                scroll: hasScroll,
                purchase: hasPurchase,
                redirect: hasRedirect,
              }
            : undefined,
      };
    });

    return NextResponse.json({
      sessions: formattedThreads,
      totalCount,
      hasMore: skip + limit < totalCount,
    });
  } catch (error) {
    console.error("[CHATS_GET]", { error });
    return new NextResponse("Internal error", { status: 500 });
  }
}
