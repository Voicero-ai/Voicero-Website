import { NextResponse, NextRequest } from "next/server";
import { query } from "../../../../lib/db";
import OpenAI from "openai";
import { cors } from "../../../../lib/cors";
export const dynamic = "force-dynamic";

interface Website {
  id: string;
  name: string;
  url: string;
  aiAssistantId: string | null;
  aiVoiceAssistantId: string | null;
}

interface ShopifyPage {
  id: string;
  shopifyId: string;
  handle: string;
}

interface ShopifyProduct {
  id: string;
  shopifyId: string;
  handle: string;
}

interface ShopifyBlogPost {
  id: string;
  shopifyId: string;
  handle: string;
}

interface ShopifyCollection {
  id: string;
  shopifyId: string;
  handle: string;
}

interface ShopifyDiscount {
  id: string;
  shopifyId: string;
  code: string;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Add OPTIONS handler for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

async function createTextAssistant(websiteName: string) {
  const assistant = await openai.beta.assistants.create({
    name: `${websiteName} Text Assistant`,
    instructions: `
    You're a Shopify store assistant. Keep responses short (2-3 sentences maximum). Be clear and helpful. ALWAYS ask for permission before suggesting cart actions. NEVER say 'I've added to your cart'; instead ask 'Would you like to add this to your cart?' Only include ONE URL in your entire response.
    `,
    model: "ft:gpt-4o-mini-2024-07-18:voiceroai:voicero-text:B7uvZUul",
  });

  return assistant;
}

async function createVoiceAssistant(websiteName: string) {
  const assistant = await openai.beta.assistants.create({
    name: `${websiteName} Voice Assistant`,
    instructions: `
   You're a Shopify store assistant. Keep responses extremely short (1-2 sentences). Use conversational language with words like 'um', 'y'know', and occasional pauses. ALWAYS ask for permission before suggesting cart actions. NEVER say 'I've added to your cart'; instead ask 'Would you like me to add this to your cart?
    `,
    model: "ft:gpt-4o-mini-2024-07-18:voiceroai:voicero-voice:B7uzRY1B",
  });

  return assistant;
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

    // Find the website associated with this access key
    const websites = (await query(
      `SELECT w.id, w.name, w.url, w.aiAssistantId, w.aiVoiceAssistantId
       FROM Website w
       JOIN AccessKey ak ON w.id = ak.websiteId
       WHERE ak.\`key\` = ?
       LIMIT 1`,
      [accessKey]
    )) as Website[];

    if (websites.length === 0) {
      return cors(
        request,
        NextResponse.json({ error: "Invalid access key" }, { status: 401 })
      );
    }

    const website = websites[0];

    // Get shopify pages
    const shopifyPages = (await query(
      `SELECT id, shopifyId, handle
       FROM ShopifyPage
       WHERE websiteId = ?`,
      [website.id]
    )) as ShopifyPage[];

    // Get shopify products
    const shopifyProducts = (await query(
      `SELECT id, shopifyId, handle
       FROM ShopifyProduct
       WHERE websiteId = ?`,
      [website.id]
    )) as ShopifyProduct[];

    // Get shopify blog posts
    const shopifyBlogPosts = (await query(
      `SELECT id, shopifyId, handle
       FROM ShopifyBlogPost
       WHERE websiteId = ?`,
      [website.id]
    )) as ShopifyBlogPost[];

    // Get shopify collections
    const shopifyCollections = (await query(
      `SELECT id, shopifyId, handle
       FROM ShopifyCollection
       WHERE websiteId = ?`,
      [website.id]
    )) as ShopifyCollection[];

    // Get shopify discounts
    const shopifyDiscounts = (await query(
      `SELECT id, shopifyId, code
       FROM ShopifyDiscount
       WHERE websiteId = ?`,
      [website.id]
    )) as ShopifyDiscount[];

    console.log("Found website:", website);
    console.log("Current assistantId:", website.aiAssistantId);

    // Create both text and voice assistants if they don't exist
    let textAssistantId = website.aiAssistantId;
    let voiceAssistantId = website.aiVoiceAssistantId;

    if (!textAssistantId) {
      console.log("Creating new text assistant...");
      const textAssistant = await createTextAssistant(
        website.name || website.url
      );
      textAssistantId = textAssistant.id;
    }

    if (!voiceAssistantId) {
      console.log("Creating new voice assistant...");
      const voiceAssistant = await createVoiceAssistant(
        website.name || website.url
      );
      voiceAssistantId = voiceAssistant.id;
    }

    // Update the website record with both assistant IDs
    await query(
      `UPDATE Website
       SET aiAssistantId = ?, aiVoiceAssistantId = ?
       WHERE id = ?`,
      [textAssistantId, voiceAssistantId, website.id]
    );

    console.log("Updated website with assistant IDs");

    return cors(
      request,
      NextResponse.json({
        success: true,
        message: "Assistants configured successfully",
        textAssistantId,
        voiceAssistantId,
        websiteId: website.id,
        timestamp: new Date(),
        content: {
          pages: shopifyPages.map((p) => ({
            id: p.id,
            vectorId: `page-${p.shopifyId}`,
            shopifyId: p.shopifyId.toString(),
            handle: p.handle,
          })),
          products: shopifyProducts.map((p) => ({
            id: p.id,
            vectorId: `product-${p.shopifyId}`,
            shopifyId: p.shopifyId.toString(),
            handle: p.handle,
          })),
          posts: shopifyBlogPosts.map((p) => ({
            id: p.id,
            vectorId: `post-${p.shopifyId}`,
            shopifyId: p.shopifyId.toString(),
            handle: p.handle,
          })),
          collections: shopifyCollections.map((c) => ({
            id: c.id,
            vectorId: `collection-${c.shopifyId}`,
            shopifyId: c.shopifyId?.toString() || "",
            handle: c.handle,
          })),
          discounts: shopifyDiscounts.map((d) => ({
            id: d.id,
            vectorId: `discount-${d.shopifyId}`,
            shopifyId: d.shopifyId.toString(),
            code: d.code,
          })),
        },
      })
    );
  } catch (error: any) {
    console.error("Assistant creation error:", error);
    return cors(
      request,
      NextResponse.json(
        { error: "Assistant creation failed", details: error.message },
        { status: 500 }
      )
    );
  }
}
