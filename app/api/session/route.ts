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
    const { websiteId, shopifyId } = await request.json();
    if (!websiteId) {
      return cors(
        request,
        NextResponse.json({ error: "Website ID is required" }, { status: 400 })
      );
    }

    // Check if there's a Shopify customer with this ID
    let shopifyCustomerId = null;
    if (shopifyId) {
      console.log(`Looking for Shopify customer with ID: ${shopifyId}`);
      const shopifyCustomer = await prisma.shopifyCustomer.findFirst({
        where: {
          websiteId,
          shopifyId: shopifyId.toString(),
        },
      });

      if (shopifyCustomer) {
        console.log(`Found Shopify customer: ${shopifyCustomer.id}`);
        shopifyCustomerId = shopifyCustomer.id;
      } else {
        console.log(`No Shopify customer found with ID: ${shopifyId}`);
      }
    }

    const session = await prisma.session.create({
      data: {
        websiteId,
        shopifyCustomerId,
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
        ...(shopifyCustomerId ? { customer: true } : {}),
      },
    });

    // Return both session and its initial thread
    const thread = session.threads[0];
    return cors(
      request,
      NextResponse.json({
        session,
        thread,
        shopifyCustomerLinked: !!shopifyCustomerId,
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
