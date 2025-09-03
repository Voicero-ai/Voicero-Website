import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import {
  getWebsiteAIOverview,
  RevenueSummary,
} from "../../../../lib/websiteAIGet";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../../lib/auth";
import { cors } from "../../../../lib/cors";
import {
  verifyToken,
  getWebsiteIdFromToken,
} from "../../../../lib/token-verifier";

export const dynamic = "force-dynamic";

interface Message {
  id: string;
  createdAt: Date;
  content: string;
  type: string | null;
  threadId: string;
  role: string;
  pageUrl: string | null;
  scrollToText: string | null;
}

interface Thread {
  id: string;
  messages: Message[];
}

interface Website {
  id: string;
  url: string;
  name: string | null;
  type: string;
  customType: string;
  plan: string;
  active: boolean;
  monthlyQueries: number;
  queryLimit: number;
  lastSyncedAt: Date | null;
  customInstructions: string | null;
  color: string | null;
  botName: string | null;
  customWelcomeMessage: string | null;
  iconBot: string | null;
  iconVoice: string | null;
  iconMessage: string | null;
  clickMessage: string | null;
  removeHighlight: boolean | null;
  aiThreads: Thread[];
  accessKeys: Array<{ key: string }>;
  popUpQuestions: Array<{
    id: string;
    question: string;
    createdAt: Date;
  }>;
  userId: string;
  allowAutoCancel: boolean | null;
  allowAutoReturn: boolean | null;
  allowAutoExchange: boolean | null;
  allowAutoClick: boolean | null;
  allowAutoScroll: boolean | null;
  allowAutoHighlight: boolean | null;
  allowAutoRedirect: boolean | null;
  allowAutoGetUserOrders: boolean | null;
  allowAutoUpdateUserInfo: boolean | null;
  allowAutoFillForm: boolean | null;
  allowAutoTrackOrder: boolean | null;
  allowAutoLogout: boolean | null;
  allowAutoLogin: boolean | null;
  allowAutoGenerateImage: boolean | null;
  allowMultiAIReview: boolean | null;
  showVoiceAI?: boolean;
  showTextAI?: boolean;
}

export async function GET(request: NextRequest) {
  try {
    console.time("website-get-route");

    // Extract query parameters
    const { searchParams } = new URL(request.url);
    const providedWebsiteId = searchParams.get("id");
    const minimalMode = searchParams.get("minimal") === "true";

    // Get authentication info
    const { userId, websiteId, authError } = await authenticateRequest(
      request,
      providedWebsiteId
    );
    if (authError) {
      return authError;
    }

    // Verify website ownership
    const ownershipCheck = await checkWebsiteOwnership(userId, websiteId);
    if (ownershipCheck.error) {
      return ownershipCheck.error;
    }

    // Fetch website data
    const { website, aiThreads } = await fetchWebsiteData(websiteId);
    if (!website) {
      return NextResponse.json(
        { error: "Website not found." },
        { status: 404 }
      );
    }

    // Initialize stat tracking
    const stats = initializeStats();

    // Filter out empty threads that have no messages
    const validThreads = aiThreads.filter(
      (thread) => thread.messages.length > 0
    );

    // Get accurate count of valid threads with actual messages
    const validThreadCount = validThreads.length;
    console.log(
      `Found ${
        aiThreads.length - validThreadCount
      } empty threads that will be filtered out`
    );
    console.log(
      `Valid thread count: ${validThreadCount}, Current monthlyQueries: ${website.monthlyQueries}`
    );

    // Process threads and calculate stats
    processThreadsAndMessages(validThreads, stats);

    // Fetch and process content based on website type
    const content = await fetchWebsiteContent(website, stats);

    // Build the response (include threads for action drill-down)
    const responseData = buildResponseData(
      website,
      stats,
      content,
      validThreads
    );

    // Compute revenue increase from detected purchases and attach AI overview (last 4 weeks)
    console.time("ai-overview-fetch");
    const aiOverview = await getWebsiteAIOverview(website.id);
    console.timeEnd("ai-overview-fetch");

    // Build revenue summary using site content and detected purchases
    const revenueSummary: RevenueSummary = {
      amount: 0,
      currency: "USD",
      breakdown: { threads: 0, percent_of_total_threads: 0, aov: 0 },
    };

    try {
      console.time("revenue-calc");
      const purchases = (stats as any).purchases as {
        byThread: Map<string, Set<string>>;
        raw: Array<{
          threadId: string;
          url?: string;
          handle?: string;
          productId?: string;
          productName?: string;
          createdAt?: string;
        }>;
      };
      console.log("Revenue Calc: raw purchases:", purchases.raw);
      console.log(
        "Revenue Calc: byThread sizes:",
        Array.from(purchases.byThread.entries()).map(([tid, set]) => ({
          threadId: tid,
          count: set.size,
          keys: Array.from(set.values()).slice(0, 5),
        }))
      );

      // Count unique threads using raw entries to avoid any edge cases
      const threadIdsWithPurchases = Array.from(
        new Set(purchases.raw.map((p) => p.threadId))
      );
      revenueSummary.breakdown.threads = threadIdsWithPurchases.length;
      revenueSummary.breakdown.percent_of_total_threads =
        responseData.globalStats.totalTextChats +
          responseData.globalStats.totalVoiceChats >
        0
          ? Math.round(
              (threadIdsWithPurchases.length /
                (responseData.globalStats.totalTextChats +
                  responseData.globalStats.totalVoiceChats)) *
                100
            )
          : 0;

      // Build price lookups from full content data (contains price/variants)
      const handleToPrice = new Map<string, number>();
      const idToPrice = new Map<string, number>();
      const titleToPrice = new Map<string, number>();
      try {
        const allProducts: any[] = Array.isArray(content?.products)
          ? [...(content.products as any[])]
          : [];
        console.log(
          "Revenue Calc: total products available:",
          allProducts.length
        );
        console.log(
          "Revenue Calc: content.products exists:",
          !!content?.products
        );
        console.log(
          "Revenue Calc: content.products length:",
          content?.products?.length || 0
        );
        if (content?.products?.length > 0) {
          console.log(
            "Revenue Calc: Sample products:",
            content.products.slice(0, 2).map((p) => ({
              title: p.title,
              handle: (p as any).handle || extractHandle(p.url, "products"),
              price: p.price,
            }))
          );
        }
        for (const p of allProducts) {
          const handle: string | undefined =
            p.handle || (p.url ? extractHandle(p.url, "products") : undefined);
          const id: string | undefined = p.id ? String(p.id) : undefined;
          const title: string | undefined = p.title
            ? String(p.title)
            : undefined;
          const price: number | undefined =
            typeof p.price === "number"
              ? p.price
              : typeof p.variants?.[0]?.price === "number"
              ? p.variants[0].price
              : undefined;
          if (typeof price === "number") {
            if (handle) handleToPrice.set(handle.toLowerCase(), price);
            if (id) idToPrice.set(id, price);
            if (title)
              titleToPrice.set(
                title.toLowerCase().replace(/\s+/g, " ").trim(),
                price
              );
          }
        }
        console.log("Revenue Calc: lookup sizes", {
          handleToPrice: handleToPrice.size,
          idToPrice: idToPrice.size,
          titleToPrice: titleToPrice.size,
        });
      } catch {}

      let totalAmount = 0;
      const matchedKeys: Array<{ key: string; price: number }> = [];
      const unmatchedKeys: string[] = [];

      // Debug logging - show some sample lookup keys
      console.log(
        "Revenue Calc: Sample handleToPrice keys:",
        Array.from(handleToPrice.keys()).slice(0, 5)
      );
      console.log(
        "Revenue Calc: Sample titleToPrice keys:",
        Array.from(titleToPrice.keys()).slice(0, 5)
      );
      console.log(
        "Revenue Calc: Total purchases to process:",
        purchases.raw.length
      );

      for (const entry of Array.from(purchases.byThread.entries())) {
        const set = entry[1];
        for (const rawKey of Array.from(set.values())) {
          let price: number | undefined;
          let key = rawKey || "";
          console.log(`Revenue Calc: Trying to match key: "${key}"`);

          // If it's a URL or path, extract handle
          let handle = key.includes("/") ? extractHandle(key, "products") : key;
          if (handle) {
            price = handleToPrice.get(handle.toLowerCase());
            console.log(
              `  - handleToPrice lookup for "${handle.toLowerCase()}": ${price}`
            );
          }
          // Try by id
          if (price === undefined && key) {
            price = idToPrice.get(String(key));
            console.log(`  - idToPrice lookup for "${String(key)}": ${price}`);
          }
          // Try by normalized title
          if (price === undefined && key) {
            const norm = key.toLowerCase().replace(/\s+/g, " ").trim();
            price = titleToPrice.get(norm);
            console.log(`  - titleToPrice lookup for "${norm}": ${price}`);
          }
          // Try by slug/handle version of the title (convert spaces to dashes)
          if (price === undefined && key) {
            const slugVersion = key.toLowerCase().replace(/\s+/g, "-").trim();
            price = handleToPrice.get(slugVersion);
            console.log(
              `  - handleToPrice slug lookup for "${slugVersion}": ${price}`
            );
          }
          // Try exact match with original key
          if (price === undefined && key) {
            price = titleToPrice.get(key);
            console.log(`  - titleToPrice exact lookup for "${key}": ${price}`);
          }
          if (typeof price === "number") {
            matchedKeys.push({ key, price });
            totalAmount += price;
            console.log(`  ✓ MATCHED: ${key} → $${price}`);
          } else {
            unmatchedKeys.push(key);
            console.log(`  ✗ NO MATCH for: ${key}`);
          }
        }
      }
      revenueSummary.amount = Math.round(totalAmount * 100) / 100;
      revenueSummary.breakdown.aov =
        threadIdsWithPurchases.length > 0
          ? Math.round((totalAmount / threadIdsWithPurchases.length) * 100) /
            100
          : 0;
      console.log(
        "Revenue Calc: matched keys sample:",
        matchedKeys.slice(0, 10)
      );
      console.log(
        "Revenue Calc: unmatched keys sample:",
        unmatchedKeys.slice(0, 10)
      );
      console.log("Revenue Calc: totalAmount, AOV, threads:", {
        totalAmount: revenueSummary.amount,
        aov: revenueSummary.breakdown.aov,
        threads: revenueSummary.breakdown.threads,
      });
      console.timeEnd("revenue-calc");
    } catch {}

    (responseData as any).aiOverview = aiOverview;
    (responseData as any).aiOverviewRevenue = revenueSummary;

    console.timeEnd("website-get-route");
    return NextResponse.json(responseData, { status: 200 });
  } catch (err) {
    console.error("Failed to retrieve website data:", err);
    const errorMessage =
      err instanceof Error ? `${err.name}: ${err.message}` : "Unknown error";
    console.error("Error details:", errorMessage);

    if (err instanceof Error && err.stack) {
      console.error("Stack trace:", err.stack);
    }

    return NextResponse.json(
      { error: "Internal server error", details: errorMessage },
      { status: 500 }
    );
  }
}

// Helper Functions

async function authenticateRequest(
  request: NextRequest,
  providedWebsiteId: string | null
) {
  let userId = null;
  let websiteId = providedWebsiteId;

  // Try session-based auth first
  const session = await getServerSession(authOptions);
  if (session?.user?.email) {
    const users = (await query(`SELECT id FROM User WHERE email = ? LIMIT 1`, [
      session.user.email,
    ])) as { id: string }[];
    if (users.length > 0) {
      userId = users[0].id;
    }
  }

  // Fall back to API key auth if session auth fails
  if (!userId) {
    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const isTokenValid = await verifyToken(authHeader);

      if (isTokenValid) {
        const websiteIdFromToken = await getWebsiteIdFromToken(authHeader);

        if (websiteIdFromToken) {
          // Get the website data to find the userId
          const websiteByKeyRows = (await query(
            `SELECT w.id, w.userId
             FROM Website w
             WHERE w.id = ?
             LIMIT 1`,
            [websiteIdFromToken]
          )) as { id: string; userId: string }[];
          const websiteByKey =
            websiteByKeyRows.length > 0 ? websiteByKeyRows[0] : null;

          if (websiteByKey) {
            userId = websiteByKey.userId;
            if (!websiteId) {
              websiteId = websiteByKey.id;
            }
          }
        }
      }
    }
  }

  // Return error if auth failed
  if (!userId) {
    return {
      userId: null,
      websiteId: null,
      authError: NextResponse.json(
        { error: "Unauthorized. Please log in or provide a valid access key." },
        { status: 401 }
      ),
    };
  }

  // Return error if no website ID was found
  if (!websiteId) {
    return {
      userId: null,
      websiteId: null,
      authError: NextResponse.json(
        {
          error: "No website ID provided and no website found for access key.",
        },
        { status: 400 }
      ),
    };
  }

  return { userId, websiteId, authError: null };
}

async function checkWebsiteOwnership(userId: string, websiteId: string) {
  const ownershipRows = (await query(
    `SELECT id FROM Website WHERE id = ? AND userId = ? LIMIT 1`,
    [websiteId, userId]
  )) as { id: string }[];
  const websiteOwnership = ownershipRows.length > 0 ? ownershipRows[0] : null;

  if (!websiteOwnership) {
    console.log(
      `Unauthorized website access attempt: User ID ${userId} trying to access website ID ${websiteId}`
    );
    return {
      error: NextResponse.json(
        { error: "Unauthorized. You don't have access to this website." },
        { status: 403 }
      ),
    };
  }

  return { error: null };
}

async function fetchWebsiteData(websiteId: string) {
  // Fetch basic website data
  const websiteRows = (await query(
    `SELECT id, url, name, type, customType, plan, active, monthlyQueries,
            queryLimit, lastSyncedAt, customInstructions, color, botName,
            customWelcomeMessage, userId, allowAutoCancel, allowAutoReturn,
            allowAutoExchange, allowAutoClick, allowAutoScroll, allowAutoHighlight,
            allowAutoRedirect, allowAutoGetUserOrders, allowAutoUpdateUserInfo,
            allowAutoFillForm, allowAutoTrackOrder, allowAutoLogout, allowAutoLogin,
            allowAutoGenerateImage, showVoiceAI, showTextAI
     FROM Website WHERE id = ? LIMIT 1`,
    [websiteId]
  )) as any[];
  const baseWebsite = websiteRows.length > 0 ? websiteRows[0] : null;

  if (!baseWebsite) {
    return { website: null, aiThreads: [] as Thread[] };
  }

  // Access key (latest)
  const accessKeyRows = (await query(
    `SELECT \`key\`, createdAt FROM AccessKey WHERE websiteId = ? ORDER BY createdAt DESC LIMIT 1`,
    [websiteId]
  )) as { key: string; createdAt: Date }[];
  const accessKeys = accessKeyRows.map((r) => ({ key: r.key }));

  // Pop up questions
  const popUpRows = (await query(
    `SELECT id, question, createdAt FROM PopUpQuestion WHERE websiteId = ? ORDER BY createdAt DESC`,
    [websiteId]
  )) as { id: string; question: string; createdAt: Date }[];
  const popUpQuestions = popUpRows.map((r) => ({
    id: r.id,
    question: r.question,
    createdAt: new Date(r.createdAt),
  }));

  const website = {
    ...baseWebsite,
    active: !!baseWebsite.active,
    removeHighlight: !!baseWebsite.removeHighlight,
    allowAutoCancel: !!baseWebsite.allowAutoCancel,
    allowAutoReturn: !!baseWebsite.allowAutoReturn,
    allowAutoExchange: !!baseWebsite.allowAutoExchange,
    allowAutoClick: !!baseWebsite.allowAutoClick,
    allowAutoScroll: !!baseWebsite.allowAutoScroll,
    allowAutoHighlight: !!baseWebsite.allowAutoHighlight,
    allowAutoRedirect: !!baseWebsite.allowAutoRedirect,
    allowAutoGetUserOrders: !!baseWebsite.allowAutoGetUserOrders,
    allowAutoUpdateUserInfo: !!baseWebsite.allowAutoUpdateUserInfo,
    allowAutoFillForm: !!baseWebsite.allowAutoFillForm,
    allowAutoTrackOrder: !!baseWebsite.allowAutoTrackOrder,
    allowAutoLogout: !!baseWebsite.allowAutoLogout,
    allowAutoLogin: !!baseWebsite.allowAutoLogin,
    allowAutoGenerateImage: !!baseWebsite.allowAutoGenerateImage,
    showVoiceAI: !!baseWebsite.showVoiceAI,
    showTextAI: !!baseWebsite.showTextAI,
    lastSyncedAt: baseWebsite.lastSyncedAt
      ? new Date(baseWebsite.lastSyncedAt)
      : null,
    accessKeys,
    popUpQuestions,
  } as any;

  // Fetch threads separately
  const threadRows = (await query(
    `SELECT id FROM AiThread WHERE websiteId = ? ORDER BY createdAt DESC`,
    [websiteId]
  )) as { id: string }[];

  const aiThreads: Thread[] = [];
  for (const t of threadRows) {
    const messageRows = (await query(
      `SELECT id, createdAt, content, type, threadId, role, pageUrl, scrollToText
       FROM AiMessage WHERE threadId = ? ORDER BY createdAt ASC`,
      [t.id]
    )) as any[];
    const messages: Message[] = messageRows.map((m) => ({
      id: m.id,
      createdAt: new Date(m.createdAt),
      content: m.content,
      type: m.type ?? null,
      threadId: m.threadId,
      role: m.role,
      pageUrl: m.pageUrl ?? null,
      scrollToText: m.scrollToText ?? null,
    }));
    if (messages.length > 0) {
      console.log(`AiThread ${t.id}: ${messages.length} messages`);
      aiThreads.push({ id: t.id, messages });
    }
  }

  // Fetch TextConversations and their TextChats
  const textConversationRows = (await query(
    `SELECT tc.id, tc.sessionId, tc.createdAt, tc.mostRecentConversationAt, 
            tc.firstConversationAt, tc.conversationDuration, tc.totalMessages, tc.closed
     FROM TextConversations tc
     JOIN Session s ON tc.sessionId COLLATE utf8mb4_unicode_ci = s.id COLLATE utf8mb4_unicode_ci
     WHERE s.websiteId = ? ORDER BY tc.mostRecentConversationAt DESC`,
    [websiteId]
  )) as any[];

  console.log(
    `Found ${textConversationRows.length} TextConversations for website ${websiteId}`
  );

  for (const conv of textConversationRows) {
    const chatRows = (await query(
      `SELECT id, messageType, content, createdAt, responseId, textConversationId, action, actionType, research, researchContext
       FROM TextChats WHERE textConversationId = ? ORDER BY createdAt ASC`,
      [conv.id]
    )) as any[];

    const messages: Message[] = chatRows.map(
      (m) =>
        ({
          id: m.id,
          createdAt: new Date(m.createdAt),
          content: m.content,
          type: m.messageType === "user" ? "text" : "ai",
          threadId: conv.id,
          role: m.messageType === "user" ? "user" : "assistant",
          pageUrl: null,
          scrollToText: null,
          // Add action data for processing
          action: m.action,
          actionType: m.actionType,
          research: m.research,
          researchContext: m.researchContext,
        } as any)
    );

    if (messages.length > 0) {
      console.log(`TextConversation ${conv.id}: ${messages.length} messages`);
      aiThreads.push({ id: conv.id, messages });
    }
  }

  // Fetch VoiceConversations and their VoiceChats
  const voiceConversationRows = (await query(
    `SELECT vc.id, vc.sessionId, vc.createdAt, vc.mostRecentConversationAt, 
            vc.firstConversationAt, vc.conversationDuration, vc.totalMessages, vc.closed
     FROM VoiceConversations vc
     JOIN Session s ON vc.sessionId = s.id
     WHERE s.websiteId = ? ORDER BY vc.mostRecentConversationAt DESC`,
    [websiteId]
  )) as any[];

  console.log(
    `Found ${voiceConversationRows.length} VoiceConversations for website ${websiteId}`
  );

  for (const conv of voiceConversationRows) {
    const chatRows = (await query(
      `SELECT id, messageType, content, createdAt, responseId, voiceConversationId, action, actionType, research, researchContext
       FROM VoiceChats WHERE voiceConversationId = ? ORDER BY createdAt ASC`,
      [conv.id]
    )) as any[];

    const messages: Message[] = chatRows.map(
      (m) =>
        ({
          id: m.id,
          createdAt: new Date(m.createdAt),
          content: m.content,
          type: m.messageType === "user" ? "voice" : "ai",
          threadId: conv.id,
          role: m.messageType === "user" ? "user" : "assistant",
          pageUrl: null,
          scrollToText: null,
          // Add action data for processing
          action: m.action,
          actionType: m.actionType,
          research: m.research,
          researchContext: m.researchContext,
        } as any)
    );

    if (messages.length > 0) {
      console.log(`VoiceConversation ${conv.id}: ${messages.length} messages`);
      aiThreads.push({ id: conv.id, messages });
    }
  }

  const totalMessages = aiThreads.reduce(
    (sum, thread) => sum + thread.messages.length,
    0
  );
  const messageTypeBreakdown = aiThreads.reduce((acc, thread) => {
    thread.messages.forEach((msg) => {
      const type = msg.type || "unknown";
      acc[type] = (acc[type] || 0) + 1;
    });
    return acc;
  }, {} as Record<string, number>);

  const roleBreakdown = aiThreads.reduce((acc, thread) => {
    thread.messages.forEach((msg) => {
      const role = msg.role || "unknown";
      acc[role] = (acc[role] || 0) + 1;
    });
    return acc;
  }, {} as Record<string, number>);

  const threadsWithPageUrl = aiThreads.filter((thread) =>
    thread.messages.some((msg) => msg.pageUrl !== null)
  ).length;

  console.log(
    `Total threads after merging: ${aiThreads.length} (AiThreads: ${threadRows.length}, TextConversations: ${textConversationRows.length}, VoiceConversations: ${voiceConversationRows.length})`
  );
  console.log(`Total messages: ${totalMessages}`);
  console.log(`Message type breakdown:`, messageTypeBreakdown);
  console.log(`Role breakdown:`, roleBreakdown);
  console.log(`Threads with pageUrl (AiThreads): ${threadsWithPageUrl}`);

  // Log breakdown by source type
  const sourceBreakdown = {
    aiThreads: threadRows.length,
    textConversations: textConversationRows.length,
    voiceConversations: voiceConversationRows.length,
    total: aiThreads.length,
  };

  // Count messages by source type
  const messageSourceBreakdown = {
    aiThreads: aiThreads
      .filter((t) => t.messages.some((m) => m.pageUrl !== null))
      .reduce((sum, t) => sum + t.messages.length, 0),
    textConversations: aiThreads
      .filter((t) =>
        t.messages.some((m) => m.type === "text" && m.pageUrl === null)
      )
      .reduce((sum, t) => sum + t.messages.length, 0),
    voiceConversations: aiThreads
      .filter((t) =>
        t.messages.some((m) => m.type === "voice" && m.pageUrl === null)
      )
      .reduce((sum, t) => sum + t.messages.length, 0),
  };

  console.log(`Source breakdown:`, sourceBreakdown);
  console.log(`Message source breakdown:`, messageSourceBreakdown);

  // Count user vs assistant messages by source type
  const roleSourceBreakdown = {
    aiThreads: {
      user: aiThreads
        .filter((t) => t.messages.some((m) => m.pageUrl !== null))
        .reduce(
          (sum, t) => sum + t.messages.filter((m) => m.role === "user").length,
          0
        ),
      assistant: aiThreads
        .filter((t) => t.messages.some((m) => m.pageUrl !== null))
        .reduce(
          (sum, t) =>
            sum + t.messages.filter((m) => m.role === "assistant").length,
          0
        ),
    },
    textConversations: {
      user: aiThreads
        .filter((t) =>
          t.messages.some((m) => m.type === "text" && m.pageUrl === null)
        )
        .reduce(
          (sum, t) => sum + t.messages.filter((m) => m.role === "user").length,
          0
        ),
      assistant: aiThreads
        .filter((t) =>
          t.messages.some((m) => m.type === "text" && m.pageUrl === null)
        )
        .reduce(
          (sum, t) =>
            sum + t.messages.filter((m) => m.role === "assistant").length,
          0
        ),
    },
    voiceConversations: {
      user: aiThreads
        .filter((t) =>
          t.messages.some((m) => m.type === "voice" && m.pageUrl === null)
        )
        .reduce(
          (sum, t) => sum + t.messages.filter((m) => m.role === "user").length,
          0
        ),
      assistant: aiThreads
        .filter((t) =>
          t.messages.some((m) => m.type === "voice" && m.pageUrl === null)
        )
        .reduce(
          (sum, t) =>
            sum + t.messages.filter((m) => m.role === "assistant").length,
          0
        ),
    },
  };

  console.log(`Role source breakdown:`, roleSourceBreakdown);

  // Count message types by source
  const typeSourceBreakdown = {
    aiThreads: {
      text: aiThreads
        .filter((t) => t.messages.some((m) => m.pageUrl !== null))
        .reduce(
          (sum, t) => sum + t.messages.filter((m) => m.type === "text").length,
          0
        ),
      voice: aiThreads
        .filter((t) => t.messages.some((m) => m.pageUrl !== null))
        .reduce(
          (sum, t) => sum + t.messages.filter((m) => m.type === "voice").length,
          0
        ),
      ai: aiThreads
        .filter((t) => t.messages.some((m) => m.pageUrl !== null))
        .reduce(
          (sum, t) => sum + t.messages.filter((m) => m.type === "ai").length,
          0
        ),
    },
    textConversations: {
      text: aiThreads
        .filter((t) =>
          t.messages.some((m) => m.type === "text" && m.pageUrl === null)
        )
        .reduce(
          (sum, t) => sum + t.messages.filter((m) => m.type === "text").length,
          0
        ),
      ai: aiThreads
        .filter((t) =>
          t.messages.some((m) => m.type === "text" && m.pageUrl === null)
        )
        .reduce(
          (sum, t) => sum + t.messages.filter((m) => m.type === "ai").length,
          0
        ),
    },
    voiceConversations: {
      voice: aiThreads
        .filter((t) =>
          t.messages.some((m) => m.type === "voice" && m.pageUrl === null)
        )
        .reduce(
          (sum, t) => sum + t.messages.filter((m) => m.type === "voice").length,
          0
        ),
      ai: aiThreads
        .filter((t) =>
          t.messages.some((m) => m.type === "voice" && m.pageUrl === null)
        )
        .reduce(
          (sum, t) => sum + t.messages.filter((m) => m.type === "ai").length,
          0
        ),
    },
  };

  console.log(`Type source breakdown:`, typeSourceBreakdown);

  return { website, aiThreads };
}

function initializeStats() {
  return {
    redirectMaps: {
      productRedirects: new Map<string, number>(),
      collectionRedirects: new Map<string, number>(),
      blogRedirects: new Map<string, number>(),
      pageRedirects: new Map<string, number>(),
      urlRedirectCounts: new Map<string, number>(),
    },
    globalStats: {
      totalAiRedirects: 0,
      totalVoiceChats: 0,
      totalTextChats: 0,
      totalAiScrolls: 0,
      totalAiPurchases: 0,
      totalAiClicks: 0,
    },
    purchases: {
      // Map of threadId -> Set of product identifiers (handles/urls)
      byThread: new Map<string, Set<string>>(),
      raw: [] as Array<{
        threadId: string;
        url?: string;
        handle?: string;
        productId?: string;
        productName?: string;
        createdAt?: string;
      }>,
    },
    actionsDetails: {
      cart: [] as Array<{
        threadId: string;
        actionType: string;
        messageId: string;
        createdAt: string;
      }>,
      movement: [] as Array<{
        threadId: string;
        actionType: string;
        sectionId?: string;
        scrollToText?: string | null;
        url?: string;
        buttonText?: string;
        messageId: string;
        createdAt: string;
      }>,
      orders: [] as Array<{
        threadId: string;
        actionType: string;
        messageId: string;
        createdAt: string;
      }>,
    },
  };
}

function processThreadsAndMessages(aiThreads: Thread[], stats: any) {
  const { redirectMaps, globalStats, purchases, actionsDetails } = stats;

  // Reset counters to ensure they're accurate
  globalStats.totalVoiceChats = 0;
  globalStats.totalTextChats = 0;

  aiThreads.forEach((thread: Thread) => {
    let hasVoiceMessage = false;
    let hasTextMessage = false;
    let hasUserMessage = false;

    // Skip empty threads entirely
    if (thread.messages.length === 0) {
      console.log(`Empty thread found: ${thread.id}`);
      return;
    }

    thread.messages.forEach((message: Message) => {
      // Process user messages for voice/text stats
      if (message.role === "user") {
        hasUserMessage = true;
        if (message.type === "voice") hasVoiceMessage = true;
        if (message.type === "text" || !message.type) hasTextMessage = true;
      }

      // Process assistant messages for actions and redirects
      if (message.role === "assistant") {
        // For AiThread messages (have pageUrl), use existing logic
        if (message.pageUrl !== null) {
          processAssistantMessage(
            message,
            redirectMaps,
            globalStats,
            purchases,
            actionsDetails
          );
        }
        // For TextChat/VoiceChat messages (no pageUrl), process actions from action field
        else if (message.pageUrl === null) {
          console.log(
            `Processing TextChat/VoiceChat message ${message.id} in thread ${
              thread.id
            }: type=${message.type}, role=${message.role}, action=${
              (message as any).action
            }, actionType=${(message as any).actionType}`
          );
          processTextVoiceChatActions(
            message,
            thread.id,
            globalStats,
            purchases,
            actionsDetails
          );
        }
      }
    });

    // Only count threads that have at least one user message
    if (hasUserMessage) {
      // Update global stats for the thread
      if (hasVoiceMessage) globalStats.totalVoiceChats++;
      if (hasTextMessage) globalStats.totalTextChats++;
    }

    // Log thread type for debugging
    if (thread.messages.length > 0) {
      const firstMessage = thread.messages[0];
      console.log(
        `Thread ${thread.id}: type=${firstMessage.type}, role=${firstMessage.role}, pageUrl=${firstMessage.pageUrl}`
      );
    }
  });
}

function normalizeUrl(url: string) {
  try {
    let normalized = url;
    if (url.startsWith("http")) {
      const urlObj = new URL(url);
      normalized = urlObj.pathname;
    }
    // Remove trailing slash and period
    normalized = normalized.replace(/[\/\.]$/, "");
    // Ensure leading slash
    if (!normalized.startsWith("/")) {
      normalized = "/" + normalized;
    }
    return normalized;
  } catch (e) {
    console.error("Error normalizing URL:", url, e);
    return url;
  }
}

function processTextVoiceChatActions(
  message: Message,
  threadId: string,
  globalStats: any,
  purchases?: {
    byThread: Map<string, Set<string>>;
    raw: Array<{
      threadId: string;
      url?: string;
      handle?: string;
      productId?: string;
      productName?: string;
      createdAt?: string;
    }>;
  },
  actionsDetails?: any
) {
  // This function processes actions from TextChats and VoiceChats stored in database columns
  // We need to query the database to get the action information
  // For now, we'll need to extend the Message interface to include action data
  // The action data should be fetched when loading TextChats/VoiceChats in fetchWebsiteData

  // Since the action data isn't available in the current Message interface,
  // we'll extract it from the message content or add it to the query
  // For cart actions: add_to_cart, get_cart, delete_from_cart
  // For movement actions: scroll, highlight, navigate, fill_form (in VoiceChats)
  // For order actions: get_order, track_order, return_order, cancel_order, exchange_order (in TextChats)

  // We'll need to add action data to the message when fetching from database
  // For now, let's add placeholder processing that we can enhance once we update the fetch logic
  const actionData = (message as any).action; // Will be populated once we update the queries
  const actionType = (message as any).actionType;

  // Check if this is a text or voice message to determine which actions to look for
  // We need to check actionData (the action name) not actionType (the action details)
  const isMovementAction = [
    "scroll",
    "highlight",
    "navigate",
    "fill_form",
    "fillForm",
    "click",
  ].includes(actionData);
  const isCartAction = ["add_to_cart", "get_cart", "delete_from_cart"].includes(
    actionData
  );
  const isOrderAction = [
    "get_order",
    "track_order",
    "return_order",
    "cancel_order",
    "exchange_order",
  ].includes(actionData);

  // Also check for voice actions which use different format
  const isVoiceAction =
    actionData === "true" &&
    (actionType === "navigate" || actionType === "click");

  // Debug logging
  if (actionData) {
    console.log(
      `Found action: ${actionData} (type: ${actionType}) for message ${message.id} in thread ${threadId}`
    );
  }

  if (!actionData) {
    return; // No action to process
  }

  // Handle cases where actionType is null but we still have an action
  if (!actionType && actionData) {
    console.log(
      `Found action without actionType: ${actionData} for message ${message.id} - will still process`
    );
  }

  // Process actions based on their category
  if (isCartAction) {
    // Cart actions
    console.log(
      `✅ CART ACTION DETECTED: ${actionData} for thread ${threadId}`
    );
    globalStats.totalAiClicks++; // Using clicks as cart interaction counter

    // Track add_to_cart as purchases for revenue calculations
    if (actionData === "add_to_cart" && purchases && threadId) {
      console.log("Processing add_to_cart for purchase tracking:", {
        actionType,
        actionData,
        threadId,
        purchasesExists: !!purchases,
      });
      try {
        // Parse actionType JSON to extract product info
        let productInfo = null;
        if (typeof actionType === "string" && actionType !== "add_to_cart") {
          productInfo = JSON.parse(actionType);
        } else if ((message as any).actionType) {
          const rawActionType = (message as any).actionType;
          if (typeof rawActionType === "string") {
            try {
              productInfo = JSON.parse(rawActionType);
            } catch {
              // If parsing fails, treat as string
              productInfo = { product_name: rawActionType };
            }
          } else if (typeof rawActionType === "object") {
            productInfo = rawActionType;
          }
        }

        if (productInfo) {
          globalStats.totalAiPurchases++;

          if (!purchases.byThread.has(threadId)) {
            purchases.byThread.set(threadId, new Set<string>());
          }
          const set = purchases.byThread.get(threadId)!;

          // Use product_name as the key for revenue matching
          const key =
            productInfo.product_name || productInfo.productName || "unknown";
          set.add(key);

          purchases.raw.push({
            threadId: threadId,
            productName: key, // Store just the product name, not full JSON
            handle: key.toLowerCase().replace(/\s+/g, "-"), // Create handle for matching
            createdAt: message.createdAt.toISOString(),
          });

          console.log("Purchase tracked from cart action:", {
            threadId: threadId,
            key: key,
            productInfo: productInfo,
          });
        }
      } catch (e) {
        console.error("Error tracking purchase from cart action:", e);
      }
    }

    if (actionsDetails && threadId) {
      actionsDetails.cart.push({
        threadId: threadId,
        messageId: message.id,
        createdAt: message.createdAt.toISOString(),
        actionType: actionType || actionData, // Use actionData if actionType is null
      });
    }
  } else if (isMovementAction || isVoiceAction) {
    // Movement actions (from voice chats)
    if (actionType === "scroll") {
      globalStats.totalAiScrolls++;
    } else {
      globalStats.totalAiClicks++; // Other movement actions count as clicks
    }
    if (actionsDetails && threadId) {
      actionsDetails.movement.push({
        threadId: threadId,
        messageId: message.id,
        createdAt: message.createdAt.toISOString(),
        actionType: actionType || "navigate", // Default for voice actions
        scrollToText:
          actionType === "scroll"
            ? (message as any).scrollToText || null
            : null,
      });
    }
  } else if (isOrderAction) {
    // Order actions (from text chats)
    console.log(
      `✅ ORDER ACTION DETECTED: ${actionData} for thread ${threadId}`
    );
    globalStats.totalAiClicks++; // Count as interactions
    if (actionsDetails && threadId) {
      actionsDetails.orders.push({
        threadId: threadId,
        messageId: message.id,
        createdAt: message.createdAt.toISOString(),
        actionType: actionType || actionData, // Use actionData if actionType is null
      });
    }
  } else if (actionData && !actionType) {
    // Handle actions that have actionData but no actionType (like get_order with null actionType)
    // Try to infer the category based on the action name
    if (
      actionData.includes("order") ||
      [
        "get_order",
        "track_order",
        "return_order",
        "cancel_order",
        "exchange_order",
      ].includes(actionData)
    ) {
      globalStats.totalAiClicks++;
      if (actionsDetails && threadId) {
        actionsDetails.orders.push({
          threadId: threadId,
          messageId: message.id,
          createdAt: message.createdAt.toISOString(),
          actionType: actionData,
        });
      }
    } else if (
      actionData.includes("cart") ||
      ["add_to_cart", "get_cart", "delete_from_cart"].includes(actionData)
    ) {
      globalStats.totalAiClicks++;
      if (actionsDetails && threadId) {
        actionsDetails.cart.push({
          threadId: threadId,
          messageId: message.id,
          createdAt: message.createdAt.toISOString(),
          actionType: actionData,
        });
      }
    } else {
      // Default to movement for unknown actions
      globalStats.totalAiClicks++;
      if (actionsDetails && threadId) {
        actionsDetails.movement.push({
          threadId: threadId,
          messageId: message.id,
          createdAt: message.createdAt.toISOString(),
          actionType: actionData,
        });
      }
    }
  }
}

function processAssistantMessage(
  message: Message,
  redirectMaps: any,
  globalStats: any,
  purchases?: {
    byThread: Map<string, Set<string>>;
    raw: Array<{
      threadId: string;
      url?: string;
      handle?: string;
      productId?: string;
      productName?: string;
      createdAt?: string;
    }>;
  },
  actionsDetails?: any
) {
  const {
    productRedirects,
    collectionRedirects,
    blogRedirects,
    pageRedirects,
    urlRedirectCounts,
  } = redirectMaps;

  // Helper function to count redirects by content type
  const countRedirectByType = (normalizedUrl: string) => {
    if (!normalizedUrl || !normalizedUrl.startsWith("/")) return;

    const parts = normalizedUrl.split("/").filter(Boolean);
    if (parts.length >= 2) {
      let type = parts[0];
      let handle = parts[1];

      // Normalize type to handle both singular and plural
      if (["product", "products"].includes(type)) type = "products";
      else if (["collection", "collections"].includes(type))
        type = "collections";
      else if (["blog", "blogs"].includes(type)) type = "blogs";
      else if (["page", "pages"].includes(type)) type = "pages";

      // Normalize handle
      handle = handle.toLowerCase().replace(/[\/.]+$/, "");

      // Count redirects by content type
      switch (type) {
        case "products":
          productRedirects.set(handle, (productRedirects.get(handle) || 0) + 1);
          break;
        case "collections":
          collectionRedirects.set(
            handle,
            (collectionRedirects.get(handle) || 0) + 1
          );
          break;
        case "blogs":
          const blogHandle = parts[parts.length - 1]
            .toLowerCase()
            .replace(/[\/.]+$/, "");
          blogRedirects.set(
            blogHandle,
            (blogRedirects.get(blogHandle) || 0) + 1
          );
          break;
        case "pages":
          pageRedirects.set(handle, (pageRedirects.get(handle) || 0) + 1);
          break;
      }
    }
  };

  // Process pageUrl if exists
  if (message.pageUrl) {
    // Count redirect once per thread rather than once per message
    if (
      !message.threadId ||
      !urlRedirectCounts.has(`thread:${message.threadId}`)
    ) {
      globalStats.totalAiRedirects++;

      // Mark this thread as already counted
      if (message.threadId) {
        urlRedirectCounts.set(`thread:${message.threadId}`, 1);
      }

      const normalizedUrl = normalizeUrl(message.pageUrl);
      urlRedirectCounts.set(
        normalizedUrl,
        (urlRedirectCounts.get(normalizedUrl) || 0) + 1
      );
      countRedirectByType(normalizedUrl);
    }
  }

  // Try to parse content as JSON for structured actions
  try {
    let contentToProcess = message.content;
    if (contentToProcess.includes("```json")) {
      contentToProcess = contentToProcess.replace(/```json\n|\n```/g, "");
    }

    const contentObj = JSON.parse(contentToProcess);

    // Process structured actions
    if (contentObj.action) {
      switch (contentObj.action) {
        case "redirect":
          if (contentObj.action_context?.url) {
            globalStats.totalAiRedirects++;
            const redirectUrl = contentObj.action_context.url;
            const normalizedUrl = normalizeUrl(redirectUrl);
            urlRedirectCounts.set(
              normalizedUrl,
              (urlRedirectCounts.get(normalizedUrl) || 0) + 1
            );
            countRedirectByType(normalizedUrl);
            if (actionsDetails && message.threadId) {
              actionsDetails.movement.push({
                threadId: message.threadId,
                url: redirectUrl,
                messageId: message.id,
                createdAt: message.createdAt.toISOString(),
                actionType: "redirect",
              });
            }
          }
          break;
        case "scroll":
          globalStats.totalAiScrolls++;
          if (actionsDetails && message.threadId) {
            actionsDetails.movement.push({
              threadId: message.threadId,
              sectionId: contentObj.action_context?.section_id,
              scrollToText: contentObj.action_context?.exact_text ?? null,
              messageId: message.id,
              createdAt: message.createdAt.toISOString(),
              actionType: "scroll",
            });
          }
          break;
        case "purchase":
          globalStats.totalAiPurchases++;
          try {
            const ctx = contentObj.action_context || {};
            const url: string | undefined =
              ctx.url || ctx.product_url || undefined;
            const productHandle = url
              ? extractHandle(url, "products")
              : undefined;
            const productId: string | undefined =
              ctx.product_id || ctx.id || undefined;
            const productName: string | undefined =
              ctx.product_name || ctx.title || undefined;
            console.log("Purchase action detected:", {
              threadId: message.threadId,
              url,
              productHandle,
              productId,
              productName,
            });
            if (purchases && message.threadId) {
              if (!purchases.byThread.has(message.threadId)) {
                purchases.byThread.set(message.threadId, new Set<string>());
              }
              const set = purchases.byThread.get(message.threadId)!;
              // Prefer explicit identifiers in order: handle, id, name, url
              const key =
                productHandle || productId || productName || url || "unknown";
              set.add(key);
              console.log("Purchase recorded with key:", {
                threadId: message.threadId,
                key,
              });
              purchases.raw.push({
                threadId: message.threadId,
                url: url ?? undefined,
                handle: productHandle ?? undefined,
                productId: productId ?? undefined,
                productName: productName ?? undefined,
                createdAt: message.createdAt.toISOString(),
              });
            }
            if (actionsDetails && message.threadId) {
              actionsDetails.cart.push({
                threadId: message.threadId,
                messageId: message.id,
                createdAt: message.createdAt.toISOString(),
                actionType: "purchase",
              });
            }
          } catch {}
          break;
        case "click":
          globalStats.totalAiClicks++;
          if (actionsDetails && message.threadId) {
            actionsDetails.movement.push({
              threadId: message.threadId,
              url: contentObj.action_context?.url,
              buttonText: contentObj.action_context?.button_text,
              messageId: message.id,
              createdAt: message.createdAt.toISOString(),
              actionType: "click",
            });
          }
          break;
      }
    }

    // Process legacy redirect formats
    if (contentObj.url || contentObj.redirect_url) {
      globalStats.totalAiRedirects++;
      const redirectUrl = contentObj.url || contentObj.redirect_url;
      const normalizedUrl = normalizeUrl(redirectUrl);
      urlRedirectCounts.set(
        normalizedUrl,
        (urlRedirectCounts.get(normalizedUrl) || 0) + 1
      );
      countRedirectByType(normalizedUrl);
    }
  } catch (e) {
    // If JSON parsing fails, try regex for URLs
    const urlRegex =
      /https?:\/\/[^\s)]+|(?:\/(?:pages|products|blogs|collections)\/[^\s)]+)/g;
    const urls = message.content.match(urlRegex);
    if (urls?.length) {
      urls.forEach((url) => {
        globalStats.totalAiRedirects++;
        const normalizedUrl = normalizeUrl(url);
        urlRedirectCounts.set(
          normalizedUrl,
          (urlRedirectCounts.get(normalizedUrl) || 0) + 1
        );
        countRedirectByType(normalizedUrl);
        if (actionsDetails && message.threadId) {
          actionsDetails.movement.push({
            threadId: message.threadId,
            url,
            messageId: message.id,
            createdAt: message.createdAt.toISOString(),
            actionType: "redirect",
          });
        }
      });
    }

    // Check for action strings if JSON parsing failed
    if (message.content.includes('"action":"scroll"'))
      globalStats.totalAiScrolls++;
    if (message.content.includes('"action":"purchase"')) {
      globalStats.totalAiPurchases++;
      if (purchases && message.threadId) {
        // Best-effort URL extraction for purchase
        const urlRegex =
          /https?:\/\/[^\s)]+|(?:\/(?:pages|products|blogs|collections)\/[^\s)]+)/g;
        const urls = message.content.match(urlRegex);
        const url = urls && urls.length > 0 ? urls[0] : undefined;
        const handle = url
          ? extractHandle(url, "products") ?? undefined
          : undefined;
        // Try to parse name/id even if JSON parsing failed
        let productId: string | undefined;
        let productName: string | undefined;
        try {
          const maybeJson = JSON.parse(message.content);
          productId =
            maybeJson?.action_context?.product_id ||
            maybeJson?.action_context?.id;
          productName =
            maybeJson?.action_context?.product_name ||
            maybeJson?.action_context?.title;
        } catch {}
        console.log("Purchase (fallback) detected:", {
          threadId: message.threadId,
          url,
          handle,
          productId,
          productName,
        });
        if (!purchases.byThread.has(message.threadId)) {
          purchases.byThread.set(message.threadId, new Set<string>());
        }
        const set = purchases.byThread.get(message.threadId)!;
        const key = handle || productId || productName || url || "unknown";
        set.add(key);
        console.log("Purchase (fallback) recorded with key:", {
          threadId: message.threadId,
          key,
        });
        purchases.raw.push({
          threadId: message.threadId,
          url: url ?? undefined,
          handle: handle ?? undefined,
          productId: productId ?? undefined,
          productName: productName ?? undefined,
          createdAt: message.createdAt.toISOString(),
        });
      }
    }
    if (message.content.includes('"action":"click"')) {
      globalStats.totalAiClicks++;
      if (actionsDetails && message.threadId) {
        actionsDetails.movement.push({
          threadId: message.threadId,
          messageId: message.id,
          createdAt: message.createdAt.toISOString(),
          actionType: "click",
        });
      }
    }
  }
}

function getRedirectCount(
  url: string,
  website: any,
  urlRedirectCounts: Map<string, number>
) {
  // Normalize by removing trailing slash
  let normalizedUrl = url.replace(/\/$/, "");

  // For Shopify pages, check both with and without /pages/ prefix
  if (website.type === "Shopify") {
    if (
      !normalizedUrl.startsWith("/pages/") &&
      !normalizedUrl.startsWith("/products/") &&
      !normalizedUrl.startsWith("/blogs/")
    ) {
      normalizedUrl = "/pages/" + normalizedUrl;
    }
    // Remove trailing periods
    normalizedUrl = normalizedUrl.replace(/\.$/, "");
  }

  return urlRedirectCounts.get(normalizedUrl) || 0;
}

async function fetchWordPressContent(websiteId: string, stats: any) {
  const { redirectMaps } = stats;
  const { urlRedirectCounts } = redirectMaps;

  // Fetch WordPress Products
  const wpProducts = (await query(
    `SELECT * FROM WordpressProduct WHERE websiteId = ? ORDER BY updatedAt DESC`,
    [websiteId]
  )) as any[];

  // Fetch WordPress Posts with author relation
  const wpPosts = (await query(
    `SELECT p.*, wa.name as authorName
     FROM WordpressPost p
     LEFT JOIN WordpressAuthor wa ON wa.wpId = p.authorId
     WHERE p.websiteId = ?
     ORDER BY p.updatedAt DESC`,
    [websiteId]
  )) as any[];

  // Fetch WordPress Pages
  const wpPages = (await query(
    `SELECT * FROM WordpressPage WHERE websiteId = ? ORDER BY updatedAt DESC`,
    [websiteId]
  )) as any[];

  // Map products
  const products = wpProducts.map((prod: any) => {
    const productUrl = `/products/${prod.slug}`;

    // Handle date safely - WordPress dates might be strings or null
    let lastUpdated;
    try {
      if (prod.updatedAt instanceof Date) {
        lastUpdated = prod.updatedAt.toISOString();
      } else if (prod.updatedAt) {
        // Try to parse as string
        const date = new Date(prod.updatedAt);
        if (!isNaN(date.getTime())) {
          lastUpdated = date.toISOString();
        } else {
          lastUpdated = new Date().toISOString();
        }
      } else {
        lastUpdated = new Date().toISOString();
      }
    } catch (e) {
      console.error("Error parsing WordPress product date:", prod.updatedAt, e);
      lastUpdated = new Date().toISOString();
    }

    return {
      id: String(prod.id),
      title: prod.name,
      url: productUrl,
      handle: prod.slug,
      type: "product" as const,
      lastUpdated: lastUpdated,
      aiRedirects: redirectMaps.productRedirects.get(prod.slug) || 0,
      description: prod.description,
      price: prod.price || prod.regularPrice || 0,
      regularPrice: prod.regularPrice,
      salePrice: prod.salePrice,
      stockQuantity: prod.stockQuantity,
    };
  });

  // Map blog posts
  const blogPosts = wpPosts.map((post: any) => {
    const postUrl = `/${post.slug}`;

    // Handle date safely - WordPress dates might be strings or null
    let lastUpdated;
    try {
      if (post.updatedAt instanceof Date) {
        lastUpdated = post.updatedAt.toISOString();
      } else if (post.updatedAt) {
        // Try to parse as string
        const date = new Date(post.updatedAt);
        if (!isNaN(date.getTime())) {
          lastUpdated = date.toISOString();
        } else {
          lastUpdated = new Date().toISOString();
        }
      } else {
        lastUpdated = new Date().toISOString();
      }
    } catch (e) {
      console.error("Error parsing WordPress post date:", post.updatedAt, e);
      lastUpdated = new Date().toISOString();
    }

    return {
      id: String(post.id),
      title: post.title,
      url: postUrl,
      handle: post.slug,
      type: "post" as const,
      lastUpdated: lastUpdated,
      aiRedirects: redirectMaps.blogRedirects.get(post.slug) || 0,
      content: post.excerpt ?? post.content,
      author: post.authorName ?? "Unknown",
      hot: parseInt(post.hot) || 0,
    };
  });

  // Map pages
  const pages = wpPages.map((p: any) => {
    const pageUrl = `/${p.slug}`;

    // Handle date safely - WordPress dates might be strings or null
    let lastUpdated;
    try {
      if (p.updatedAt instanceof Date) {
        lastUpdated = p.updatedAt.toISOString();
      } else if (p.updatedAt) {
        // Try to parse as string
        const date = new Date(p.updatedAt);
        if (!isNaN(date.getTime())) {
          lastUpdated = date.toISOString();
        } else {
          lastUpdated = new Date().toISOString();
        }
      } else {
        lastUpdated = new Date().toISOString();
      }
    } catch (e) {
      console.error("Error parsing WordPress page date:", p.updatedAt, e);
      lastUpdated = new Date().toISOString();
    }

    return {
      id: String(p.id),
      title: p.title,
      url: pageUrl,
      handle: p.slug,
      type: "page" as const,
      lastUpdated: lastUpdated,
      aiRedirects: redirectMaps.pageRedirects.get(p.slug) || 0,
      content: p.content,
    };
  });

  console.log(
    `WordPress content fetched: ${products.length} products, ${blogPosts.length} posts, ${pages.length} pages`
  );
  console.log(
    "Sample WordPress products:",
    products
      .slice(0, 2)
      .map((p) => ({ title: p.title, handle: p.handle, price: p.price }))
  );

  return { products, blogPosts, pages, collections: [], discounts: [] };
}

async function fetchShopifyContent(websiteId: string, stats: any) {
  const { redirectMaps } = stats;

  // Fetch collections first since products reference them
  let shopifyCollections: any[] = [];
  try {
    shopifyCollections = (await query(
      `SELECT sc.* FROM ShopifyCollection sc WHERE sc.websiteId = ? ORDER BY sc.createdAt DESC`,
      [websiteId]
    )) as any[];
    // Load collection products
    for (const col of shopifyCollections) {
      const prodRows = (await query(
        `SELECT sp.* FROM ShopifyProduct sp
         JOIN _ShopifyCollectionToShopifyProduct cp ON cp.A = ?
         WHERE sp.id = cp.B AND sp.websiteId = ?`,
        [col.id, websiteId]
      )) as any[];
      col.products = prodRows;
    }
  } catch (error) {
    console.error("Error fetching collection data:", error);
  }

  // Fetch discounts - use try/catch to handle invalid date values
  let shopifyDiscounts: any[] = [];
  try {
    shopifyDiscounts = (await query(
      `SELECT id, title, code, value, type, status, startsAt, endsAt, appliesTo, shopifyId, createdAt
       FROM ShopifyDiscount WHERE websiteId = ?`,
      [websiteId]
    )) as any[];

    // Sort in memory instead of using database ordering
    shopifyDiscounts = shopifyDiscounts.sort((a, b) => {
      // Safely handle dates
      const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
      const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
      return dateB - dateA; // descending order
    });
  } catch (error) {
    console.error("Error fetching discount data:", error);
    // If all attempts fail, just return an empty array
    shopifyDiscounts = [];
  }

  // Fetch products with relations
  let shopifyProducts: any[] = [];
  try {
    shopifyProducts = (await query(
      `SELECT * FROM ShopifyProduct WHERE websiteId = ?`,
      [websiteId]
    )) as any[];
    // load variants, reviews, images
    for (const p of shopifyProducts) {
      p.variants = (await query(
        `SELECT * FROM ShopifyProductVariant WHERE productId = ?`,
        [p.id]
      )) as any[];
      p.reviews = (await query(
        `SELECT * FROM ShopifyReview WHERE productId = ?`,
        [p.id]
      )) as any[];
      p.images = (await query(
        `SELECT * FROM ShopifyMedia WHERE productId = ?`,
        [p.id]
      )) as any[];
    }

    // Sort in memory instead of using database ordering
    shopifyProducts = shopifyProducts.sort((a, b) => {
      // Safely handle dates
      const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
      const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
      return dateB - dateA; // descending order
    });
  } catch (error) {
    console.error("Error fetching product data:", error);
    shopifyProducts = []; // If all attempts fail, return empty array
  }

  // Fetch blog posts with comments
  let shopifyBlogs: any[] = [];
  try {
    shopifyBlogs = (await query(
      `SELECT * FROM ShopifyBlog WHERE websiteId = ?`,
      [websiteId]
    )) as any[];
    for (const blog of shopifyBlogs) {
      blog.posts = (await query(
        `SELECT * FROM ShopifyBlogPost WHERE blogId = ? ORDER BY createdAt DESC`,
        [blog.id]
      )) as any[];
      for (const post of blog.posts) {
        post.comments = (await query(
          `SELECT * FROM ShopifyComment WHERE postId = ?`,
          [post.id]
        )) as any[];
      }
    }

    // Sort blog posts in memory
    shopifyBlogs = shopifyBlogs.map((blog) => {
      if (blog.posts && Array.isArray(blog.posts)) {
        blog.posts = blog.posts.sort((a: any, b: any) => {
          // Safely handle dates
          const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
          const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
          return dateB - dateA; // descending order
        });
      }
      return blog;
    });
  } catch (error) {
    console.error("Error fetching blog data:", error);
    shopifyBlogs = []; // If all attempts fail, return empty array
  }

  // Fetch pages - with improved error handling for invalid dates
  let shopifyPages: any[] = [];
  try {
    shopifyPages = (await query(
      `SELECT id, title, handle, content, createdAt, shopifyId
       FROM ShopifyPage WHERE websiteId = ?`,
      [websiteId]
    )) as any[];

    // Sort in memory instead of using database ordering
    shopifyPages = shopifyPages.sort((a, b) => {
      // Safely handle dates
      const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
      const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
      return dateB - dateA; // descending order
    });
  } catch (error) {
    console.error("Error fetching page data:", error);
    // If all attempts fail, just return an empty array
    shopifyPages = [];
  }

  // Map collections - with date validation
  const collections = shopifyCollections.map((collection) => {
    const collectionUrl = `/collections/${collection.handle}`;
    // Format dates safely
    const createdDate =
      collection.createdAt && isValidDate(collection.createdAt)
        ? collection.createdAt.toISOString()
        : new Date().toISOString();

    return {
      id: collection.id,
      title: collection.title || "",
      handle: collection.handle || "",
      description: collection.description,
      image: collection.image,
      ruleSet: collection.ruleSet,
      sortOrder: collection.sortOrder,
      updatedAt: createdDate,
      createdAt: createdDate,
      products: Array.isArray(collection.products)
        ? collection.products.map((p: any) => ({
            ...p,
            shopifyId: p.shopifyId.toString(),
          }))
        : [],
      aiRedirects:
        redirectMaps.collectionRedirects.get(collection.handle || "") || 0,
      shopifyId: collection.shopifyId.toString(),
    };
  });

  // Map discounts - with date validation
  const discounts = shopifyDiscounts.map((discount) => {
    return {
      id: discount.id,
      title: discount.title,
      code: discount.code,
      value: discount.value,
      type: discount.type,
      status: discount.status,
      startsAt:
        discount.startsAt && isValidDate(discount.startsAt)
          ? discount.startsAt.toISOString()
          : null,
      endsAt:
        discount.endsAt && isValidDate(discount.endsAt)
          ? discount.endsAt.toISOString()
          : null,
      appliesTo: discount.appliesTo,
      shopifyId: discount.shopifyId.toString(),
    };
  });

  // Map products - with date validation
  const products = shopifyProducts.map((prod) => {
    const productUrl = `/products/${prod.handle}`;
    // Format date safely
    const lastUpdated =
      prod.createdAt && isValidDate(prod.createdAt)
        ? prod.createdAt.toISOString()
        : new Date().toISOString();

    return {
      id: prod.id,
      title: prod.title,
      url: productUrl,
      type: "product" as const,
      lastUpdated: lastUpdated, // Use createdAt instead of updatedAt
      aiRedirects: redirectMaps.productRedirects.get(prod.handle) || 0,
      description: prod.description,
      vendor: prod.vendor,
      productType: prod.productType,
      price: prod.variants[0]?.price || 0,
      variants: prod.variants.map((v: any) => ({
        id: v.id,
        title: v.title,
        price: v.price,
        sku: v.sku,
        inventory: v.inventory,
      })),
      reviews: Array.isArray(prod.reviews)
        ? prod.reviews.map((r: any) => {
            // Format review date safely
            const reviewDate =
              r.createdAt && isValidDate(r.createdAt)
                ? r.createdAt.toISOString()
                : new Date().toISOString();

            return {
              id: r.id,
              reviewer: r.reviewer,
              rating: r.rating,
              review: r.body,
              title: r.title,
              verified: r.verified,
              date: reviewDate,
            };
          })
        : [],
      images: Array.isArray(prod.images)
        ? prod.images.map((img: any) => ({
            id: img.id,
            url: img.url,
            altText: img.altText,
            caption: img.caption,
          }))
        : [],
    };
  });

  // Map blog posts - with date validation
  const blogPosts = shopifyBlogs.flatMap((blog) =>
    blog.posts.map((post: any) => {
      const postUrl = `/blogs/${blog.handle}/${post.handle}`;
      // Format date safely
      const postDate =
        post.createdAt && isValidDate(post.createdAt)
          ? post.createdAt.toISOString()
          : new Date().toISOString();

      return {
        id: post.id,
        title: post.title,
        url: postUrl,
        type: "post" as const,
        lastUpdated: postDate, // Use createdAt instead of updatedAt
        aiRedirects: redirectMaps.blogRedirects.get(post.handle || "") || 0,
        content: post.content,
        author: post.author,
        image: post.image,
        blog: {
          id: blog.id,
          title: blog.title,
          handle: blog.handle,
        },
        comments: Array.isArray(post.comments)
          ? post.comments.map((c: any) => {
              // Format comment date safely
              const commentDate =
                c.createdAt && isValidDate(c.createdAt)
                  ? c.createdAt.toISOString()
                  : new Date().toISOString();

              return {
                id: c.id,
                author: c.author,
                content: c.body,
                email: c.email,
                status: c.status,
                date: commentDate,
              };
            })
          : [],
      };
    })
  );

  // Map pages - with date validation
  const pages = shopifyPages.map((p) => {
    const pageUrl = `/pages/${p.handle}`;
    // Format date safely
    const pageDate =
      p.createdAt && isValidDate(p.createdAt)
        ? p.createdAt.toISOString()
        : new Date().toISOString();

    return {
      id: p.id,
      title: p.title,
      url: pageUrl,
      type: "page" as const,
      lastUpdated: pageDate, // Use createdAt instead of updatedAt
      aiRedirects: redirectMaps.pageRedirects.get(p.handle) || 0,
      content: p.content,
    };
  });

  return { products, blogPosts, pages, collections, discounts };
}

// Helper function to check if a date is valid
function isValidDate(date: Date): boolean {
  return (
    date instanceof Date &&
    !isNaN(date.getTime()) &&
    date.getMonth() > 0 &&
    date.getDate() > 0
  ); // Month and day must be > 0
}

async function fetchCustomContent(websiteId: string, stats: any) {
  const { redirectMaps } = stats;

  let pages: Array<{
    id: string;
    title: string;
    url: string;
    type: "page";
    lastUpdated: string;
    aiRedirects: number;
    content: string | null;
    htmlContent?: string | null;
    source?: string;
    trained?: boolean;
  }> = [];

  // For Custom website types, prioritize CustomPage table
  try {
    const customTypePages = (await query(
      `SELECT cp.id, cp.websiteId, cp.url, cp.title, cp.content, cp.htmlContent, cp.createdAt, cp.updatedAt, cp.trained
       FROM CustomPage cp
       WHERE cp.websiteId = ?
       ORDER BY cp.updatedAt DESC`,
      [websiteId]
    )) as any[];

    if (customTypePages.length > 0) {
      console.log(
        `Found ${customTypePages.length} pages in CustomPage table for website ${websiteId}`
      );

      pages = customTypePages.map((p: any) => {
        // Handle date safely - use current date if parsing fails
        let lastUpdated;
        try {
          const dateObj = new Date(p.updatedAt || p.createdAt);
          if (isNaN(dateObj.getTime())) {
            // If that fails, try to parse MySQL datetime format (YYYY-MM-DD HH:MM:SS)
            const parts = (p.updatedAt || p.createdAt).split(/[- :]/);
            // Note: months are 0-based in JS Date
            const fixedDate = new Date(
              parts[0],
              parts[1] - 1,
              parts[2],
              parts[3],
              parts[4],
              parts[5]
            );
            lastUpdated = fixedDate.toISOString();
          } else {
            lastUpdated = dateObj.toISOString();
          }
        } catch (e) {
          console.error("Error parsing date:", p.updatedAt || p.createdAt);
          lastUpdated = new Date().toISOString();
        }

        return {
          id: p.id,
          title: p.title || p.url.split("/").pop() || "Untitled",
          url: p.url,
          type: "page" as const,
          lastUpdated: lastUpdated,
          aiRedirects:
            redirectMaps.pageRedirects.get(String(p.url).replace(/^\//, "")) ||
            0,
          content: p.content,
          htmlContent: p.htmlContent,
          source: "custom_page",
          trained: Boolean(p.trained), // Convert to boolean
        };
      });
    } else {
      console.log(
        `No pages found in CustomPage table for website ${websiteId}, checking legacy Page table`
      );

      // Fall back to legacy Page table if CustomPage is empty
      try {
        const legacyPages = (await query(
          `SELECT id, title, url, content, html, updatedAt
           FROM Page
           WHERE websiteId = ?
           ORDER BY updatedAt DESC`,
          [websiteId]
        )) as any[];

        console.log(
          `Found ${legacyPages.length} pages in legacy Page table for website ${websiteId}`
        );

        pages = legacyPages.map((p: any) => {
          return {
            id: p.id,
            title: p.title,
            url: p.url,
            type: "page" as const,
            lastUpdated: new Date(p.updatedAt).toISOString(),
            aiRedirects:
              redirectMaps.pageRedirects.get(
                String(p.url).replace(/^\//, "")
              ) || 0,
            content: p.content,
            htmlContent: p.html,
            source: "custom_crawler",
            trained: false, // Legacy pages are not necessarily trained
          };
        });
      } catch (legacyError) {
        console.error("Error fetching legacy custom pages:", legacyError);
      }
    }
  } catch (error) {
    console.error("Error fetching CustomPage data:", error);
  }

  console.log(
    `Returning ${pages.length} total pages for Custom website ${websiteId}`
  );
  return { products: [], blogPosts: [], pages, collections: [], discounts: [] };
}

async function fetchWebsiteContent(website: any, stats: any) {
  let content;

  switch (website.type) {
    case "WordPress":
      content = await fetchWordPressContent(website.id, stats);
      break;
    case "Shopify":
      content = await fetchShopifyContent(website.id, stats);
      break;
    case "Custom":
      content = await fetchCustomContent(website.id, stats);
      break;
    default:
      throw new Error(`Unsupported website type: ${website.type}`);
  }

  // Check for additional custom pages regardless of website type
  if (website.type !== "Custom") {
    try {
      const additionalPages = await fetchCustomContent(website.id, stats);
      content.pages = [...content.pages, ...additionalPages.pages];
    } catch (error) {
      console.error("Error fetching additional custom pages:", error);
    }
  }

  return content;
}

function buildResponseData(
  website: any,
  stats: any,
  content: any,
  threads: Thread[]
) {
  const { globalStats, redirectMaps } = stats;

  // Log statistics discrepancy for debugging
  if (
    globalStats.totalTextChats + globalStats.totalVoiceChats !==
    website.monthlyQueries
  ) {
    console.log(`Statistics discrepancy detected for website ${website.id}:`);
    console.log(`Monthly queries: ${website.monthlyQueries}`);
    console.log(`Total text chats: ${globalStats.totalTextChats}`);
    console.log(`Total voice chats: ${globalStats.totalVoiceChats}`);
    console.log(
      `Combined chats: ${
        globalStats.totalTextChats + globalStats.totalVoiceChats
      }`
    );
  }

  const base = {
    id: website.id,
    domain: website.url,
    type: website.type,
    customType: website.customType || "",
    plan: website.plan,
    name: website.name || website.url,
    active: website.active,
    status: website.active ? "active" : "inactive",
    monthlyQueries: website.monthlyQueries,
    queryLimit: website.queryLimit,
    lastSync: website.lastSyncedAt ? website.lastSyncedAt.toISOString() : null,
    accessKey: website.accessKeys[0]?.key || null,
    color: website.color || "#6366F1", // Default color
    botName: website.botName,
    customWelcomeMessage: website.customWelcomeMessage,
    customInstructions: website.customInstructions,
    allowAutoCancel: website.allowAutoCancel,
    allowAutoReturn: website.allowAutoReturn,
    allowAutoExchange: website.allowAutoExchange,
    allowAutoClick: website.allowAutoClick,
    allowAutoScroll: website.allowAutoScroll,
    allowAutoHighlight: website.allowAutoHighlight,
    allowAutoRedirect: website.allowAutoRedirect,
    allowAutoGetUserOrders: website.allowAutoGetUserOrders,
    allowAutoUpdateUserInfo: website.allowAutoUpdateUserInfo,
    allowAutoFillForm: website.allowAutoFillForm,
    allowAutoTrackOrder: website.allowAutoTrackOrder,
    allowAutoLogout: website.allowAutoLogout,
    allowAutoLogin: website.allowAutoLogin,
    allowAutoGenerateImage: website.allowAutoGenerateImage,
    allowMultiAIReview: website.allowMultiAIReview,
    showVoiceAI: website.showVoiceAI,
    showTextAI: website.showTextAI,
    popUpQuestions: website.popUpQuestions.map((q: any) => ({
      id: q.id,
      question: q.question,
      createdAt: q.createdAt.toISOString(),
    })),
    globalStats,
    stats: {
      aiRedirects: globalStats.totalAiRedirects,
      totalRedirects: globalStats.totalAiRedirects,
      aiScrolls: globalStats.totalAiScrolls,
      aiPurchases: globalStats.totalAiPurchases,
      aiClicks: globalStats.totalAiClicks,
      redirectRate:
        website.monthlyQueries > 0
          ? Math.min(
              (globalStats.totalAiRedirects / website.monthlyQueries) * 100,
              100
            )
          : 0,
      totalVoiceChats: globalStats.totalVoiceChats,
      totalTextChats: globalStats.totalTextChats,
    },
    content: {
      products: content.products.map((p: any) => ({
        id: p.id,
        shopifyId: p.shopifyId ? p.shopifyId.toString() : undefined,
        handle: extractHandle(p.url, "products") || p.handle || undefined,
        title: p.title || "",
        description: p.description || "",
        url: p.url,
        aiRedirects: p.aiRedirects,
        price: typeof p.price === "number" ? p.price : p.variants?.[0]?.price,
      })),
      blogPosts: content.blogPosts.map((p: any) => ({
        id: p.id,
        shopifyId: p.shopifyId ? p.shopifyId.toString() : undefined,
        handle: extractHandle(p.url, "blogs"),
        title: p.title || "",
        content: p.content || "",
        url: p.url,
        aiRedirects: p.aiRedirects,
      })),
      pages: content.pages.map((p: any) => ({
        id: p.id,
        shopifyId: p.shopifyId ? p.shopifyId.toString() : undefined,
        handle: extractHandle(p.url, "pages"),
        title: p.title || "",
        content: p.content || "",
        url: p.url,
        aiRedirects: p.aiRedirects,
        source: p.source,
        trained: p.trained || false,
        htmlContent: p.htmlContent,
        lastUpdated: p.lastUpdated,
      })),
      collections: content.collections.map((c: any) => ({
        id: c.id,
        shopifyId: c.shopifyId.toString(),
        handle: c.handle || "",
        title: c.title || "",
        description: c.description || "",
        aiRedirects: c.aiRedirects,
      })),
      discounts: content.discounts.map((d: any) => ({
        id: d.id,
        shopifyId: d.shopifyId,
        title: d.title || "",
        code: d.code || "",
        value: d.value || "",
        type: d.type || "",
        status: d.status || "",
        startsAt: d.startsAt,
        endsAt: d.endsAt,
        appliesTo: d.appliesTo || "",
      })),
    },
  } as any;

  // Expose action details for UI to render clickable lists per action type
  base.actionDetails = stats.actionsDetails || {
    cart: [],
    movement: [],
    orders: [],
  };

  // Embed full messages for each action entry so the frontend can render conversations directly
  try {
    const threadMap = new Map(threads.map((t) => [t.id, t]));
    const enrich = (arr: any[]) => {
      if (!Array.isArray(arr)) return;
      for (const entry of arr) {
        const threadId: string | undefined = entry?.threadId;
        const thread = threadId ? threadMap.get(threadId) : undefined;
        if (thread && Array.isArray((thread as any).messages)) {
          entry.messages = (thread as any).messages;
        }
      }
    };
    enrich(base.actionDetails.cart as any[]);
    enrich(base.actionDetails.movement as any[]);
    enrich(base.actionDetails.orders as any[]);
  } catch {}

  // Keep original product title/handle to help frontend link purchase entries to products
  try {
    base.fullContent = content;
  } catch {}

  // Group full conversations by action type with their matching action entries
  try {
    const threadMap = new Map(threads.map((t) => [t.id, t]));
    const mapThreadsForAction = (key: string) => {
      const arr =
        (base.actionDetails?.[key] as Array<{ threadId: string }>) || [];
      const ids = new Set(arr.map((e: any) => e.threadId).filter(Boolean));
      return Array.from(ids)
        .map((id) => ({
          thread: threadMap.get(id),
          actions: arr.filter((e: any) => e.threadId === id),
        }))
        .filter((x) => x.thread);
    };
    base.actionConversations = {
      cart: mapThreadsForAction("cart"),
      movement: mapThreadsForAction("movement"),
      orders: mapThreadsForAction("orders"),
    };
  } catch {}

  return base;
}

// Helper function to extract and normalize handle from a URL
function extractHandle(url: string, type: string): string | null {
  try {
    // Remove domain if present
    let path = url;
    if (url.startsWith("http")) {
      const urlObj = new URL(url);
      path = urlObj.pathname;
    }
    const parts = path.split("/").filter(Boolean);
    if (parts.length >= 2) {
      let t = parts[0];
      let h = parts[1];
      // Normalize type
      if (["product", "products"].includes(t)) t = "products";
      else if (["collection", "collections"].includes(t)) t = "collections";
      else if (["blog", "blogs"].includes(t)) t = "blogs";
      else if (["page", "pages"].includes(t)) t = "pages";
      if (t === type) {
        // Normalize handle: lowercase, strip trailing slashes/periods
        return h.toLowerCase().replace(/[\/.]+$/, "");
      }
    }
  } catch (e) {
    return null;
  }
  return null;
}
