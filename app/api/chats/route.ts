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
  website: Website;
  messages: AiMessage[];
  _count: {
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

    // Build the base query
    let baseQuery = `
      SELECT at.*, COUNT(am.id) as messageCount 
      FROM AiThread at
      JOIN Website w ON at.websiteId = w.id
      LEFT JOIN AiMessage am ON at.id = am.threadId
      WHERE w.userId = ?
    `;

    const queryParams: any[] = [session.user.id];

    // Add websiteId filter if provided
    if (websiteId) {
      baseQuery += " AND w.id = ?";
      queryParams.push(websiteId);
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

      baseQuery += actionFilterQuery;
      queryParams.push(...actionValues);
    }

    // Add group by clause
    baseQuery += " GROUP BY at.id";

    // Add sort order
    if (sort === "recent") {
      baseQuery += " ORDER BY at.lastMessageAt DESC";
    } else if (sort === "oldest") {
      baseQuery += " ORDER BY at.lastMessageAt ASC";
    } else if (sort === "longest") {
      baseQuery += " ORDER BY messageCount DESC";
    } else if (sort === "shortest") {
      baseQuery += " ORDER BY messageCount ASC";
    }

    // Add pagination (inline sanitized integers to avoid driver LIMIT binding issues)
    baseQuery += ` LIMIT ${Math.max(0, Math.floor(limit))} OFFSET ${Math.max(
      0,
      Math.floor(skip)
    )}`;

    // Execute the query to get threads
    const threads = (await query(baseQuery, queryParams)) as any[];

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(DISTINCT at.id) as total
      FROM AiThread at
      JOIN Website w ON at.websiteId = w.id
      WHERE w.userId = ?
    `;

    const countParams = [session.user.id];

    if (websiteId) {
      countQuery += " AND w.id = ?";
      countParams.push(websiteId);
    }

    if (action) {
      countQuery += actionFilterQuery;
      countParams.push(...actionValues);
    }

    const totalCountResult = (await query(countQuery, countParams)) as any[];
    const totalCount = totalCountResult[0]?.total || 0;

    // For each thread, get website and messages
    for (const thread of threads) {
      // Get website details
      const websites = (await query(
        "SELECT id, url, name FROM Website WHERE id = ?",
        [thread.websiteId]
      )) as Website[];

      thread.website = websites[0];

      // Get messages
      const messages = (await query(
        "SELECT content, type, role FROM AiMessage WHERE threadId = ? ORDER BY createdAt ASC",
        [thread.id]
      )) as AiMessage[];

      thread.messages = messages;
      thread._count = { messages: thread.messageCount };
    }

    // Transform the data to match the frontend structure
    const formattedThreads = threads.map((thread: AiThread) => {
      const initialMessage = thread.messages.find((m) => m.role === "user");

      // Check for AI actions in assistant messages
      const hasClick = thread.messages.some(
        (m) => m.role === "assistant" && m.content.includes('"action":"click')
      );
      const hasScroll = thread.messages.some(
        (m) => m.role === "assistant" && m.content.includes('"action":"scroll')
      );
      const hasPurchase = thread.messages.some(
        (m) =>
          m.role === "assistant" && m.content.includes('"action":"purchase')
      );
      const hasRedirect = thread.messages.some(
        (m) =>
          m.role === "assistant" &&
          (m.content.includes('"action":"redirect') ||
            m.content.includes("pageUrl") ||
            m.content.includes("redirect_url") ||
            m.content.includes('url":'))
      );

      return {
        id: thread.id,
        type: initialMessage?.type || "text", // Use the type from the first user message
        startedAt: thread.createdAt.toISOString(),
        initialQuery: initialMessage?.content || "New Conversation",
        messageCount: thread._count.messages,
        website: {
          id: thread.website.id,
          domain: thread.website.url,
          name: thread.website.name,
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
