import { NextResponse, NextRequest } from "next/server";
import { cors } from "../../../lib/cors";
import { query } from "../../../lib/db";
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
    // Get the authorization header
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return cors(
        request,
        NextResponse.json(
          { error: "Missing or invalid authorization header" },
          { status: 401 }
        )
      );
    }

    // Extract the access key
    const accessKey = authHeader.split(" ")[1];
    if (!accessKey) {
      return cors(
        request,
        NextResponse.json({ error: "No access key provided" }, { status: 401 })
      );
    }

    // Get request body
    const { websiteId, type } = await request.json();
    if (!websiteId) {
      return cors(
        request,
        NextResponse.json({ error: "Website ID is required" }, { status: 400 })
      );
    }

    const isWordPress = type === "WordPress";

    // Verify website access
    const websites = (await query(
      `SELECT w.* FROM Website w
       JOIN AccessKey ak ON w.id = ak.websiteId
       WHERE w.id = ? AND ak.key = ?`,
      [websiteId, accessKey]
    )) as Website[];

    if (!websites.length) {
      return cors(
        request,
        NextResponse.json(
          { error: "Invalid access key or website ID" },
          { status: 401 }
        )
      );
    }

    const website = websites[0];

    // Check if we need to generate a new analysis
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
    const needsNewAnalysis =
      website.allowMultiAIReview || // Always generate new analysis if allowMultiAIReview is true
      !website.lastAnalysedAt ||
      new Date(website.lastAnalysedAt) < twoDaysAgo ||
      !website.analysis;

    // If we already have an analysis and it's not time for a new one, return it
    if (!needsNewAnalysis && website.analysis) {
      // Fetch the most recent threads for display regardless
      const aiThreads = (await query(
        `SELECT at.*, COUNT(am.id) as messageCount 
         FROM AiThread at
         LEFT JOIN AiMessage am ON at.id = am.threadId
         WHERE at.websiteId = ?
         GROUP BY at.id
         ORDER BY at.lastMessageAt DESC`,
        [website.id]
      )) as AiThread[];

      // For each thread, fetch its messages
      for (const thread of aiThreads) {
        // Get messages
        const messages = (await query(
          `SELECT * FROM AiMessage 
           WHERE threadId = ? 
           ORDER BY createdAt ASC`,
          [thread.id]
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

      // Filter out threads with fewer than 4 messages
      const filteredThreads = aiThreads.filter(
        (thread) => thread.messageCount >= 4
      );

      // Get the 10 most recent filtered threads
      let recentThreads = filteredThreads.slice(0, 10);

      // If we have fewer than 10 threads, add threads with fewer messages
      if (recentThreads.length < 10) {
        const remainingThreads = aiThreads
          .filter((thread) => thread.messageCount < 4)
          .sort(
            (a, b) =>
              new Date(b.lastMessageAt).getTime() -
              new Date(a.lastMessageAt).getTime()
          )
          .slice(0, 10 - recentThreads.length);

        recentThreads = [...recentThreads, ...remainingThreads];
      }

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

      return cors(
        request,
        NextResponse.json({
          success: true,
          threadCount: filteredThreads.length,
          threads: formattedThreads,
          analysis: website.analysis,
          lastAnalysedAt: website.lastAnalysedAt,
        })
      );
    }

    // Fetch ALL AI threads for this website with their complete messages
    const aiThreads = (await query(
      `SELECT at.*, COUNT(am.id) as messageCount 
       FROM AiThread at
       LEFT JOIN AiMessage am ON at.id = am.threadId
       WHERE at.websiteId = ?
       GROUP BY at.id
       ORDER BY at.lastMessageAt DESC`,
      [website.id]
    )) as AiThread[];

    // For each thread, fetch its messages
    for (const thread of aiThreads) {
      // Get messages
      const messages = (await query(
        `SELECT * FROM AiMessage 
         WHERE threadId = ? 
         ORDER BY createdAt ASC`,
        [thread.id]
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

    // Filter out threads with fewer than 4 messages
    const filteredThreads = aiThreads.filter(
      (thread) => thread.messageCount >= 4
    );

    // Get the 10 most recent filtered threads
    let recentThreads = filteredThreads.slice(0, 10);

    // If we have fewer than 10 threads, add threads with fewer messages
    if (recentThreads.length < 10) {
      const remainingThreads = aiThreads
        .filter((thread) => thread.messageCount < 4)
        .sort(
          (a, b) =>
            new Date(b.lastMessageAt).getTime() -
            new Date(a.lastMessageAt).getTime()
        )
        .slice(0, 10 - recentThreads.length);

      recentThreads = [...recentThreads, ...remainingThreads];
    }

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

    // Gather all Shopify customer data related to this websiteId
    const shopifyCustomers = (await query(
      `SELECT * FROM ShopifyCustomer WHERE websiteId = ?`,
      [website.id]
    )) as ShopifyCustomer[];

    // For each customer, get their orders
    for (const customer of shopifyCustomers) {
      const orders = (await query(
        `SELECT * FROM ShopifyCustomerOrder WHERE customerId = ?`,
        [customer.id]
      )) as ShopifyOrder[];
      customer.orders = orders;

      // For each order, get line items
      for (const order of orders) {
        const lineItems = (await query(
          `SELECT * FROM ShopifyCustomerLineItem WHERE orderId = ?`,
          [order.id]
        )) as ShopifyLineItem[];
        order.lineItems = lineItems;
      }
    }

    // Create an analysis prompt for GPT-4.1-mini
    const analysisPrompt = `
    Provide a brief, focused analysis of these customer conversations and Shopify data:
    
    ### Chat Threads
    ${JSON.stringify(formattedThreads, null, 2)}
    
    ### Shopify Customer Data
    ${JSON.stringify(shopifyCustomers, null, 2)}
    
    In 3-5 bullet points, highlight:
    • Key patterns in customer questions
    • Most valuable insights about customer behavior
    • Actionable opportunities to improve customer experience
    `;

    // Call GPT-4.1-mini for analysis
    let analysis = "Analysis not available";
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              "You're a concise e-commerce analyst. Provide only the most important insights in bullet-point format. Be direct and specific. Focus on actionable patterns that would help improve sales and customer experience.",
          },
          {
            role: "user",
            content: analysisPrompt,
          },
        ],
        max_tokens: 750,
      });

      analysis = response.choices[0].message.content || "No analysis generated";

      // Save the analysis and update lastAnalysedAt
      await query(
        `UPDATE Website SET analysis = ?, lastAnalysedAt = ? WHERE id = ?`,
        [analysis, now, website.id]
      );
    } catch (aiError) {
      console.error("AI analysis error:", aiError);
      analysis = "Error generating analysis. Please try again later.";
    }

    return cors(
      request,
      NextResponse.json({
        success: true,
        threadCount: filteredThreads.length,
        threads: formattedThreads,
        analysis: analysis,
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
