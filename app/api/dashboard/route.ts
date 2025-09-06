import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import { NextResponse } from "next/server";
import { subDays, startOfDay, endOfDay, isSameDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { query } from "../../../lib/db";

export const dynamic = "force-dynamic";

// Define types
interface Website {
  id: string;
  url: string;
  type: string;
  active: boolean;
  createdAt: Date;
  aiThreads: AiThread[];
}

interface AiThread {
  id: any;
  messages: AiMessage[];
}

interface AiMessage {
  content: string;
  type: string | null;
  role: string;
  createdAt: Date;
  pageUrl?: string | null;
}

// Helper function to count and categorize actions in a message (optimized)
const categorizeMessageAction = (message: {
  content: string;
  pageUrl?: string | null;
  actionType?: string;
  action?: string;
}) => {
  const result = { cart: 0, movement: 0, orders: 0 };

  // Handle action field from TextChats/VoiceChats first (faster)
  if (message.action || message.actionType) {
    const actionData = message.action;
    const actionType = message.actionType;

    // Check for cart actions
    const isCartAction =
      actionData &&
      ["add_to_cart", "get_cart", "delete_from_cart"].includes(actionData);
    if (
      isCartAction ||
      (actionType &&
        ["add_to_cart", "get_cart", "delete_from_cart"].includes(actionType))
    ) {
      result.cart++;

      // Track add_to_cart as purchases for revenue calculations
      if (actionData === "add_to_cart") {
        // This is a purchase action in the context of cart functionality
      }
      return result;
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
      (actionData && movementActions.includes(actionData)) ||
      (actionType && movementActions.includes(actionType)) ||
      (actionData === "true" &&
        actionType &&
        movementActions.includes(actionType))
    ) {
      result.movement++;
      return result;
    }

    // Handle order actions
    const isOrderAction =
      actionData &&
      [
        "get_order",
        "track_order",
        "return_order",
        "cancel_order",
        "exchange_order",
      ].includes(actionData);
    if (
      isOrderAction ||
      (actionType &&
        [
          "get_order",
          "track_order",
          "return_order",
          "cancel_order",
          "exchange_order",
        ].includes(actionType))
    ) {
      result.orders++;
      return result;
    }
  }

  // Handle structured JSON actions (from AiThreads)
  if (message.content) {
    try {
      let contentToProcess = message.content;
      if (contentToProcess.includes("```json")) {
        contentToProcess = contentToProcess.replace(/```json\n|\n```/g, "");
      }
      const contentObj = JSON.parse(contentToProcess);
      if (contentObj.action) {
        switch (contentObj.action) {
          case "redirect":
          case "scroll":
          case "click":
            result.movement++;
            break;
          case "purchase":
            result.cart++;
            break;
        }
      }
    } catch (e) {
      // If JSON parsing fails, try to find action in the content (fallback)
      if (
        message.content.includes('"action":"redirect"') ||
        message.content.includes('"action":"scroll"') ||
        message.content.includes('"action":"click"')
      ) {
        result.movement++;
      }
      if (message.content.includes('"action":"purchase"')) {
        result.cart++;
      }
    }
  }

  return result;
};

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    console.log("Session:", session);

    if (!session?.user?.id) {
      console.log("No session or user ID found");
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Get the time range from the URL parameters
    const { searchParams } = new URL(request.url);
    const timeRange = searchParams.get("timeRange") || "7"; // Default to 7 days
    const days = parseInt(timeRange);

    // Generate dates for the selected range in UTC
    const dates = Array.from({ length: days })
      .map((_, i) => {
        const date = subDays(new Date(), i);
        const utcDate = toZonedTime(date, "UTC");
        return {
          start: startOfDay(utcDate),
          end: endOfDay(utcDate),
        };
      })
      .reverse();

    // Get user's websites with optimized single query approach
    const websites = (await query(
      "SELECT id, url, type, active, createdAt FROM Website WHERE userId = ?",
      [session.user.id]
    )) as Website[];

    if (websites.length === 0) {
      return NextResponse.json({
        stats: {
          totalChats: 0,
          voiceChats: 0,
          textChats: 0,
          cartActions: 0,
          movementActions: 0,
          orderActions: 0,
          activeSites: 0,
        },
        chartData: [],
        websites: [],
      });
    }

    const websiteIds = websites.map((w) => w.id);

    // For each website, get its threads and messages (following websites/get pattern)
    for (const website of websites) {
      const allThreads: AiThread[] = [];

      // Get AiThreads (original format)
      const aiThreadRows = (await query(
        `SELECT id FROM AiThread WHERE websiteId = ?`,
        [website.id]
      )) as { id: string }[];

      for (const thread of aiThreadRows) {
        const messages = (await query(
          `SELECT content, type, role, createdAt, pageUrl 
           FROM AiMessage 
           WHERE threadId = ? AND createdAt >= ?
           ORDER BY createdAt ASC`,
          [thread.id, dates[0].start]
        )) as AiMessage[];

        if (messages.length > 0) {
          allThreads.push({ id: thread.id, messages });
        }
      }

      // Get TextConversations and their TextChats
      const textConversationRows = (await query(
        `SELECT tc.id, tc.sessionId, tc.createdAt, tc.mostRecentConversationAt
         FROM TextConversations tc
         JOIN Session s ON tc.sessionId COLLATE utf8mb4_unicode_ci = s.id COLLATE utf8mb4_unicode_ci
         WHERE s.websiteId = ?`,
        [website.id]
      )) as any[];

      for (const conv of textConversationRows) {
        const chatRows = (await query(
          `SELECT id, messageType, content, createdAt, action, actionType
           FROM TextChats 
           WHERE textConversationId = ? AND createdAt >= ?
           ORDER BY createdAt ASC`,
          [conv.id, dates[0].start]
        )) as any[];

        if (chatRows.length > 0) {
          const messages: AiMessage[] = chatRows.map(
            (m) =>
              ({
                content: m.content,
                type: m.messageType === "user" ? "text" : "ai",
                role: m.messageType === "user" ? "user" : "assistant",
                createdAt: new Date(m.createdAt),
                pageUrl: null,
                actionType: m.actionType,
                action: m.action,
              } as any)
          );

          allThreads.push({ id: conv.id, messages });
        }
      }

      // Get VoiceConversations and their VoiceChats
      const voiceConversationRows = (await query(
        `SELECT vc.id, vc.sessionId, vc.createdAt, vc.mostRecentConversationAt
         FROM VoiceConversations vc
         JOIN Session s ON vc.sessionId = s.id
         WHERE s.websiteId = ?`,
        [website.id]
      )) as any[];

      for (const conv of voiceConversationRows) {
        const chatRows = (await query(
          `SELECT id, messageType, content, createdAt, action, actionType
           FROM VoiceChats 
           WHERE voiceConversationId = ? AND createdAt >= ?
           ORDER BY createdAt ASC`,
          [conv.id, dates[0].start]
        )) as any[];

        if (chatRows.length > 0) {
          const messages: AiMessage[] = chatRows.map(
            (m) =>
              ({
                content: m.content,
                type: m.messageType === "user" ? "voice" : "ai",
                role: m.messageType === "user" ? "user" : "assistant",
                createdAt: new Date(m.createdAt),
                pageUrl: null,
                actionType: m.actionType,
                action: m.action,
              } as any)
          );

          allThreads.push({ id: conv.id, messages });
        }
      }

      website.aiThreads = allThreads;
    }

    // Calculate total stats with enhanced action tracking
    const totalStats = websites.reduce(
      (acc, website) => {
        const allMessages = website.aiThreads.flatMap(
          (thread) => thread.messages
        );

        // Count conversations (threads), not individual messages
        let voiceConversations = 0;
        let textConversations = 0;

        website.aiThreads.forEach((thread) => {
          if (thread.messages.length === 0) return;

          const hasVoiceMessage = thread.messages.some(
            (m) => m.type === "voice"
          );
          const hasTextMessage = thread.messages.some(
            (m) => m.type === "text" || (!m.type && m.role === "user")
          );

          if (hasVoiceMessage) voiceConversations++;
          if (hasTextMessage) textConversations++;
        });

        const totalChats = voiceConversations + textConversations;

        const actionCounts = allMessages.reduce(
          (sum, message) => {
            if (message.role === "assistant") {
              const actions = categorizeMessageAction({
                content: message.content,
                pageUrl: message.pageUrl,
                actionType: (message as any).actionType,
                action: (message as any).action,
              });
              sum.cart += actions.cart;
              sum.movement += actions.movement;
              sum.orders += actions.orders;
            }
            return sum;
          },
          { cart: 0, movement: 0, orders: 0 }
        );

        return {
          totalChats: acc.totalChats + totalChats,
          totalMessages: acc.totalMessages + allMessages.length,
          voiceChats: acc.voiceChats + voiceConversations,
          textChats: acc.textChats + textConversations,
          cartActions: acc.cartActions + actionCounts.cart,
          movementActions: acc.movementActions + actionCounts.movement,
          orderActions: acc.orderActions + actionCounts.orders,
        };
      },
      {
        totalChats: 0,
        totalMessages: 0,
        voiceChats: 0,
        textChats: 0,
        cartActions: 0,
        movementActions: 0,
        orderActions: 0,
      }
    );

    // Format websites data with enhanced action tracking
    const formattedWebsites = websites.map((site) => {
      const allMessages = site.aiThreads.flatMap((thread) => thread.messages);
      const monthlyChats = allMessages.filter(
        (m) => m.role === "assistant"
      ).length;

      const actionCounts = allMessages.reduce(
        (sum, message) => {
          if (message.role === "assistant") {
            const actions = categorizeMessageAction({
              content: message.content,
              pageUrl: message.pageUrl,
              actionType: (message as any).actionType,
              action: (message as any).action,
            });
            sum.cart += actions.cart;
            sum.movement += actions.movement;
            sum.orders += actions.orders;
          }
          return sum;
        },
        { cart: 0, movement: 0, orders: 0 }
      );

      return {
        id: site.id,
        domain: site.url,
        platform: site.type.toLowerCase(),
        monthlyChats,
        cartActions: actionCounts.cart,
        movementActions: actionCounts.movement,
        orderActions: actionCounts.orders,
        status: site.active ? "active" : "inactive",
        createdAt: site.createdAt,
      };
    });

    // Generate chart data for each day with new graph structures
    const chartData = dates.map(({ start }) => {
      const dayMessages = websites.flatMap((site) =>
        site.aiThreads.flatMap((thread) =>
          thread.messages.filter((message) => {
            const messageDate = new Date(message.createdAt);
            return isSameDay(messageDate, start);
          })
        )
      );

      // Count actions by type for Graph 1: Actions Per Day
      const actionCounts = dayMessages.reduce(
        (sum, message) => {
          if (message.role === "assistant") {
            const actions = categorizeMessageAction({
              content: message.content,
              pageUrl: message.pageUrl,
              actionType: (message as any).actionType,
              action: (message as any).action,
            });
            sum.cart += actions.cart;
            sum.movement += actions.movement;
            sum.orders += actions.orders;
          }
          return sum;
        },
        { cart: 0, movement: 0, orders: 0 }
      );

      // Count conversations by type for Graph 2: Text vs Voice Conversations Per Day
      const threadsForDay = websites.flatMap((site) =>
        site.aiThreads.filter((thread) =>
          thread.messages.some((message) => {
            const messageDate = new Date(message.createdAt);
            return isSameDay(messageDate, start);
          })
        )
      );

      let voiceConversationsForDay = 0;
      let textConversationsForDay = 0;

      threadsForDay.forEach((thread) => {
        const hasVoiceMessage = thread.messages.some((m) => m.type === "voice");
        const hasTextMessage = thread.messages.some(
          (m) => m.type === "text" || (!m.type && m.role === "user")
        );

        if (hasVoiceMessage) voiceConversationsForDay++;
        if (hasTextMessage) textConversationsForDay++;
      });

      const conversationCounts = {
        textConversations: textConversationsForDay,
        voiceConversations: voiceConversationsForDay,
      };

      return {
        date: start.toISOString(),
        // Graph 1: Actions Per Day
        cartActions: actionCounts.cart,
        movementActions: actionCounts.movement,
        orderActions: actionCounts.orders,
        // Graph 2: Text vs Voice Conversations Per Day
        textConversations: conversationCounts.textConversations,
        voiceConversations: conversationCounts.voiceConversations,
        // Legacy data for backward compatibility
        chats: dayMessages.filter((m) => m.role === "assistant").length,
      };
    });

    return NextResponse.json({
      stats: {
        totalChats: totalStats.totalChats,
        voiceChats: totalStats.voiceChats,
        textChats: totalStats.textChats,
        cartActions: totalStats.cartActions,
        movementActions: totalStats.movementActions,
        orderActions: totalStats.orderActions,
        activeSites: websites.filter((w) => w.active).length,
      },
      chartData,
      websites: formattedWebsites,
    });
  } catch (error) {
    console.error("Dashboard API Error:", error);
    if (error instanceof Error) {
      return new NextResponse(error.message, { status: 500 });
    }
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
