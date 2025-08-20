import { NextRequest, NextResponse } from "next/server";
import { cors } from "@/lib/cors";
import { query } from "@/lib/db";
import { verifyToken, getWebsiteIdFromToken } from "@/lib/token-verifier";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import OpenAI from "openai";
export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Define types for our data structures
interface AiMessage {
  id: string;
  role: string;
  content: string;
  type: string | null;
  createdAt: Date;
  threadId: string;
  pageUrl: string | null;
  scrollToText: string | null;
}

interface ShopifyCustomer {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  orders: ShopifyOrder[];
}

interface ShopifyOrder {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  totalAmount: number | null;
  lineItems: ShopifyLineItem[];
}

interface ShopifyLineItem {
  id: string;
  title: string | null;
  quantity: number | null;
}

interface Session {
  id: string;
  shopifyCustomerId: string | null;
  customer: ShopifyCustomer | null;
}

interface AiThread {
  id: string;
  threadId: string;
  title: string | null;
  createdAt: Date;
  lastMessageAt: Date;
  messageCount: number;
  messages: AiMessage[];
  sessions: Session[];
}

// Structured report we now expect from the AI
interface AiHistoryReport {
  ai_usage_analysis: string; // two paragraphs
  chat_review: {
    good_count: number;
    needs_work_count: number;
    good_definition: string;
    needs_work_definition: string;
    good_thread_ids: string[]; // AiThread.id
    needs_work_thread_ids: string[]; // AiThread.id
  };
  whats_working: string[]; // bullets
  pain_points: { title: string; description: string }[];
  quick_wins: string[]; // bullets
  kpi_snapshot: {
    total_threads: number;
    helpful_percent: number; // 0-100
    needs_work_percent: number; // 0-100
    avg_user_messages_when_good: number;
    avg_user_messages_when_bad: number;
  };
}

interface Website {
  id: string;
  analysis: string | null;
  lastAnalysedAt: Date | null;
  allowMultiAIReview: boolean;
}

// Add OPTIONS handler for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    // Support multiple auth modes: session OR bearer token
    const authHeader = request.headers.get("authorization");
    const { searchParams } = new URL(request.url);

    // Parse optional JSON body safely
    let bodyWebsiteId: string | null = null;
    let bodyType: string | null = null;
    try {
      const parsed = await request.json();
      bodyWebsiteId = parsed?.websiteId ?? null;
      bodyType = parsed?.type ?? null;
    } catch (_) {
      // no body provided
    }

    // Accept websiteId from either body or query (?websiteId= / ?id=)
    let websiteId: string | null =
      bodyWebsiteId || searchParams.get("websiteId") || searchParams.get("id");

    // Try session-based auth first
    let userId: string | null = null;
    const session = await getServerSession(authOptions);
    if (session?.user?.email) {
      const users = (await query(
        `SELECT id FROM User WHERE email = ? LIMIT 1`,
        [session.user.email]
      )) as { id: string }[];
      if (users.length > 0) {
        userId = users[0].id;
      }
    }

    if (userId && websiteId) {
      // Verify website ownership for session user
      const ownershipRows = (await query(
        `SELECT id, userId FROM Website WHERE id = ? LIMIT 1`,
        [websiteId]
      )) as { id: string; userId: string }[];
      const owner = ownershipRows[0];
      if (!owner) {
        return cors(
          request,
          NextResponse.json({ error: "Website not found" }, { status: 404 })
        );
      }
      if (owner.userId !== userId) {
        return cors(
          request,
          NextResponse.json(
            { error: "Unauthorized to access this website" },
            { status: 403 }
          )
        );
      }
    } else {
      // Fallback to Bearer token auth
      const isTokenValid = await verifyToken(authHeader);
      if (!isTokenValid) {
        return cors(
          request,
          NextResponse.json(
            {
              error:
                "Unauthorized. Please log in or provide a valid access key.",
            },
            { status: 401 }
          )
        );
      }

      const websiteIdFromToken = await getWebsiteIdFromToken(authHeader);
      if (!websiteIdFromToken) {
        return cors(
          request,
          NextResponse.json(
            { error: "Could not determine website ID from token" },
            { status: 400 }
          )
        );
      }

      if (websiteId && websiteId !== websiteIdFromToken) {
        return cors(
          request,
          NextResponse.json(
            { error: "Unauthorized to access this website" },
            { status: 403 }
          )
        );
      }
      websiteId = websiteIdFromToken;
    }

    if (!websiteId) {
      return cors(
        request,
        NextResponse.json({ error: "Website ID is required" }, { status: 400 })
      );
    }

    const isWordPress = bodyType === "WordPress"; // kept for potential future logic

    // Verify website exists and get website data
    const websites = (await query(`SELECT w.* FROM Website w WHERE w.id = ?`, [
      websiteId,
    ])) as Website[];

    if (!websites.length) {
      return cors(
        request,
        NextResponse.json({ error: "Website not found" }, { status: 404 })
      );
    }

    const website = websites[0];

    // Always generate a new analysis (no caching)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const needsNewAnalysis = true;

    // If we already have an analysis and it's not time for a new one, return it
    if (!needsNewAnalysis && website.analysis) {
      // Fetch threads in the last 30 days for display
      const aiThreads = (await query(
        `SELECT at.*, COUNT(am.id) as messageCount
         FROM AiThread at
         LEFT JOIN AiMessage am ON at.id = am.threadId AND am.createdAt >= ?
         WHERE at.websiteId = ? AND at.lastMessageAt >= ?
         GROUP BY at.id
         ORDER BY at.lastMessageAt DESC`,
        [thirtyDaysAgo, website.id, thirtyDaysAgo]
      )) as AiThread[];

      // For each thread, fetch its messages
      for (const thread of aiThreads) {
        // Get messages
        const messages = (await query(
          `SELECT * FROM AiMessage 
           WHERE threadId = ? AND createdAt >= ?
           ORDER BY createdAt ASC`,
          [thread.id, thirtyDaysAgo]
        )) as AiMessage[];
        thread.messages = messages;

        // Get sessions
        const sessions = (await query(
          `SELECT s.* FROM Session s
           JOIN _AiThreadToSession ats ON s.id = ats.B
           WHERE ats.A = ?`,
          [thread.id]
        )) as Session[];
        thread.sessions = sessions;

        // For each session, get customer if exists
        for (const session of thread.sessions) {
          if (session.shopifyCustomerId) {
            const customers = (await query(
              `SELECT * FROM ShopifyCustomer WHERE id = ?`,
              [session.shopifyCustomerId]
            )) as ShopifyCustomer[];
            session.customer = customers.length ? customers[0] : null;
          } else {
            session.customer = null;
          }
        }
      }

      // Use all threads within the 30-day window
      const windowThreads = aiThreads;
      const recentThreads = windowThreads;

      // Format threads with all their messages
      const formattedThreads = recentThreads.map((thread) => ({
        id: thread.id,
        threadId: thread.threadId,
        title: thread.title || "Untitled Thread",
        createdAt: thread.createdAt,
        lastMessageAt: thread.lastMessageAt,
        messages: thread.messages.map((msg: AiMessage) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          type: msg.type,
          createdAt: msg.createdAt,
          threadId: msg.threadId,
          pageUrl: msg.pageUrl,
          scrollToText: msg.scrollToText,
        })),
        messageCount: thread.messageCount,
        customers: thread.sessions
          .map((session: Session) => session.customer)
          .filter((customer: ShopifyCustomer | null) => customer !== null),
        sessions: thread.sessions.map((session: Session) => ({
          id: session.id,
          customer: session.customer,
        })),
      }));

      // Parse cached analysis as JSON if possible (new structured format)
      let parsedReport: AiHistoryReport | string | null = null;
      try {
        parsedReport = website.analysis
          ? (JSON.parse(website.analysis) as AiHistoryReport)
          : null;
      } catch {
        parsedReport = website.analysis || null;
      }

      return cors(
        request,
        NextResponse.json({
          success: true,
          windowStart: thirtyDaysAgo,
          windowEnd: now,
          threadCount: windowThreads.length,
          threads: formattedThreads,
          report: parsedReport,
          analysis: parsedReport, // legacy alias
          lastAnalysedAt: website.lastAnalysedAt,
        })
      );
    }

    // Fetch threads for the last 30 days for this website with their complete messages
    const aiThreads = (await query(
      `SELECT at.*, COUNT(am.id) as messageCount 
       FROM AiThread at
       LEFT JOIN AiMessage am ON at.id = am.threadId AND am.createdAt >= ?
       WHERE at.websiteId = ? AND at.lastMessageAt >= ?
       GROUP BY at.id
       ORDER BY at.lastMessageAt DESC`,
      [thirtyDaysAgo, website.id, thirtyDaysAgo]
    )) as AiThread[];

    // For each thread, fetch its messages
    for (const thread of aiThreads) {
      // Get messages
      const messages = (await query(
        `SELECT * FROM AiMessage 
         WHERE threadId = ? AND createdAt >= ?
         ORDER BY createdAt ASC`,
        [thread.id, thirtyDaysAgo]
      )) as AiMessage[];
      thread.messages = messages;

      // Get sessions
      const sessions = (await query(
        `SELECT s.* FROM Session s
         JOIN _AiThreadToSession ats ON s.id = ats.B
         WHERE ats.A = ?`,
        [thread.id]
      )) as Session[];
      thread.sessions = sessions;

      // For each session, get customer if exists
      for (const session of thread.sessions) {
        if (session.shopifyCustomerId) {
          const customers = (await query(
            `SELECT * FROM ShopifyCustomer WHERE id = ?`,
            [session.shopifyCustomerId]
          )) as ShopifyCustomer[];
          session.customer = customers.length ? customers[0] : null;
        } else {
          session.customer = null;
        }
      }
    }

    // Use all threads within the 30-day window
    const windowThreads = aiThreads;
    const recentThreads = windowThreads;

    // Format threads with all their messages
    const formattedThreads = recentThreads.map((thread) => ({
      id: thread.id,
      threadId: thread.threadId,
      title: thread.title || "Untitled Thread",
      createdAt: thread.createdAt,
      lastMessageAt: thread.lastMessageAt,
      messages: thread.messages.map((msg: AiMessage) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        type: msg.type,
        createdAt: msg.createdAt,
        threadId: msg.threadId,
        pageUrl: msg.pageUrl,
        scrollToText: msg.scrollToText,
      })),
      messageCount: thread.messageCount,
      customers: thread.sessions
        .map((session: Session) => session.customer)
        .filter((customer: ShopifyCustomer | null) => customer !== null),
      sessions: thread.sessions.map((session: Session) => ({
        id: session.id,
        customer: session.customer,
      })),
    }));

    // NOTE: We no longer need full Shopify customer graphs for this report.

    // Create a strict JSON analysis prompt for GPT-5-mini
    const analysisPrompt = `You are an analytics engine. Analyze the provided AI chat threads (last 30 days only) and return a single JSON object with this exact schema and keys:
{
  "ai_usage_analysis": string, // exactly two concise paragraphs
  "chat_review": {
    "good_count": number,
    "needs_work_count": number,
    "good_definition": string,
    "needs_work_definition": string,
    "good_thread_ids": string[],
    "needs_work_thread_ids": string[]
  },
  "whats_working": string[],
  "pain_points": { "title": string, "description": string }[],
  "quick_wins": string[],
  "kpi_snapshot": {
    "total_threads": number,
    "helpful_percent": number,
    "needs_work_percent": number,
    "avg_user_messages_when_good": number,
    "avg_user_messages_when_bad": number
  }
}

Classification guidance:
- "Good" means the AI provided clear, correct answers, successful task flows, or effective handoffs.
- "Needs-work" means repetition, contradictions, unresolved asks, incorrect info, or visible user frustration.

Constraints:
- Consider only messages inside each thread that fall within the last 30 days window.
- Use the thread's object \`id\` for thread identifiers in arrays.
- Compute averages based on number of user-role messages per thread in each bucket.
- Return only JSON. No markdown, no explanations.

Section semantics:
- "whats_working": Short bullet points describing consistent strengths observed in the last 30 days.
- "quick_wins": Current strengths that are performing exceptionally well right now. Phrase positively as accomplishments (what the AI is doing well), not recommendations. Avoid words like "should", "could", or suggestions in this section.
`;

    // Call GPT-5-mini for structured analysis
    let reportJsonString = "";
    let parsedReport: AiHistoryReport | null = null;
    let analysisErrorMessage: string | null = null;
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content:
              "You output only valid JSON and follow the user's schema exactly. If uncertain, be conservative. Respond ONLY with the JSON object; no extra text.",
          },
          {
            role: "user",
            content: `${analysisPrompt}\n\n### Chat Threads (30 days)\n${JSON.stringify(
              formattedThreads,
              null,
              2
            )}`,
          },
        ],
      });
      reportJsonString = response.choices?.[0]?.message?.content?.trim() || "";
      parsedReport = reportJsonString
        ? (JSON.parse(reportJsonString) as AiHistoryReport)
        : null;

      // Save the structured report JSON and update lastAnalysedAt
      await query(
        `UPDATE Website SET analysis = ?, lastAnalysedAt = ? WHERE id = ?`,
        [reportJsonString || "{}", now, website.id]
      );
    } catch (aiError: any) {
      console.error("AI analysis error:", aiError);
      analysisErrorMessage =
        aiError?.error?.message || aiError?.message || null;
      reportJsonString = "";
      parsedReport = null;
    }

    return cors(
      request,
      NextResponse.json({
        success: true,
        windowStart: thirtyDaysAgo,
        windowEnd: now,
        threadCount: windowThreads.length,
        threads: formattedThreads,
        report:
          parsedReport ??
          (analysisErrorMessage
            ? {
                error: "Failed to generate report",
                message: analysisErrorMessage,
              }
            : { error: "Failed to generate report" }),
        analysis:
          parsedReport ??
          (analysisErrorMessage
            ? {
                error: "Failed to generate report",
                message: analysisErrorMessage,
              }
            : { error: "Failed to generate report" }), // legacy alias
        lastAnalysedAt: now,
      })
    );
  } catch (error: any) {
    console.error("AI history error:", error);
    return cors(
      request,
      NextResponse.json(
        { error: "Failed to retrieve AI threads", details: error.message },
        { status: 500 }
      )
    );
  }
}
