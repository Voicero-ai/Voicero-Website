import OpenAI from "openai";
import { query } from "./db";

// Minimal types mirroring DB rows used here
interface AiMessageRow {
  id: string;
  role: string;
  content: string;
  type: string | null;
  createdAt: Date;
  threadId: string;
  pageUrl: string | null;
  scrollToText: string | null;
}

interface SessionRow {
  id: string;
}

interface AiThreadRow {
  id: string;
  threadId: string;
  title: string | null;
  createdAt: Date;
  lastMessageAt: Date;
  messageCount: number;
}

export type RevenueSummary = {
  amount: number;
  currency: string;
  breakdown: { threads: number; percent_of_total_threads: number; aov: number };
};

export type WebsiteAIOverview = {
  period_label: string;
  total_message_threads: number;
  total_revenue_increase: RevenueSummary;
  problem_resolution_rate: {
    percent: number;
    resolved_threads: number;
    total_threads: number;
  };
  avg_messages_per_thread: number;
  most_common_questions: Array<{
    category: string;
    threads: number;
    description: string;
  }>;
  recent_questions_by_topic: Array<{
    topic: string;
    items: Array<{
      question: string;
      status: "Resolved" | "Needs attention" | string;
      note?: string | null;
    }>;
  }>;
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Local helpers for revenue extraction
function extractHandleFromUrl(url: string): string | null {
  try {
    let path = url;
    if (url.startsWith("http")) {
      const u = new URL(url);
      path = u.pathname;
    }
    const parts = path.split("/").filter(Boolean);
    if (parts.length >= 2) {
      let t = parts[0];
      let h = parts[1];
      if (["product", "products"].includes(t)) t = "products";
      if (t === "products") return h.toLowerCase().replace(/[\/.]+$/, "");
    }
    return null;
  } catch {
    return null;
  }
}

function tryParseContentJson(raw: string): any | null {
  try {
    let s = raw;
    if (s.includes("```json")) s = s.replace(/```json\n|\n```/g, "");
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export async function getWebsiteAIOverview(
  websiteId: string
): Promise<WebsiteAIOverview | { error: string; message?: string }> {
  const now = new Date();
  const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

  // Fetch AiThreads within the last 4 weeks (28 days)
  const aiThreads = (await query(
    `SELECT at.*, COUNT(am.id) as messageCount
     FROM AiThread at
     LEFT JOIN AiMessage am ON at.id = am.threadId AND am.createdAt >= ?
     WHERE at.websiteId = ? AND at.lastMessageAt >= ?
     GROUP BY at.id
     ORDER BY at.lastMessageAt DESC`,
    [fourWeeksAgo, websiteId, fourWeeksAgo]
  )) as AiThreadRow[];

  // Attach messages and sessions for each AiThread
  for (const thread of aiThreads) {
    const messages = (await query(
      `SELECT * FROM AiMessage WHERE threadId = ? AND createdAt >= ? ORDER BY createdAt ASC`,
      [thread.id, fourWeeksAgo]
    )) as AiMessageRow[];
    (thread as any).messages = messages;

    const sessions = (await query(
      `SELECT s.* FROM Session s JOIN _AiThreadToSession ats ON s.id = ats.B WHERE ats.A = ?`,
      [thread.id]
    )) as SessionRow[];
    (thread as any).sessions = sessions;
  }

  // Fetch TextConversations within the last 4 weeks
  const textConversationRows = (await query(
    `SELECT tc.id, tc.sessionId, tc.createdAt, 
            COALESCE(tc.mostRecentConversationAt, tc.createdAt) as lastMessageAt,
            tc.totalMessages as messageCount
     FROM TextConversations tc
     JOIN Session s ON tc.sessionId COLLATE utf8mb4_unicode_ci = s.id COLLATE utf8mb4_unicode_ci
     WHERE s.websiteId = ? AND (tc.mostRecentConversationAt >= ? OR tc.createdAt >= ?)
     ORDER BY COALESCE(tc.mostRecentConversationAt, tc.createdAt) DESC`,
    [websiteId, fourWeeksAgo, fourWeeksAgo]
  )) as any[];

  // Convert TextConversations to thread format
  for (const conv of textConversationRows) {
    const chatRows = (await query(
      `SELECT id, messageType, content, createdAt, textConversationId as threadId, action, actionType
       FROM TextChats WHERE textConversationId = ? AND createdAt >= ? 
       ORDER BY createdAt ASC`,
      [conv.id, fourWeeksAgo]
    )) as any[];

    const messages: AiMessageRow[] = chatRows.map((m) => ({
      id: m.id,
      threadId: m.threadId,
      role: m.messageType === "user" ? "user" : "assistant",
      content: m.content,
      type: m.messageType === "user" ? "text" : null,
      createdAt: new Date(m.createdAt),
      pageUrl: null,
      scrollToText: null,
      action: m.action,
      actionType: m.actionType,
    } as any));

    if (messages.length > 0) {
      const lastMessageAt = conv.lastMessageAt instanceof Date 
        ? conv.lastMessageAt 
        : new Date(conv.lastMessageAt);

      aiThreads.push({
        id: conv.id,
        threadId: conv.id,
        title: "Text Conversation",
        createdAt: conv.createdAt instanceof Date ? conv.createdAt : new Date(conv.createdAt),
        lastMessageAt: lastMessageAt,
        messageCount: messages.length,
        messages: messages,
        sessions: [],
        source_type: "textconversation",
      } as any);
    }
  }

  // Fetch VoiceConversations within the last 4 weeks
  const voiceConversationRows = (await query(
    `SELECT vc.id, vc.sessionId, vc.createdAt,
            COALESCE(vc.mostRecentConversationAt, vc.createdAt) as lastMessageAt,
            vc.totalMessages as messageCount
     FROM VoiceConversations vc
     JOIN Session s ON vc.sessionId = s.id
     WHERE s.websiteId = ? AND (vc.mostRecentConversationAt >= ? OR vc.createdAt >= ?)
     ORDER BY COALESCE(vc.mostRecentConversationAt, vc.createdAt) DESC`,
    [websiteId, fourWeeksAgo, fourWeeksAgo]
  )) as any[];

  // Convert VoiceConversations to thread format
  for (const conv of voiceConversationRows) {
    const chatRows = (await query(
      `SELECT id, messageType, content, createdAt, voiceConversationId as threadId, action, actionType
       FROM VoiceChats WHERE voiceConversationId = ? AND createdAt >= ? 
       ORDER BY createdAt ASC`,
      [conv.id, fourWeeksAgo]
    )) as any[];

    const messages: AiMessageRow[] = chatRows.map((m) => ({
      id: m.id,
      threadId: m.threadId,
      role: m.messageType === "user" ? "user" : "assistant",
      content: m.content,
      type: m.messageType === "user" ? "voice" : null,
      createdAt: new Date(m.createdAt),
      pageUrl: null,
      scrollToText: null,
      action: m.action,
      actionType: m.actionType,
    } as any));

    if (messages.length > 0) {
      const lastMessageAt = conv.lastMessageAt instanceof Date 
        ? conv.lastMessageAt 
        : new Date(conv.lastMessageAt);

      aiThreads.push({
        id: conv.id,
        threadId: conv.id,
        title: "Voice Conversation",
        createdAt: conv.createdAt instanceof Date ? conv.createdAt : new Date(conv.createdAt),
        lastMessageAt: lastMessageAt,
        messageCount: messages.length,
        messages: messages,
        sessions: [],
        source_type: "voiceconversation",
      } as any);
    }
  }

  // Deterministic revenue detection for last 4 weeks
  console.time("overview-revenue-calc");
  const revenueSummary: RevenueSummary = {
    amount: 0,
    currency: "USD",
    breakdown: { threads: 0, percent_of_total_threads: 0, aov: 0 },
  };
  try {
    // Build Shopify product price lookups for this website
    const products = (await query(
      `SELECT id, handle, title FROM ShopifyProduct WHERE websiteId = ?`,
      [websiteId]
    )) as Array<{ id: string; handle: string | null; title: string | null }>;

    let variants: Array<{ productId: string; price: number | null }> = [];
    if (products.length > 0) {
      const productIds = products.map((p) => p.id);
      // chunk if needed; dataset is small, fetch directly
      variants = (await query(
        `SELECT productId, price FROM ShopifyProductVariant WHERE productId IN (${productIds
          .map(() => "?")
          .join(",")})`,
        productIds
      )) as Array<{ productId: string; price: number | null }>;
    }

    const productIdToBestPrice = new Map<string, number>();
    for (const v of variants) {
      const current = productIdToBestPrice.get(v.productId);
      const candidate = typeof v.price === "number" ? v.price : undefined;
      if (candidate === undefined) continue;
      // Prefer first non-zero; otherwise keep any number
      if (current === undefined) {
        productIdToBestPrice.set(v.productId, candidate);
      } else if (current === 0 && candidate > 0) {
        productIdToBestPrice.set(v.productId, candidate);
      }
    }

    const handleToPrice = new Map<string, number>();
    const idToPrice = new Map<string, number>();
    const titleToPrice = new Map<string, number>();
    for (const p of products) {
      const price = productIdToBestPrice.get(p.id) ?? 0;
      if (p.handle) handleToPrice.set(p.handle.toLowerCase(), price);
      idToPrice.set(p.id, price);
      if (p.title)
        titleToPrice.set(
          p.title.toLowerCase().replace(/\s+/g, " ").trim(),
          price
        );
    }

    // Scan assistant messages for purchase actions
    const purchasesByThread = new Map<string, Set<string>>();
    const rawPurchases: Array<{
      threadId: string;
      url?: string;
      handle?: string;
      productId?: string;
      productName?: string;
    }> = [];

    for (const t of aiThreads as any[]) {
      const msgs = (t.messages as AiMessageRow[]) || [];
      for (const m of msgs) {
        if (m.role !== "assistant") continue;
        
        let detected = false;
        
        // First check if this is a TextChat/VoiceChat with action field
        if ((m as any).action) {
          const action = (m as any).action;
          if (action === "add_to_cart" || action === "purchase") {
            // Extract product info from actionType or content
            let productId: string | undefined;
            let productName: string | undefined;
            let url: string | undefined;
            let handle: string | undefined;

            const actionType = (m as any).actionType;
            if (actionType) {
              if (typeof actionType === "object") {
                productId = actionType.product_id || actionType.variant_id;
                productName = actionType.product_name || actionType.item_name;
                url = actionType.url;
              } else if (typeof actionType === "string") {
                // Try to extract from string
                productName = actionType;
              }
            }

            // Try to extract handle from URL if available
            if (url) {
              handle = extractHandleFromUrl(url) || undefined;
            }

            const key = handle || productId || productName || url || "unknown";
            if (!purchasesByThread.has(t.id))
              purchasesByThread.set(t.id, new Set());
            purchasesByThread.get(t.id)!.add(String(key));
            rawPurchases.push({
              threadId: t.id,
              url,
              handle,
              productId,
              productName,
            });
            detected = true;
          }
        }

        // Fallback to JSON parsing from content (for AiThread messages)
        if (!detected) {
          const obj = tryParseContentJson(m.content);
          if (obj && obj.action === "purchase") {
            const ctx = obj.action_context || {};
            const url = ctx.url || ctx.product_url || undefined;
            const handle = url
              ? extractHandleFromUrl(url) || undefined
              : undefined;
            const productId = ctx.product_id || ctx.id || undefined;
            const productName = ctx.product_name || ctx.title || undefined;
            const key = handle || productId || productName || url || "unknown";
            if (!purchasesByThread.has(t.id))
              purchasesByThread.set(t.id, new Set());
            purchasesByThread.get(t.id)!.add(String(key));
            rawPurchases.push({
              threadId: t.id,
              url,
              handle,
              productId,
              productName,
            });
            detected = true;
          }
          if (!detected && m.content.includes('"action":"purchase"')) {
            // fallback: extract URL and attempt parse for ids/names
            const urls = m.content.match(
              /https?:\/\/[^\s)]+|(?:\/(?:pages|products|blogs|collections)\/[^\s)]+)/g
            );
            const url = urls && urls.length > 0 ? urls[0] : undefined;
            const handle = url
              ? extractHandleFromUrl(url) || undefined
              : undefined;
            let productId: string | undefined;
            let productName: string | undefined;
            const maybe = tryParseContentJson(m.content);
            if (maybe) {
              productId =
                maybe?.action_context?.product_id || maybe?.action_context?.id;
              productName =
                maybe?.action_context?.product_name ||
                maybe?.action_context?.title;
            }
            const key = handle || productId || productName || url || "unknown";
            if (!purchasesByThread.has(t.id))
              purchasesByThread.set(t.id, new Set());
            purchasesByThread.get(t.id)!.add(String(key));
            rawPurchases.push({
              threadId: t.id,
              url,
              handle,
              productId,
              productName,
            });
          }
        }
      }
    }

    const threadIdsWithPurchases = Array.from(purchasesByThread.keys());
    const totalThreads = aiThreads.length;
    let totalAmount = 0;
    const matched: Array<{ key: string; price: number }> = [];
    const unmatched: string[] = [];
    purchasesByThread.forEach((keys) => {
      Array.from(keys.values()).forEach((rawKey) => {
        let price: number | undefined;
        const key = rawKey || "";
        const handle = key.includes("/") ? extractHandleFromUrl(key) : key;
        if (handle) price = handleToPrice.get(String(handle).toLowerCase());
        if (price === undefined && key) price = idToPrice.get(String(key));
        if (price === undefined && key)
          price = titleToPrice.get(
            String(key).toLowerCase().replace(/\s+/g, " ").trim()
          );
        if (typeof price === "number") {
          matched.push({ key, price });
          totalAmount += price;
        } else {
          unmatched.push(key);
        }
      });
    });

    revenueSummary.amount = Math.round(totalAmount * 100) / 100;
    revenueSummary.breakdown.threads = threadIdsWithPurchases.length;
    revenueSummary.breakdown.percent_of_total_threads = totalThreads
      ? Math.round((threadIdsWithPurchases.length / totalThreads) * 100)
      : 0;
    revenueSummary.breakdown.aov = threadIdsWithPurchases.length
      ? Math.round((totalAmount / threadIdsWithPurchases.length) * 100) / 100
      : 0;

    console.log("Overview revenue: raw purchases:", rawPurchases);
    console.log("Overview revenue: lookups sizes", {
      handleToPrice: handleToPrice.size,
      idToPrice: idToPrice.size,
      titleToPrice: titleToPrice.size,
    });
    console.log("Overview revenue: matched sample:", matched.slice(0, 10));
    console.log("Overview revenue: unmatched sample:", unmatched.slice(0, 10));
    console.log("Overview revenue: totalAmount, AOV, threads:", {
      totalAmount: revenueSummary.amount,
      aov: revenueSummary.breakdown.aov,
      threads: revenueSummary.breakdown.threads,
    });
  } catch (e) {
    console.error("Overview revenue calc error:", e);
  } finally {
    console.timeEnd("overview-revenue-calc");
  }

  // Format payload similar to aiHistory for the model
  const formattedThreads = aiThreads.map((t: any) => ({
    id: t.id,
    threadId: t.threadId,
    title: t.title || "Untitled Thread",
    createdAt: t.createdAt,
    lastMessageAt: t.lastMessageAt,
    messageCount: t.messageCount,
    messages: (t.messages as AiMessageRow[]).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      type: m.type,
      createdAt: m.createdAt,
      threadId: m.threadId,
      pageUrl: m.pageUrl,
      scrollToText: m.scrollToText,
    })),
    sessions: (t.sessions as SessionRow[]).map((s) => ({ id: s.id })),
  }));

  // Build strict JSON schema prompt
  const systemPrompt =
    "You output only valid JSON according to the requested schema. Respond ONLY with the JSON object; no code fences or prose.";

  const analysisPrompt = `Analyze the provided AI chat threads, limited to the last 4 weeks (28 days), and produce a single JSON object using this exact schema:
{
  "period_label": string,                    // e.g., "Based on the last 4 weeks"
  "total_message_threads": number,           // total threads in window
  "total_revenue_increase": {
    "amount": number,                        // numeric amount; use 0 if unknown
    "currency": string,                      // e.g., "USD"
    "breakdown": {
      "threads": number,                     // number of threads attributable to revenue
      "percent_of_total_threads": number,    // 0-100
      "aov": number                          // average order value; 0 if unknown
    }
  },
  "problem_resolution_rate": {
    "percent": number,                       // resolved/total*100
    "resolved_threads": number,
    "total_threads": number
  },
  "avg_messages_per_thread": number,
  "most_common_questions": [
    { "category": string, "threads": number, "description": string }
  ],
  "recent_questions_by_topic": [
    {
      "topic": string,
      "items": [
        { "question": string, "status": "Resolved" | "Needs attention", "note": string | null }
      ]
    }
  ]
}

Rules & constraints:
- Consider only messages inside each thread within the last 28 days window.
- If exact revenue cannot be inferred, return 0 for amount and aov, and estimate threads/percent conservatively.
- Classify resolution based on whether the user's issue was answered or the task completed.
- Keep descriptions concise.
- Return only JSON.`;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `${analysisPrompt}\n\n### Threads (last 28 days)\n${JSON.stringify(
            formattedThreads,
            null,
            2
          )}`,
        },
      ],
    });

    const content = resp.choices?.[0]?.message?.content?.trim() || "";
    if (!content) {
      // Even if model fails, return a minimal overview with computed revenue
      return {
        period_label: "Based on the last 4 weeks",
        total_message_threads: aiThreads.length,
        total_revenue_increase: revenueSummary,
        problem_resolution_rate: {
          percent: 0,
          resolved_threads: 0,
          total_threads: aiThreads.length,
        },
        avg_messages_per_thread: 0,
        most_common_questions: [],
        recent_questions_by_topic: [],
      };
    }
    const parsed = JSON.parse(content) as WebsiteAIOverview;
    // Override revenue with deterministic calculation
    parsed.total_revenue_increase = revenueSummary;
    parsed.total_message_threads = aiThreads.length;
    return parsed;
  } catch (e: any) {
    // On model error, still return revenue summary
    return {
      period_label: "Based on the last 4 weeks",
      total_message_threads: aiThreads.length,
      total_revenue_increase: revenueSummary,
      problem_resolution_rate: {
        percent: 0,
        resolved_threads: 0,
        total_threads: aiThreads.length,
      },
      avg_messages_per_thread: 0,
      most_common_questions: [],
      recent_questions_by_topic: [],
    } as WebsiteAIOverview;
  }
}
