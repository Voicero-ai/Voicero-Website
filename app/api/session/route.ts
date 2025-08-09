// app/api/session/route.ts

import { NextRequest, NextResponse } from "next/server";
import { cors } from "../../../lib/cors";
import { query } from "../../../lib/db";

export const dynamic = "force-dynamic";

// Define interfaces for database entities
interface Session {
  id: string;
  websiteId: string;
  shopifyCustomerId: string | null;
  textOpen: boolean;
  createdAt: Date;
  updatedAt: Date;
  threads: AiThread[];
  customer?: ShopifyCustomer;
}

interface AiThread {
  id: string;
  threadId: string;
  title: string;
  websiteId: string;
  createdAt: Date;
  lastMessageAt: Date;
  messages: AiMessage[];
}

interface AiMessage {
  id: string;
  threadId: string;
  role: string;
  content: string;
  createdAt: Date;
}

interface ShopifyCustomer {
  id: string;
  shopifyId: string;
  websiteId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}

export async function OPTIONS(request: NextRequest) {
  // CORS preflight
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  // Create a brand-new session (with a thread) when given a websiteId
  try {
    console.log("Session POST received at:", new Date().toISOString());
    console.log("POST Request URL:", request.url);
    console.log("POST Request method:", request.method);
    console.log(
      "POST Request headers:",
      Object.fromEntries(request.headers.entries())
    );

    // Clone the request before reading it so we can log the raw body
    const clonedRequest = request.clone();
    let rawBody = "";
    try {
      rawBody = await clonedRequest.text();
      console.log("Raw request body:", rawBody);
    } catch (e) {
      console.error("Error reading raw body:", e);
    }

    let requestBody;
    try {
      requestBody = await request.json();
      console.log("Parsed request body:", JSON.stringify(requestBody, null, 2));
    } catch (e) {
      console.error("Error parsing JSON body:", e);
      return cors(
        request,
        NextResponse.json(
          { error: "Invalid JSON in request body" },
          { status: 400 }
        )
      );
    }

    const { websiteId, shopifyId, pageUrl, shopifyCustomerId } = requestBody;
    if (!websiteId) {
      return cors(
        request,
        NextResponse.json({ error: "Website ID is required" }, { status: 400 })
      );
    }

    // Check if there's a Shopify customer with this ID
    let finalShopifyCustomerId = shopifyCustomerId || null;
    if (shopifyId && !shopifyCustomerId) {
      console.log(`Looking for Shopify customer with ID: ${shopifyId}`);
      const shopifyCustomers = (await query(
        "SELECT id FROM ShopifyCustomer WHERE websiteId = ? AND shopifyId = ?",
        [websiteId, shopifyId.toString()]
      )) as { id: string }[];

      if (shopifyCustomers.length > 0) {
        console.log(`Found Shopify customer: ${shopifyCustomers[0].id}`);
        finalShopifyCustomerId = shopifyCustomers[0].id;
      } else {
        console.log(`No Shopify customer found with ID: ${shopifyId}`);
      }
    }

    // Log pageUrl if present
    if (pageUrl) {
      console.log(`Page URL received in POST: ${pageUrl}`);
    } else {
      console.log("No pageUrl provided in POST request");
    }

    // Generate a new UUID for the thread
    const threadId = crypto.randomUUID();

    console.log(`Creating new session for website ${websiteId}...`);

    // Create a new session
    const sessionResult = await query(
      "INSERT INTO Session (websiteId, shopifyCustomerId, textOpen) VALUES (?, ?, ?)",
      [websiteId, finalShopifyCustomerId, false]
    );

    const sessionId = (sessionResult as any).insertId;

    // Create a new thread for this session
    const threadResult = await query(
      "INSERT INTO AiThread (threadId, title, websiteId) VALUES (?, ?, ?)",
      [threadId, "New Conversation", websiteId]
    );

    const threadDbId = (threadResult as any).insertId;

    // Associate the thread with the session
    await query("INSERT INTO _AiThreadToSession (A, B) VALUES (?, ?)", [
      threadDbId,
      sessionId,
    ]);

    // Fetch the complete session with threads and messages
    const sessions = (await query(
      `SELECT s.*, t.id as thread_id, t.threadId as thread_uuid, t.title, t.websiteId as thread_websiteId, 
       t.createdAt as thread_createdAt, t.lastMessageAt as thread_lastMessageAt
       FROM Session s
       LEFT JOIN _AiThreadToSession ats ON s.id = ats.B
       LEFT JOIN AiThread t ON ats.A = t.id
       WHERE s.id = ?
       ORDER BY t.lastMessageAt DESC`,
      [sessionId]
    )) as any[];

    if (sessions.length === 0) {
      return cors(
        request,
        NextResponse.json(
          { error: "Failed to create session" },
          { status: 500 }
        )
      );
    }

    // Reconstruct the session object
    const session: any = {
      id: sessions[0].id,
      websiteId: sessions[0].websiteId,
      shopifyCustomerId: sessions[0].shopifyCustomerId,
      textOpen: sessions[0].textOpen === 1,
      createdAt: sessions[0].createdAt,
      updatedAt: sessions[0].updatedAt,
      threads: [],
    };

    // Get any messages for the thread
    const messages = (await query(
      "SELECT * FROM AiMessage WHERE threadId = ? ORDER BY createdAt ASC",
      [threadDbId]
    )) as AiMessage[];

    // Add thread to session
    const thread = {
      id: sessions[0].thread_id,
      threadId: sessions[0].thread_uuid,
      title: sessions[0].title,
      websiteId: sessions[0].thread_websiteId,
      createdAt: sessions[0].thread_createdAt,
      lastMessageAt:
        sessions[0].thread_lastMessageAt || sessions[0].thread_createdAt,
      messages: messages,
    };

    session.threads.push(thread);

    // Get customer info if linked
    if (finalShopifyCustomerId) {
      const customers = (await query(
        "SELECT * FROM ShopifyCustomer WHERE id = ?",
        [finalShopifyCustomerId]
      )) as ShopifyCustomer[];

      if (customers.length > 0) {
        session.customer = customers[0];
      }
    }

    return cors(
      request,
      NextResponse.json({
        session,
        thread,
        threadId: thread.threadId, // Explicitly include threadId at the top level
        shopifyCustomerLinked: !!finalShopifyCustomerId,
      })
    );
  } catch (error) {
    console.error("Session creation error:", error);
    return cors(
      request,
      NextResponse.json({ error: "Internal server error" }, { status: 500 })
    );
  }
}

export async function GET(request: NextRequest) {
  // Support fetching by sessionId OR by websiteId (most recent session)
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");
    const websiteId = searchParams.get("websiteId");
    const shopifyId = searchParams.get("shopifyId");
    const pageUrl = searchParams.get("pageUrl");

    // Log URL but don't create UrlMovement record
    if (sessionId && pageUrl) {
      console.log(`Page URL for session ${sessionId}: ${pageUrl}`);
    }

    // Function to check if a thread is less than 1 hour old
    const isThreadRecent = (thread: any): boolean => {
      if (!thread) return false;
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      const threadCreatedAt = new Date(thread.createdAt);
      return threadCreatedAt > oneHourAgo;
    };

    // If shopifyId is provided, try to find the most recent session for that customer
    if (shopifyId && websiteId) {
      console.log(`Looking for session with Shopify ID: ${shopifyId}`);

      // First find the ShopifyCustomer
      const shopifyCustomers = (await query(
        "SELECT * FROM ShopifyCustomer WHERE websiteId = ? AND shopifyId = ?",
        [websiteId, shopifyId.toString()]
      )) as ShopifyCustomer[];

      if (shopifyCustomers.length > 0) {
        const shopifyCustomer = shopifyCustomers[0];
        console.log(`Found Shopify customer: ${shopifyCustomer.id}`);

        // Find the most recent session for this customer
        const customerSessions = (await query(
          `SELECT s.*, t.id as thread_id, t.threadId as thread_uuid, t.title, t.websiteId as thread_websiteId, 
           t.createdAt as thread_createdAt, t.lastMessageAt as thread_lastMessageAt
           FROM Session s
           LEFT JOIN _AiThreadToSession ats ON s.id = ats.B
           LEFT JOIN AiThread t ON ats.A = t.id
           WHERE s.shopifyCustomerId = ? AND s.websiteId = ?
           ORDER BY s.createdAt DESC, t.lastMessageAt DESC`,
          [shopifyCustomer.id, websiteId]
        )) as any[];

        if (customerSessions.length > 0) {
          console.log(
            `Found existing session for Shopify customer: ${customerSessions[0].id}`
          );

          // Reconstruct the session object
          const customerSession: any = {
            id: customerSessions[0].id,
            websiteId: customerSessions[0].websiteId,
            shopifyCustomerId: customerSessions[0].shopifyCustomerId,
            textOpen: customerSessions[0].textOpen === 1,
            createdAt: customerSessions[0].createdAt,
            updatedAt: customerSessions[0].updatedAt,
            threads: [],
            customer: shopifyCustomer,
          };

          // Group threads by ID
          const threadMap = new Map<string, any>();
          for (const row of customerSessions) {
            if (row.thread_id && !threadMap.has(row.thread_id)) {
              threadMap.set(row.thread_id, {
                id: row.thread_id,
                threadId: row.thread_uuid,
                title: row.title,
                websiteId: row.thread_websiteId,
                createdAt: row.thread_createdAt,
                lastMessageAt: row.thread_lastMessageAt || row.thread_createdAt,
                messages: [],
              });
            }
          }

          // Get messages for all threads
          const threadIds = Array.from(threadMap.keys());
          for (const threadDbId of threadIds) {
            const messages = (await query(
              "SELECT * FROM AiMessage WHERE threadId = ? ORDER BY createdAt ASC",
              [threadDbId]
            )) as AiMessage[];

            const thread = threadMap.get(threadDbId);
            if (thread) {
              thread.messages = messages;
              customerSession.threads.push(thread);
            }
          }

          // Sort threads by lastMessageAt
          customerSession.threads.sort(
            (a: any, b: any) =>
              new Date(b.lastMessageAt).getTime() -
              new Date(a.lastMessageAt).getTime()
          );

          let threadToUse = null;

          // Check if there's a recent thread (less than 1 hour old)
          if (customerSession.threads.length > 0) {
            const mostRecentThread = customerSession.threads[0];
            if (isThreadRecent(mostRecentThread)) {
              console.log(
                `Using existing thread (${mostRecentThread.threadId}) as it's less than 1 hour old`
              );
              threadToUse = mostRecentThread;
            }
          }

          // Create a new thread if no recent thread exists
          if (!threadToUse) {
            console.log(
              `Creating new thread for session ${customerSession.id}...`
            );

            // Generate a new UUID for the thread
            const newThreadId = crypto.randomUUID();

            // Create a new thread
            const threadResult = await query(
              "INSERT INTO AiThread (threadId, title, websiteId) VALUES (?, ?, ?)",
              [newThreadId, "New Conversation", websiteId]
            );

            const newThreadDbId = (threadResult as any).insertId;

            // Associate the thread with the session
            await query("INSERT INTO _AiThreadToSession (A, B) VALUES (?, ?)", [
              newThreadDbId,
              customerSession.id,
            ]);

            // Create thread object
            threadToUse = {
              id: newThreadDbId,
              threadId: newThreadId,
              title: "New Conversation",
              websiteId,
              createdAt: new Date(),
              lastMessageAt: new Date(),
              messages: [],
            };

            // Add the new thread to the session's threads list
            customerSession.threads.unshift(threadToUse);
            console.log(`Created new thread with ID: ${threadToUse.threadId}`);
          }

          // Include both id and threadId for clarity
          console.log(
            `Returning thread with id: ${threadToUse.id} and threadId: ${threadToUse.threadId}`
          );

          return cors(
            request,
            NextResponse.json({
              session: customerSession,
              thread: threadToUse,
              threadId: threadToUse.threadId, // Explicitly include threadId at the top level
              shopifyCustomerLinked: true,
            })
          );
        }

        // If no session exists for this customer, continue with normal flow
        console.log("No existing session found for Shopify customer");
      } else {
        console.log(`No Shopify customer found with ID: ${shopifyId}`);
      }
    }

    // 1) If client passed sessionId, fetch that exact session
    if (sessionId) {
      const sessions = (await query(
        `SELECT s.*, t.id as thread_id, t.threadId as thread_uuid, t.title, t.websiteId as thread_websiteId, 
         t.createdAt as thread_createdAt, t.lastMessageAt as thread_lastMessageAt
         FROM Session s
         LEFT JOIN _AiThreadToSession ats ON s.id = ats.B
         LEFT JOIN AiThread t ON ats.A = t.id
         WHERE s.id = ?
         ORDER BY t.lastMessageAt DESC`,
        [sessionId]
      )) as any[];

      if (sessions.length === 0) {
        return cors(
          request,
          NextResponse.json({ error: "Session not found" }, { status: 404 })
        );
      }

      // Reconstruct the session object
      const session: any = {
        id: sessions[0].id,
        websiteId: sessions[0].websiteId,
        shopifyCustomerId: sessions[0].shopifyCustomerId,
        textOpen: sessions[0].textOpen === 1,
        createdAt: sessions[0].createdAt,
        updatedAt: sessions[0].updatedAt,
        threads: [],
      };

      // Group threads by ID
      const threadMap = new Map<string, any>();
      for (const row of sessions) {
        if (row.thread_id && !threadMap.has(row.thread_id)) {
          threadMap.set(row.thread_id, {
            id: row.thread_id,
            threadId: row.thread_uuid,
            title: row.title,
            websiteId: row.thread_websiteId,
            createdAt: row.thread_createdAt,
            lastMessageAt: row.thread_lastMessageAt || row.thread_createdAt,
            messages: [],
          });
        }
      }

      // Get messages for all threads
      const threadIds = Array.from(threadMap.keys());
      for (const threadDbId of threadIds) {
        const messages = (await query(
          "SELECT * FROM AiMessage WHERE threadId = ? ORDER BY createdAt ASC",
          [threadDbId]
        )) as AiMessage[];

        const thread = threadMap.get(threadDbId);
        if (thread) {
          thread.messages = messages;
          session.threads.push(thread);
        }
      }

      // Sort threads by lastMessageAt
      session.threads.sort(
        (a: any, b: any) =>
          new Date(b.lastMessageAt).getTime() -
          new Date(a.lastMessageAt).getTime()
      );

      // Get customer info if linked
      if (session.shopifyCustomerId) {
        const customers = (await query(
          "SELECT * FROM ShopifyCustomer WHERE id = ?",
          [session.shopifyCustomerId]
        )) as ShopifyCustomer[];

        if (customers.length > 0) {
          session.customer = customers[0];
        }
      }

      let threadToUse = null;

      // Check if there's a recent thread (less than 1 hour old)
      if (session.threads.length > 0) {
        const mostRecentThread = session.threads[0];
        if (isThreadRecent(mostRecentThread)) {
          console.log(
            `Using existing thread (${mostRecentThread.threadId}) as it's less than 1 hour old`
          );
          threadToUse = mostRecentThread;
        }
      }

      // Create a new thread if no recent thread exists
      if (!threadToUse) {
        console.log(`Creating new thread for session ${session.id}...`);

        // Generate a new UUID for the thread
        const newThreadId = crypto.randomUUID();

        // Create a new thread
        const threadResult = await query(
          "INSERT INTO AiThread (threadId, title, websiteId) VALUES (?, ?, ?)",
          [newThreadId, "New Conversation", session.websiteId]
        );

        const newThreadDbId = (threadResult as any).insertId;

        // Associate the thread with the session
        await query("INSERT INTO _AiThreadToSession (A, B) VALUES (?, ?)", [
          newThreadDbId,
          session.id,
        ]);

        // Create thread object
        threadToUse = {
          id: newThreadDbId,
          threadId: newThreadId,
          title: "New Conversation",
          websiteId: session.websiteId,
          createdAt: new Date(),
          lastMessageAt: new Date(),
          messages: [],
        };

        // Add the new thread to the session's threads list
        session.threads.unshift(threadToUse);
        console.log(`Created new thread with ID: ${threadToUse.threadId}`);
      }

      // Include both id and threadId for clarity
      console.log(
        `Returning thread with id: ${threadToUse.id} and threadId: ${threadToUse.threadId}`
      );

      return cors(
        request,
        NextResponse.json({
          session,
          thread: threadToUse,
          threadId: threadToUse.threadId, // Explicitly include threadId at the top level
          shopifyCustomerLinked: !!session.shopifyCustomerId,
        })
      );
    }

    // 2) Otherwise, fallback to finding the most recent session for a website
    if (!websiteId) {
      return cors(
        request,
        NextResponse.json(
          { error: "Either sessionId or websiteId is required" },
          { status: 400 }
        )
      );
    }

    const sessions = (await query(
      `SELECT s.*, t.id as thread_id, t.threadId as thread_uuid, t.title, t.websiteId as thread_websiteId, 
       t.createdAt as thread_createdAt, t.lastMessageAt as thread_lastMessageAt
       FROM Session s
       LEFT JOIN _AiThreadToSession ats ON s.id = ats.B
       LEFT JOIN AiThread t ON ats.A = t.id
       WHERE s.websiteId = ?
       ORDER BY s.createdAt DESC, t.lastMessageAt DESC`,
      [websiteId]
    )) as any[];

    if (sessions.length === 0) {
      return cors(
        request,
        NextResponse.json({ error: "No session found" }, { status: 404 })
      );
    }

    // Reconstruct the session object
    const session: any = {
      id: sessions[0].id,
      websiteId: sessions[0].websiteId,
      shopifyCustomerId: sessions[0].shopifyCustomerId,
      textOpen: sessions[0].textOpen === 1,
      createdAt: sessions[0].createdAt,
      updatedAt: sessions[0].updatedAt,
      threads: [],
    };

    // Group threads by ID
    const threadMap = new Map<string, any>();
    for (const row of sessions) {
      if (row.thread_id && !threadMap.has(row.thread_id)) {
        threadMap.set(row.thread_id, {
          id: row.thread_id,
          threadId: row.thread_uuid,
          title: row.title,
          websiteId: row.thread_websiteId,
          createdAt: row.thread_createdAt,
          lastMessageAt: row.thread_lastMessageAt || row.thread_createdAt,
          messages: [],
        });
      }
    }

    // Get messages for all threads
    const threadIds = Array.from(threadMap.keys());
    for (const threadDbId of threadIds) {
      const messages = (await query(
        "SELECT * FROM AiMessage WHERE threadId = ? ORDER BY createdAt ASC",
        [threadDbId]
      )) as AiMessage[];

      const thread = threadMap.get(threadDbId);
      if (thread) {
        thread.messages = messages;
        session.threads.push(thread);
      }
    }

    // Sort threads by lastMessageAt
    session.threads.sort(
      (a: any, b: any) =>
        new Date(b.lastMessageAt).getTime() -
        new Date(a.lastMessageAt).getTime()
    );

    // Get customer info if linked
    if (session.shopifyCustomerId) {
      const customers = (await query(
        "SELECT * FROM ShopifyCustomer WHERE id = ?",
        [session.shopifyCustomerId]
      )) as ShopifyCustomer[];

      if (customers.length > 0) {
        session.customer = customers[0];
      }
    }

    let threadToUse = null;

    // Check if there's a recent thread (less than 1 hour old)
    if (session.threads.length > 0) {
      const mostRecentThread = session.threads[0];
      if (isThreadRecent(mostRecentThread)) {
        console.log(
          `Using existing thread (${mostRecentThread.threadId}) as it's less than 1 hour old`
        );
        threadToUse = mostRecentThread;
      }
    }

    // Create a new thread if no recent thread exists
    if (!threadToUse) {
      console.log(`Creating new thread for session ${session.id}...`);

      // Generate a new UUID for the thread
      const newThreadId = crypto.randomUUID();

      // Create a new thread
      const threadResult = await query(
        "INSERT INTO AiThread (threadId, title, websiteId) VALUES (?, ?, ?)",
        [newThreadId, "New Conversation", websiteId]
      );

      const newThreadDbId = (threadResult as any).insertId;

      // Associate the thread with the session
      await query("INSERT INTO _AiThreadToSession (A, B) VALUES (?, ?)", [
        newThreadDbId,
        session.id,
      ]);

      // Create thread object
      threadToUse = {
        id: newThreadDbId,
        threadId: newThreadId,
        title: "New Conversation",
        websiteId,
        createdAt: new Date(),
        lastMessageAt: new Date(),
        messages: [],
      };

      // Add the new thread to the session's threads list
      session.threads.unshift(threadToUse);
      console.log(`Created new thread with ID: ${threadToUse.threadId}`);
    }

    // Include both id and threadId for clarity
    console.log(
      `Returning thread with id: ${threadToUse.id} and threadId: ${threadToUse.threadId}`
    );

    return cors(
      request,
      NextResponse.json({
        session,
        thread: threadToUse,
        threadId: threadToUse.threadId, // Explicitly include threadId at the top level
        shopifyCustomerLinked: !!session.shopifyCustomerId,
      })
    );
  } catch (error) {
    console.error("Session retrieval error:", error);
    return cors(
      request,
      NextResponse.json({ error: "Internal server error" }, { status: 500 })
    );
  }
}
