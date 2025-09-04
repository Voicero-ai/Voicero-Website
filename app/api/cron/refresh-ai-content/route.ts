import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import {
  getWebsiteAIOverview,
  RevenueSummary,
} from "../../../../lib/websiteAIGet";

export const dynamic = "force-dynamic";

interface Thread {
  id: string;
  messages: Array<{
    id: string;
    createdAt: Date;
    content: string;
    type: string | null;
    threadId: string;
    role: string;
    pageUrl: string | null;
    scrollToText: string | null;
    action?: string;
    actionType?: string;
  }>;
}

export async function GET(request: NextRequest) {
  console.log("Starting AI content refresh cron job");

  try {
    // Find websites that need AI content refresh (older than 10 hours or missing)
    const now = new Date();
    const tenHoursAgo = new Date(now.getTime() - 10 * 60 * 60 * 1000);

    console.log(`Current time: ${now.toISOString()}`);
    console.log(`Ten hours ago: ${tenHoursAgo.toISOString()}`);

    const websitesToRefresh = (await query(
      `SELECT id, url, name, type, customType, plan, active, monthlyQueries,
              queryLimit, lastSyncedAt, customInstructions, color, botName,
              customWelcomeMessage, userId, allowAutoCancel, allowAutoReturn,
              allowAutoExchange, allowAutoClick, allowAutoScroll, allowAutoHighlight,
              allowAutoRedirect, allowAutoGetUserOrders, allowAutoUpdateUserInfo,
              allowAutoFillForm, allowAutoTrackOrder, allowAutoLogout, allowAutoLogin,
              allowAutoGenerateImage, showVoiceAI, showTextAI, aiOverview,
              aiOverviewRevenue, cachedGlobalStats, cachedActionDetails,
              cachedActionConversations, lastAiGenerated
       FROM Website 
       WHERE (lastAiGenerated IS NULL OR lastAiGenerated < UTC_TIMESTAMP() - INTERVAL 10 HOUR)
       LIMIT 10`
    )) as any[];

    console.log(
      `Found ${websitesToRefresh.length} websites needing AI refresh`
    );

    const results = [];

    for (const website of websitesToRefresh) {
      try {
        console.log(`Processing website ${website.id} (${website.url})`);

        // Fetch threads for this website
        const aiThreads = await fetchWebsiteThreads(website.id);

        // Initialize stats
        const stats = initializeStats();

        // Filter out empty threads
        const validThreads = aiThreads.filter(
          (thread) => thread.messages.length > 0
        );

        // Process threads and calculate stats
        processThreadsAndMessages(validThreads, stats);

        // Fetch website content
        const content = await fetchWebsiteContent(website, stats);

        // Build response data to get global stats
        const responseData = buildBasicResponseData(
          website,
          stats,
          content,
          validThreads
        );

        // Generate AI overview
        console.time(`ai-overview-${website.id}`);
        const aiOverview = await getWebsiteAIOverview(website.id);
        console.timeEnd(`ai-overview-${website.id}`);

        // Build revenue summary
        const revenueSummary: RevenueSummary = {
          amount: 0,
          currency: "USD",
          breakdown: { threads: 0, percent_of_total_threads: 0, aov: 0 },
        };

        try {
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
          const threadIdsWithPurchases = Array.from(
            new Set(purchases.raw.map((p: any) => p.threadId))
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

          // Calculate revenue if we have content
          if (content?.products?.length > 0) {
            const handleToPrice = new Map<string, number>();
            const titleToPrice = new Map<string, number>();

            for (const p of content.products) {
              const handle = p.handle || extractHandle(p.url, "products");
              const price =
                typeof p.price === "number" ? p.price : p.variants?.[0]?.price;

              if (typeof price === "number") {
                if (handle) handleToPrice.set(handle.toLowerCase(), price);
                if (p.title) {
                  titleToPrice.set(
                    p.title.toLowerCase().replace(/\s+/g, " ").trim(),
                    price
                  );
                }
              }
            }

            let totalAmount = 0;
            for (const [threadId, set] of Array.from(
              purchases.byThread.entries()
            )) {
              for (const rawKey of Array.from(set.values())) {
                let price: number | undefined;
                const key = String(rawKey || "");

                // Try to match price
                const handle = key.includes("/")
                  ? extractHandle(key, "products")
                  : key;
                if (handle) {
                  price = handleToPrice.get(handle.toLowerCase());
                }
                if (price === undefined && key) {
                  const norm = key.toLowerCase().replace(/\s+/g, " ").trim();
                  price = titleToPrice.get(norm);
                }

                if (typeof price === "number") {
                  totalAmount += price;
                }
              }
            }

            revenueSummary.amount = Math.round(totalAmount * 100) / 100;
            revenueSummary.breakdown.aov =
              threadIdsWithPurchases.length > 0
                ? Math.round(
                    (totalAmount / threadIdsWithPurchases.length) * 100
                  ) / 100
                : 0;
          }
        } catch (error) {
          console.error(
            `Error calculating revenue for website ${website.id}:`,
            error
          );
        }

        // Cache the data in database
        await query(
          `UPDATE Website SET 
            aiOverview = ?, 
            aiOverviewRevenue = ?, 
            cachedGlobalStats = ?,
            cachedActionDetails = ?,
            cachedActionConversations = ?,
            lastAiGenerated = ?
          WHERE id = ?`,
          [
            typeof aiOverview === "object"
              ? JSON.stringify(aiOverview)
              : aiOverview,
            JSON.stringify(revenueSummary),
            JSON.stringify(responseData.globalStats),
            JSON.stringify(responseData.actionDetails),
            JSON.stringify(responseData.actionConversations),
            new Date().toISOString().slice(0, 19).replace("T", " "), // Convert to MySQL datetime format in UTC
            website.id,
          ]
        );

        results.push({
          websiteId: website.id,
          url: website.url,
          status: "success",
          aiOverviewLength: (aiOverview as any)?.length || 0,
          revenue: revenueSummary.amount,
          threads: revenueSummary.breakdown.threads,
        });

        console.log(
          `Successfully refreshed AI content for website ${website.id}`
        );
      } catch (error) {
        console.error(`Error processing website ${website.id}:`, error);
        results.push({
          websiteId: website.id,
          url: website.url,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    console.log("AI content refresh cron job completed");

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error("Error in AI content refresh cron job:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Helper functions (simplified versions of the ones in get/route.ts)

async function fetchWebsiteThreads(websiteId: string): Promise<Thread[]> {
  const aiThreads: Thread[] = [];

  // Fetch AiThreads
  const threadRows = (await query(
    `SELECT id FROM AiThread WHERE websiteId = ? ORDER BY createdAt DESC`,
    [websiteId]
  )) as { id: string }[];

  for (const t of threadRows) {
    const messageRows = (await query(
      `SELECT id, createdAt, content, type, threadId, role, pageUrl, scrollToText
       FROM AiMessage WHERE threadId = ? ORDER BY createdAt ASC`,
      [t.id]
    )) as any[];

    const messages = messageRows.map((m) => ({
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
      aiThreads.push({ id: t.id, messages });
    }
  }

  // Fetch TextConversations
  const textConversationRows = (await query(
    `SELECT tc.id FROM TextConversations tc
     JOIN Session s ON tc.sessionId COLLATE utf8mb4_unicode_ci = s.id COLLATE utf8mb4_unicode_ci
     WHERE s.websiteId = ? ORDER BY tc.mostRecentConversationAt DESC`,
    [websiteId]
  )) as any[];

  for (const conv of textConversationRows) {
    const chatRows = (await query(
      `SELECT id, messageType, content, createdAt, responseId, textConversationId, action, actionType
       FROM TextChats WHERE textConversationId = ? ORDER BY createdAt ASC`,
      [conv.id]
    )) as any[];

    const messages = chatRows.map((m) => ({
      id: m.id,
      createdAt: new Date(m.createdAt),
      content: m.content,
      type: m.messageType === "user" ? "text" : "ai",
      threadId: conv.id,
      role: m.messageType === "user" ? "user" : "assistant",
      pageUrl: null,
      scrollToText: null,
      action: m.action,
      actionType: m.actionType,
    }));

    if (messages.length > 0) {
      aiThreads.push({ id: conv.id, messages });
    }
  }

  // Fetch VoiceConversations
  const voiceConversationRows = (await query(
    `SELECT vc.id FROM VoiceConversations vc
     JOIN Session s ON vc.sessionId = s.id
     WHERE s.websiteId = ? ORDER BY vc.mostRecentConversationAt DESC`,
    [websiteId]
  )) as any[];

  for (const conv of voiceConversationRows) {
    const chatRows = (await query(
      `SELECT id, messageType, content, createdAt, responseId, voiceConversationId, action, actionType
       FROM VoiceChats WHERE voiceConversationId = ? ORDER BY createdAt ASC`,
      [conv.id]
    )) as any[];

    const messages = chatRows.map((m) => ({
      id: m.id,
      createdAt: new Date(m.createdAt),
      content: m.content,
      type: m.messageType === "user" ? "voice" : "ai",
      threadId: conv.id,
      role: m.messageType === "user" ? "user" : "assistant",
      pageUrl: null,
      scrollToText: null,
      action: m.action,
      actionType: m.actionType,
    }));

    if (messages.length > 0) {
      aiThreads.push({ id: conv.id, messages });
    }
  }

  return aiThreads;
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
      cart: [],
      movement: [],
      orders: [],
    },
  };
}

function processThreadsAndMessages(aiThreads: Thread[], stats: any) {
  const { redirectMaps, globalStats, purchases, actionsDetails } = stats;

  // Reset counters
  globalStats.totalVoiceChats = 0;
  globalStats.totalTextChats = 0;

  aiThreads.forEach((thread: Thread) => {
    let hasVoiceMessage = false;
    let hasTextMessage = false;
    let hasUserMessage = false;

    if (thread.messages.length === 0) {
      return;
    }

    thread.messages.forEach((message) => {
      if (message.role === "user") {
        hasUserMessage = true;
        if (message.type === "voice") hasVoiceMessage = true;
        if (message.type === "text" || !message.type) hasTextMessage = true;
      }

      // Process assistant messages for actions and purchases
      if (message.role === "assistant") {
        // For AiThread messages (have pageUrl), process structured actions
        if (message.pageUrl !== null) {
          processAssistantMessage(
            message,
            redirectMaps,
            globalStats,
            purchases,
            actionsDetails
          );
        }
        // For TextChat/VoiceChat messages (no pageUrl), process action fields
        else if (message.pageUrl === null) {
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

    if (hasUserMessage) {
      if (hasVoiceMessage) globalStats.totalVoiceChats++;
      if (hasTextMessage) globalStats.totalTextChats++;
    }
  });
}

async function fetchWebsiteContent(website: any, stats: any) {
  // Simplified content fetching - you can expand this based on website type
  let content: {
    products: any[];
    blogPosts: any[];
    pages: any[];
    collections: any[];
    discounts: any[];
  } = {
    products: [],
    blogPosts: [],
    pages: [],
    collections: [],
    discounts: [],
  };

  try {
    switch (website.type) {
      case "Shopify":
        const shopifyProducts = (await query(
          `SELECT * FROM ShopifyProduct WHERE websiteId = ? LIMIT 100`,
          [website.id]
        )) as any[];

        content.products = shopifyProducts.map((prod) => ({
          id: prod.id,
          title: prod.title,
          url: `/products/${prod.handle}`,
          handle: prod.handle,
          price: 0, // You can fetch variants for actual price
          variants: [],
        }));
        break;

      case "WordPress":
        const wpProducts = (await query(
          `SELECT * FROM WordpressProduct WHERE websiteId = ? LIMIT 100`,
          [website.id]
        )) as any[];

        content.products = wpProducts.map((prod) => ({
          id: prod.id,
          title: prod.name,
          url: `/products/${prod.slug}`,
          handle: prod.slug,
          price: prod.price || 0,
        }));
        break;
    }
  } catch (error) {
    console.error(`Error fetching content for website ${website.id}:`, error);
  }

  return content;
}

function buildBasicResponseData(
  website: any,
  stats: any,
  content: any,
  threads: any[]
) {
  const responseData = {
    globalStats: stats.globalStats,
    actionDetails: stats.actionsDetails || {
      cart: [],
      movement: [],
      orders: [],
    },
    actionConversations: {
      cart: [],
      movement: [],
      orders: [],
    },
  };

  // Group full conversations by action type with their matching action entries
  try {
    const threadMap = new Map(threads.map((t) => [t.id, t]));
    const mapThreadsForAction = (key: string) => {
      const arr =
        (responseData.actionDetails?.[key] as Array<{ threadId: string }>) ||
        [];
      const ids = new Set(arr.map((e: any) => e.threadId).filter(Boolean));
      return Array.from(ids)
        .map((id) => ({
          thread: threadMap.get(id),
          actions: arr.filter((e: any) => e.threadId === id),
        }))
        .filter((x) => x.thread);
    };
    (responseData as any).actionConversations = {
      cart: mapThreadsForAction("cart"),
      movement: mapThreadsForAction("movement"),
      orders: mapThreadsForAction("orders"),
    };
  } catch {}

  return responseData;
}

function extractHandle(url: string, type: string): string | null {
  try {
    let path = url;
    if (url.startsWith("http")) {
      const urlObj = new URL(url);
      path = urlObj.pathname;
    }
    const parts = path.split("/").filter(Boolean);
    if (parts.length >= 2) {
      let t = parts[0];
      let h = parts[1];
      if (["product", "products"].includes(t)) t = "products";
      if (t === type) {
        return h.toLowerCase().replace(/[\/.]+$/, "");
      }
    }
  } catch (e) {
    return null;
  }
  return null;
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

function processAssistantMessage(
  message: any,
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

            if (purchases && message.threadId) {
              if (!purchases.byThread.has(message.threadId)) {
                purchases.byThread.set(message.threadId, new Set<string>());
              }
              const set = purchases.byThread.get(message.threadId)!;
              // Prefer explicit identifiers in order: handle, id, name, url
              const key =
                productHandle || productId || productName || url || "unknown";
              set.add(key);

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
        case "scroll":
          globalStats.totalAiScrolls++;
          if (actionsDetails && message.threadId) {
            actionsDetails.movement.push({
              threadId: message.threadId,
              messageId: message.id,
              createdAt: message.createdAt.toISOString(),
              actionType: "scroll",
              scrollToText: contentObj.action_context?.exact_text ?? null,
              sectionId: contentObj.action_context?.section_id,
            });
          }
          break;
        case "click":
          globalStats.totalAiClicks++;
          if (actionsDetails && message.threadId) {
            actionsDetails.movement.push({
              threadId: message.threadId,
              messageId: message.id,
              createdAt: message.createdAt.toISOString(),
              actionType: "click",
              url: contentObj.action_context?.url,
              buttonText: contentObj.action_context?.button_text,
            });
          }
          break;
      }
    }
  } catch (e) {
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

        if (!purchases.byThread.has(message.threadId)) {
          purchases.byThread.set(message.threadId, new Set<string>());
        }
        const set = purchases.byThread.get(message.threadId)!;
        const key = handle || url || "unknown";
        set.add(key);

        purchases.raw.push({
          threadId: message.threadId,
          url: url ?? undefined,
          handle: handle ?? undefined,
          createdAt: message.createdAt.toISOString(),
        });
      }
    }
    if (message.content.includes('"action":"click"')) {
      globalStats.totalAiClicks++;
    }
  }
}

function processTextVoiceChatActions(
  message: any,
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
  const actionData = message.action;
  const actionType = message.actionType;

  if (!actionData) {
    return;
  }

  // Check for cart actions
  const isCartAction = ["add_to_cart", "get_cart", "delete_from_cart"].includes(
    actionData
  );

  if (isCartAction) {
    globalStats.totalAiClicks++;

    if (actionsDetails && threadId) {
      actionsDetails.cart.push({
        threadId: threadId,
        messageId: message.id,
        createdAt: message.createdAt.toISOString(),
        actionType: actionType || actionData,
      });
    }

    // Track add_to_cart as purchases for revenue calculations
    if (actionData === "add_to_cart" && purchases && threadId) {
      try {
        // Parse actionType JSON to extract product info
        let productInfo = null;
        if (typeof actionType === "string" && actionType !== "add_to_cart") {
          productInfo = JSON.parse(actionType);
        } else if (actionType) {
          if (typeof actionType === "string") {
            try {
              productInfo = JSON.parse(actionType);
            } catch {
              productInfo = { product_name: actionType };
            }
          } else if (typeof actionType === "object") {
            productInfo = actionType;
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
            productName: key,
            handle: key.toLowerCase().replace(/\s+/g, "-"),
            createdAt: message.createdAt.toISOString(),
          });
        }
      } catch (e) {
        console.error("Error tracking purchase from cart action:", e);
      }
    }
  }

  // Handle movement actions - check both actionData and actionType
  // Voice actions have actionData="true" and actionType="navigate"/"click"/etc
  const movementActions = [
    "scroll",
    "highlight",
    "navigate",
    "fill_form",
    "fillForm",
    "click",
  ];
  if (
    movementActions.includes(actionData) ||
    (actionType && movementActions.includes(actionType)) ||
    (actionData === "true" &&
      actionType &&
      movementActions.includes(actionType))
  ) {
    if (actionType === "scroll") {
      globalStats.totalAiScrolls++;
    } else {
      globalStats.totalAiClicks++;
    }

    if (actionsDetails && threadId) {
      actionsDetails.movement.push({
        threadId: threadId,
        messageId: message.id,
        createdAt: message.createdAt.toISOString(),
        actionType: actionType || "navigate",
        scrollToText:
          actionType === "scroll" ? message.scrollToText || null : null,
      });
    }
  }

  // Handle order actions
  const isOrderAction = [
    "get_order",
    "track_order",
    "return_order",
    "cancel_order",
    "exchange_order",
  ].includes(actionData);

  if (isOrderAction) {
    globalStats.totalAiClicks++;
    if (actionsDetails && threadId) {
      actionsDetails.orders.push({
        threadId: threadId,
        messageId: message.id,
        createdAt: message.createdAt.toISOString(),
        actionType: actionType || actionData,
      });
    }
  }
}
