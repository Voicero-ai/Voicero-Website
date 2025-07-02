// app/api/session/route.ts

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cors } from "../../../lib/cors";

export const dynamic = "force-dynamic";
const prisma = new PrismaClient();

export async function OPTIONS(request: NextRequest) {
  // CORS preflight
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  // Create a brand-new session (with a thread) when given a websiteId
  try {
    console.log("Session POST received at:", new Date().toISOString());

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
      const shopifyCustomer = await prisma.shopifyCustomer.findFirst({
        where: {
          websiteId,
          shopifyId: shopifyId.toString(),
        },
      });

      if (shopifyCustomer) {
        console.log(`Found Shopify customer: ${shopifyCustomer.id}`);
        finalShopifyCustomerId = shopifyCustomer.id;
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

    console.log(`Creating new session for website ${websiteId}...`);
    const session = await prisma.session.create({
      data: {
        websiteId,
        shopifyCustomerId: finalShopifyCustomerId,
        coreOpen: false,
        chooserOpen: false,
        textOpen: false,
        voiceOpen: false,
        voiceOpenWindowUp: false,
        textWelcome: false,
        voiceWelcome: false,
        autoMic: false,
        textOpenWindowUp: false,
        threads: {
          create: {
            threadId: crypto.randomUUID(),
            title: "New Conversation",
            websiteId,
          },
        },
      },
      include: {
        threads: {
          include: { messages: true },
          orderBy: { lastMessageAt: "desc" },
        },
        ...(finalShopifyCustomerId ? { customer: true } : {}),
      },
    });
    console.log(`Session created with ID: ${session.id}`);

    // Log pageUrl, but don't create UrlMovement record anymore
    if (pageUrl) {
      console.log(`Page URL for session ${session.id}: ${pageUrl}`);
    } else {
      const refererUrl = request.headers.get("referer");
      if (refererUrl) {
        console.log(`Referer URL for session ${session.id}: ${refererUrl}`);
      }
    }

    // Return both session and its initial thread
    const thread = session.threads[0];
    return cors(
      request,
      NextResponse.json({
        session,
        thread,
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
    console.log("Session GET received at:", new Date().toISOString());

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");
    const websiteId = searchParams.get("websiteId");
    const shopifyId = searchParams.get("shopifyId");
    const pageUrl = searchParams.get("pageUrl");

    console.log("Session GET request params:", {
      sessionId,
      websiteId,
      shopifyId,
      pageUrl,
      url: request.url,
    });

    // Log URL but don't create UrlMovement record
    if (sessionId && pageUrl) {
      console.log(`Page URL for session ${sessionId}: ${pageUrl}`);
    }

    // If shopifyId is provided, try to find the most recent session for that customer
    if (shopifyId && websiteId) {
      console.log(`Looking for session with Shopify ID: ${shopifyId}`);

      // First find the ShopifyCustomer
      const shopifyCustomer = await prisma.shopifyCustomer.findFirst({
        where: {
          websiteId,
          shopifyId: shopifyId.toString(),
        },
      });

      if (shopifyCustomer) {
        console.log(`Found Shopify customer: ${shopifyCustomer.id}`);

        // Find the most recent session for this customer
        const customerSession = await prisma.session.findFirst({
          where: {
            shopifyCustomerId: shopifyCustomer.id,
            websiteId,
          },
          include: {
            threads: {
              include: { messages: true },
              orderBy: { lastMessageAt: "desc" },
            },
            customer: true,
          },
          orderBy: { createdAt: "desc" },
        });

        if (customerSession) {
          console.log(
            `Found existing session for Shopify customer: ${customerSession.id}`
          );

          // Create a new thread if none exists
          if (customerSession.threads.length === 0) {
            console.log(
              `No threads found for session ${customerSession.id}, creating one...`
            );
            const newThread = await prisma.aiThread.create({
              data: {
                threadId: crypto.randomUUID(),
                title: "New Conversation",
                websiteId,
                sessions: {
                  connect: { id: customerSession.id },
                },
              },
              include: { messages: true },
            });

            customerSession.threads = [newThread];
            console.log(`Created new thread with ID: ${newThread.threadId}`);
          }

          return cors(
            request,
            NextResponse.json({
              session: customerSession,
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
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: {
          threads: {
            include: { messages: true },
            orderBy: { lastMessageAt: "desc" },
          },
          customer: true,
        },
      });

      if (!session) {
        return cors(
          request,
          NextResponse.json({ error: "Session not found" }, { status: 404 })
        );
      }

      // Create a new thread if none exists
      if (session.threads.length === 0) {
        console.log(
          `No threads found for session ${session.id}, creating one...`
        );
        const newThread = await prisma.aiThread.create({
          data: {
            threadId: crypto.randomUUID(),
            title: "New Conversation",
            websiteId: session.websiteId,
            sessions: {
              connect: { id: session.id },
            },
          },
          include: { messages: true },
        });

        session.threads = [newThread];
        console.log(`Created new thread with ID: ${newThread.threadId}`);
      }

      return cors(
        request,
        NextResponse.json({
          session,
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

    const session = await prisma.session.findFirst({
      where: { websiteId },
      include: {
        threads: {
          include: { messages: true },
          orderBy: { lastMessageAt: "desc" },
        },
        customer: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!session) {
      return cors(
        request,
        NextResponse.json({ error: "No session found" }, { status: 404 })
      );
    }

    // Create a new thread if none exists
    if (session.threads.length === 0) {
      console.log(
        `No threads found for session ${session.id}, creating one...`
      );
      const newThread = await prisma.aiThread.create({
        data: {
          threadId: crypto.randomUUID(),
          title: "New Conversation",
          websiteId,
          sessions: {
            connect: { id: session.id },
          },
        },
        include: { messages: true },
      });

      session.threads = [newThread];
      console.log(`Created new thread with ID: ${newThread.threadId}`);
    }

    return cors(
      request,
      NextResponse.json({
        session,
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
