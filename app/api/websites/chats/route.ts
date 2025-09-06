import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import bcrypt from "bcryptjs";

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
  createdAt: Date;
}

interface ChatThread {
  id: string;
  threadId: string;
  title: string | null;
  createdAt: Date;
  lastMessageAt: Date;
  mostRecentConversationAt?: Date;
  websiteId: string;
  website?: Website;
  messages: AiMessage[];
  messageCount?: number;
  source_type?: string; // Can be 'aithread', 'textconversation', or 'voiceconversation'
}

export async function GET(req: Request) {
  try {
    console.log("doing: Starting websites chats API");

    // Get access key from Authorization header
    const authHeader = req.headers.get("authorization");
    let websiteId: string | null = null;
    let userId: string | null = null;

    if (authHeader?.startsWith("Bearer ")) {
      const accessToken = authHeader.substring(7);
      console.log("doing: Validating access token");

      // Get all access keys and check against bcrypt hashes
      const accessKeys = (await query(
        `SELECT ak.key, ak.websiteId, w.userId FROM AccessKey ak
         JOIN Website w ON w.id = ak.websiteId`,
        []
      )) as { key: string; websiteId: string; userId: string }[];

      // Check each access key against the provided token
      for (const accessKey of accessKeys) {
        try {
          let isValid = false;

          // Check if the stored key is a bcrypt hash
          if (
            accessKey.key.startsWith("$2a$") ||
            accessKey.key.startsWith("$2b$")
          ) {
            isValid = await bcrypt.compare(accessToken, accessKey.key);
          } else {
            // Direct string comparison for plain text keys (legacy)
            isValid = accessToken === accessKey.key;
          }

          if (isValid) {
            websiteId = accessKey.websiteId;
            userId = accessKey.userId;
            console.log("done: Found matching access key");
            break;
          }
        } catch (error) {
          console.error("Error comparing access key:", error);
        }
      }
    }

    if (!websiteId || !userId) {
      return new NextResponse("Unauthorized - Invalid access key", {
        status: 401,
      });
    }

    const { searchParams } = new URL(req.url);
    const requestedWebsiteId = searchParams.get("websiteId");
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

    // Clamp limit to prevent huge fetches (max 50 for this endpoint since we're returning full messages)
    if (limit > 50) limit = 50;
    const skip = (page - 1) * limit;

    // Use the websiteId from access key validation, or allow override with query param
    const finalWebsiteId = requestedWebsiteId || websiteId;

    console.log(
      `doing: Getting chats for websiteId: ${finalWebsiteId}, page: ${page}, limit: ${limit}`
    );

    if (!finalWebsiteId) {
      return new NextResponse("Website ID is required", { status: 400 });
    }

    // Verify user owns the requested website
    if (requestedWebsiteId && requestedWebsiteId !== websiteId) {
      return new NextResponse("Access denied - Website not owned by user", {
        status: 403,
      });
    }

    // Build the base query for AiThreads
    let aiThreadQuery = `
      SELECT at.id, at.threadId, at.createdAt, at.lastMessageAt as mostRecentConversationAt,
             'aithread' as source_type, COUNT(am.id) as messageCount 
      FROM AiThread at
      JOIN Website w ON at.websiteId = w.id
      LEFT JOIN AiMessage am ON at.id = am.threadId
      WHERE w.userId = ? AND w.id = ?
    `;

    const queryParams: any[] = [userId, finalWebsiteId];

    // Build the text conversation query
    let textThreadQuery = `
      SELECT tc.id, tc.sessionId as threadId, tc.createdAt, tc.mostRecentConversationAt,
             'textconversation' as source_type, tc.totalMessages as messageCount
      FROM TextConversations tc
      JOIN Session s ON tc.sessionId COLLATE utf8mb4_unicode_ci = s.id COLLATE utf8mb4_unicode_ci
      JOIN Website w ON s.websiteId = w.id
      WHERE w.userId = ? AND w.id = ?
    `;

    // Build the voice conversation query
    let voiceThreadQuery = `
      SELECT vc.id, vc.sessionId as threadId, vc.createdAt, vc.mostRecentConversationAt,
             'voiceconversation' as source_type, vc.totalMessages as messageCount
      FROM VoiceConversations vc
      JOIN Session s ON vc.sessionId = s.id
      JOIN Website w ON s.websiteId = w.id
      WHERE w.userId = ? AND w.id = ?
    `;

    const textParams = [userId, finalWebsiteId];
    const voiceParams = [userId, finalWebsiteId];

    // Add action filter if provided
    let actionFilterQuery = "";
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

    // Add GROUP BY clause to text and voice queries if not empty
    if (textThreadQuery) {
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

    console.log(
      `doing: Processing ${threads.length} threads out of ${totalCount} total`
    );

    // Get website details once (since all threads are from the same website)
    const websites = (await query(
      "SELECT id, url, name FROM Website WHERE id = ?",
      [finalWebsiteId]
    )) as Website[];
    const website = websites[0];

    // For each thread, get the complete messages
    for (const thread of threads) {
      thread.website = website;

      if (thread.source_type === "aithread") {
        // Get messages for AiThread
        const messages = (await query(
          "SELECT content, type, role, createdAt FROM AiMessage WHERE threadId = ? ORDER BY createdAt ASC",
          [thread.id]
        )) as AiMessage[];

        thread.messages = messages;
      } else if (thread.source_type === "textconversation") {
        // Get messages for TextConversation
        const messages = (await query(
          `SELECT content, messageType as type, createdAt,
           CASE WHEN messageType = 'user' THEN 'user' ELSE 'assistant' END as role 
           FROM TextChats WHERE textConversationId = ? ORDER BY createdAt ASC`,
          [thread.id]
        )) as AiMessage[];

        thread.messages = messages;
      } else if (thread.source_type === "voiceconversation") {
        // Get messages for VoiceConversation
        const messageRows = (await query(
          `SELECT content, messageType, createdAt,
           CASE WHEN messageType = 'user' THEN 'user' ELSE 'assistant' END as role 
           FROM VoiceChats WHERE voiceConversationId = ? ORDER BY createdAt ASC`,
          [thread.id]
        )) as any[];

        // Map the messages and explicitly set the type field for voice messages
        const messages = messageRows.map((m) => ({
          content: m.content,
          role: m.role,
          createdAt: m.createdAt,
          // For user messages in voice conversations, explicitly set type to "voice"
          type: m.messageType === "user" ? "voice" : null,
        }));

        thread.messages = messages;
      }

      console.log(
        `done: Loaded ${thread.messages?.length || 0} messages for thread ${
          thread.id
        }`
      );
    }

    // Transform the data to include full message content
    const formattedThreads = threads.map((thread: ChatThread) => {
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

      // Calculate actual message count
      const actualMessageCount = hasMessages ? thread.messages.length : 0;

      return {
        id: thread.id || "unknown-id",
        threadId: thread.threadId,
        type: isVoiceConversation ? "voice" : initialMessage?.type || "text",
        startedAt:
          thread.createdAt instanceof Date
            ? thread.createdAt.toISOString()
            : new Date(thread.createdAt).toISOString(),
        lastMessageAt:
          thread.mostRecentConversationAt instanceof Date
            ? thread.mostRecentConversationAt.toISOString()
            : new Date(
                thread.mostRecentConversationAt || thread.createdAt
              ).toISOString(),
        initialQuery: initialMessage?.content || "New Conversation",
        messageCount: actualMessageCount,
        source_type: thread.source_type,
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
        messages:
          thread.messages?.map((msg) => ({
            content: msg.content,
            type: msg.type,
            role: msg.role,
            createdAt:
              msg.createdAt instanceof Date
                ? msg.createdAt.toISOString()
                : new Date(msg.createdAt).toISOString(),
          })) || [],
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

    console.log(
      `done: Returning ${formattedThreads.length} formatted threads with full messages`
    );

    return NextResponse.json({
      conversations: formattedThreads,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: skip + limit < totalCount,
        hasNext: skip + limit < totalCount,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("[WEBSITES_CHATS_GET]", { error });
    return new NextResponse("Internal error", { status: 500 });
  }
}
