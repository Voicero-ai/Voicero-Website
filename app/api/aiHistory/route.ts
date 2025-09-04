import { NextRequest, NextResponse } from "next/server";
import { cors } from "../../../lib/cors";
import { query } from "../../../lib/db";
import {
  verifyToken,
  getWebsiteIdFromToken,
} from "../../../lib/token-verifier";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../lib/auth";
export const dynamic = "force-dynamic";

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
  source_type?: string; // Can be 'aithread', 'textconversation', or 'voiceconversation'
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
  cachedAnalysis: string | null;
  lastAiGeneratedHistory: Date | null;
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

    // Check if we have cached analysis and if it's still fresh (within 10 hours)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Check if cached analysis is fresh (within 10 hours)
    const needsNewAnalysis =
      !website.lastAiGeneratedHistory ||
      new Date(website.lastAiGeneratedHistory).getTime() <
        now.getTime() - 10 * 60 * 60 * 1000;

    // Always serve cached data - AI generation happens in background cron job
    if (website.cachedAnalysis) {
      // Fetch AiThreads in the last 30 days for display
      const aiThreads = (await query(
        `SELECT at.*, COUNT(am.id) as messageCount
         FROM AiThread at
         LEFT JOIN AiMessage am ON at.id = am.threadId AND am.createdAt >= ?
         WHERE at.websiteId = ? AND at.lastMessageAt >= ?
         GROUP BY at.id
         ORDER BY at.lastMessageAt DESC`,
        [thirtyDaysAgo, website.id, thirtyDaysAgo]
      )) as AiThread[];

      // Fetch TextConversations in the last 30 days
      const textConversationRows = (await query(
        `SELECT tc.id, tc.sessionId, tc.createdAt, tc.mostRecentConversationAt as lastMessageAt, 
                tc.totalMessages as messageCount
         FROM TextConversations tc
         JOIN Session s ON tc.sessionId COLLATE utf8mb4_unicode_ci = s.id COLLATE utf8mb4_unicode_ci
         WHERE s.websiteId = ? AND (tc.mostRecentConversationAt >= ? OR tc.createdAt >= ?)
         ORDER BY COALESCE(tc.mostRecentConversationAt, tc.createdAt) DESC`,
        [website.id, thirtyDaysAgo, thirtyDaysAgo]
      )) as any[];

      // Fetch VoiceConversations in the last 30 days
      const voiceConversationRows = (await query(
        `SELECT vc.id, vc.sessionId, vc.createdAt, vc.mostRecentConversationAt as lastMessageAt, 
                vc.totalMessages as messageCount
         FROM VoiceConversations vc
         JOIN Session s ON vc.sessionId = s.id
         WHERE s.websiteId = ? AND (vc.mostRecentConversationAt >= ? OR vc.createdAt >= ?)
         ORDER BY COALESCE(vc.mostRecentConversationAt, vc.createdAt) DESC`,
        [website.id, thirtyDaysAgo, thirtyDaysAgo]
      )) as any[];

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
        // Customer data will be batched later
        thread.source_type = "aithread";
      }

      // Batch fetch all customers for all sessions in one query
      const allSessionCustomerIds = aiThreads
        .flatMap((thread) => thread.sessions)
        .map((session) => session.shopifyCustomerId)
        .filter(Boolean);

      let allCustomers: ShopifyCustomer[] = [];
      if (allSessionCustomerIds.length > 0) {
        allCustomers = (await query(
          `SELECT * FROM ShopifyCustomer WHERE id IN (${allSessionCustomerIds
            .map(() => "?")
            .join(",")})`,
          allSessionCustomerIds
        )) as ShopifyCustomer[];
      }

      // Create customer lookup map
      const customerMap = allCustomers.reduce((acc, customer) => {
        acc[customer.id] = customer;
        return acc;
      }, {} as Record<string, ShopifyCustomer>);

      // Assign customers to sessions
      for (const thread of aiThreads) {
        for (const session of thread.sessions) {
          session.customer = session.shopifyCustomerId
            ? customerMap[session.shopifyCustomerId] || null
            : null;
        }
      }

      // Convert TextConversations to AiThread format - batch fetch messages
      const textThreads: AiThread[] = [];
      const textConvIds = textConversationRows.map((conv) => conv.id);
      let allTextChats: any[] = [];
      if (textConvIds.length > 0) {
        allTextChats = (await query(
          `SELECT id, messageType, content, createdAt, textConversationId as threadId
           FROM TextChats WHERE textConversationId IN (${textConvIds
             .map(() => "?")
             .join(",")}) AND createdAt >= ? 
           ORDER BY textConversationId, createdAt ASC`,
          [...textConvIds, thirtyDaysAgo]
        )) as any[];
      }

      // Group text messages by conversation
      const textMessagesByConv = allTextChats.reduce((acc, msg) => {
        if (!acc[msg.threadId]) acc[msg.threadId] = [];
        acc[msg.threadId].push(msg);
        return acc;
      }, {} as Record<string, any[]>);

      for (const conv of textConversationRows) {
        const chatRows = textMessagesByConv[conv.id] || [];

        const messages: AiMessage[] = chatRows.map((m: any) => ({
          id: m.id,
          threadId: m.threadId,
          role: m.messageType === "user" ? "user" : "assistant",
          content: m.content,
          type: m.messageType === "user" ? "text" : null,
          createdAt: new Date(m.createdAt),
          pageUrl: null,
          scrollToText: null,
        }));

        if (messages.length > 0) {
          // Ensure dates are properly handled
          const createdAt =
            conv.createdAt instanceof Date
              ? conv.createdAt
              : new Date(conv.createdAt);
          const lastMessageAt =
            conv.lastMessageAt instanceof Date
              ? conv.lastMessageAt
              : new Date(
                  conv.lastMessageAt ||
                    conv.mostRecentConversationAt ||
                    conv.createdAt
                );

          textThreads.push({
            id: conv.id,
            threadId: conv.id,
            title: "Text Conversation",
            createdAt: createdAt,
            lastMessageAt: lastMessageAt,
            messageCount: messages.length,
            messages: messages,
            sessions: [],
            source_type: "textconversation", // Add source type for frontend
          });
        }
      }

      // Convert VoiceConversations to AiThread format - batch fetch messages
      const voiceThreads: AiThread[] = [];
      const voiceConvIds = voiceConversationRows.map((conv) => conv.id);
      let allVoiceChats: any[] = [];
      if (voiceConvIds.length > 0) {
        allVoiceChats = (await query(
          `SELECT id, messageType, content, createdAt, voiceConversationId as threadId
           FROM VoiceChats WHERE voiceConversationId IN (${voiceConvIds
             .map(() => "?")
             .join(",")}) AND createdAt >= ? 
           ORDER BY voiceConversationId, createdAt ASC`,
          [...voiceConvIds, thirtyDaysAgo]
        )) as any[];
      }

      // Group voice messages by conversation
      const voiceMessagesByConv = allVoiceChats.reduce((acc, msg) => {
        if (!acc[msg.threadId]) acc[msg.threadId] = [];
        acc[msg.threadId].push(msg);
        return acc;
      }, {} as Record<string, any[]>);

      for (const conv of voiceConversationRows) {
        const chatRows = voiceMessagesByConv[conv.id] || [];

        const messages: AiMessage[] = chatRows.map((m: any) => ({
          id: m.id,
          threadId: m.threadId,
          role: m.messageType === "user" ? "user" : "assistant",
          content: m.content,
          type: m.messageType === "user" ? "voice" : null,
          createdAt: new Date(m.createdAt),
          pageUrl: null,
          scrollToText: null,
        }));

        if (messages.length > 0) {
          // Ensure dates are properly handled
          const createdAt =
            conv.createdAt instanceof Date
              ? conv.createdAt
              : new Date(conv.createdAt);
          const lastMessageAt =
            conv.lastMessageAt instanceof Date
              ? conv.lastMessageAt
              : new Date(
                  conv.lastMessageAt ||
                    conv.mostRecentConversationAt ||
                    conv.createdAt
                );

          voiceThreads.push({
            id: conv.id,
            threadId: conv.id,
            title: "Voice Conversation",
            createdAt: createdAt,
            lastMessageAt: lastMessageAt,
            messageCount: messages.length,
            messages: messages,
            sessions: [],
            source_type: "voiceconversation", // Add source type for frontend
          });
        }
      }

      // Combine all threads
      const windowThreads = [...aiThreads, ...textThreads, ...voiceThreads];

      // Sort by lastMessageAt (most recent first)
      const recentThreads = windowThreads.sort((a, b) => {
        // Safely convert to dates and then compare
        const dateA =
          a.lastMessageAt instanceof Date
            ? a.lastMessageAt.getTime()
            : new Date(a.lastMessageAt).getTime();
        const dateB =
          b.lastMessageAt instanceof Date
            ? b.lastMessageAt.getTime()
            : new Date(b.lastMessageAt).getTime();
        return dateB - dateA;
      });

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
        parsedReport = website.cachedAnalysis
          ? (JSON.parse(website.cachedAnalysis) as AiHistoryReport)
          : null;
      } catch {
        parsedReport = website.cachedAnalysis || null;
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
          lastAnalysedAt: website.lastAiGeneratedHistory,
        })
      );
    }

    // If we reach here, no cached analysis is available
    console.log(`No cached analysis available for website: ${website.id}`);

    // Return message indicating analysis is being generated
    return cors(
      request,
      NextResponse.json({
        success: true,
        windowStart: thirtyDaysAgo,
        windowEnd: now,
        threadCount: 0,
        threads: [],
        report: {
          error: "Analysis not available",
          message:
            "AI history analysis is being generated in the background. Please check back in a few minutes.",
        },
        analysis: {
          error: "Analysis not available",
          message:
            "AI history analysis is being generated in the background. Please check back in a few minutes.",
        },
        lastAnalysedAt: website.lastAiGeneratedHistory,
      })
    );

    // All AI generation logic has been moved to the cron job
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
