import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { cors } from "../../../../lib/cors";
import {
  verifyToken,
  getWebsiteIdFromToken,
} from "../../../../lib/token-verifier";
import { query } from "../../../../lib/db";

export const dynamic = "force-dynamic";

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
    You're a WordPress site assistant. Keep responses short (2-3 sentences maximum). Be clear and helpful. ALWAYS ask for permission before suggesting actions. Only include ONE URL in your entire response.
    `,
    model: "ft:gpt-4o-mini-2024-07-18:voiceroai:voicero-text:B7uvZUul",
  });

  return assistant;
}

async function createVoiceAssistant(websiteName: string) {
  const assistant = await openai.beta.assistants.create({
    name: `${websiteName} Voice Assistant`,
    instructions: `
   You're a WordPress site assistant. Keep responses extremely short (1-2 sentences). Use conversational language with words like 'um', 'y'know', and occasional pauses. ALWAYS ask for permission before suggesting actions.
    `,
    model: "ft:gpt-4o-mini-2024-07-18:voiceroai:voicero-voice:B7uzRY1B",
  });

  return assistant;
}

export async function POST(request: NextRequest) {
  try {
    // Verify the Bearer token
    const authHeader = request.headers.get("authorization");
    const isTokenValid = await verifyToken(authHeader);

    if (!isTokenValid) {
      return cors(
        request,
        NextResponse.json(
          { error: "Unauthorized - Invalid token" },
          { status: 401 }
        )
      );
    }

    // Get the website ID from the verified token
    const websiteId = await getWebsiteIdFromToken(authHeader);

    if (!websiteId) {
      return cors(
        request,
        NextResponse.json(
          { error: "Could not determine website ID from token" },
          { status: 400 }
        )
      );
    }

    // Find the website using direct MySQL query
    const websiteResults = await query(`SELECT * FROM Website WHERE id = ?`, [
      websiteId,
    ]);

    if (!websiteResults || websiteResults.length === 0) {
      return cors(
        request,
        NextResponse.json({ error: "Website not found" }, { status: 404 })
      );
    }

    const website = websiteResults[0];

    // Get pages, posts, and products for this website
    const pagesResults = await query(
      `SELECT * FROM WordpressPage WHERE websiteId = ?`,
      [website.id]
    );

    const postsResults = await query(
      `SELECT * FROM WordpressPost WHERE websiteId = ?`,
      [website.id]
    );

    const productsResults = await query(
      `SELECT * FROM WordpressProduct WHERE websiteId = ?`,
      [website.id]
    );

    // Add these to our website object
    website.pages = pagesResults || [];
    website.posts = postsResults || [];
    website.products = productsResults || [];

    console.log("Found website:", website);
    console.log("Current assistantId:", website.aiAssistantId);
    console.log("Current voice assistantId:", website.aiVoiceAssistantId);

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

    // Update the website record with both assistant IDs using direct MySQL query
    await query(
      `UPDATE Website SET aiAssistantId = ?, aiVoiceAssistantId = ? WHERE id = ?`,
      [textAssistantId, voiceAssistantId, website.id]
    );

    const updatedWebsite = {
      id: website.id,
      aiAssistantId: textAssistantId,
      aiVoiceAssistantId: voiceAssistantId,
    };

    console.log("Updated website:", updatedWebsite);

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
          pages: (website.pages || []).map((p: any) => ({
            id: p.id.toString(),
            vectorId: `page-${(p.title || "")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/(^-|-$)/g, "")}-${p.wpId}`,
            wpId: p.wpId.toString(),
            title: p.title,
            slug: p.slug,
          })),
          posts: (website.posts || []).map((p: any) => ({
            id: p.id.toString(),
            vectorId: `post-${(p.title || "")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/(^-|-$)/g, "")}-${p.wpId}`,
            wpId: p.wpId.toString(),
            title: p.title,
            slug: p.slug,
          })),
          products: (website.products || []).map((p: any) => ({
            id: p.id.toString(),
            vectorId: `product-${(p.name || "")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/(^-|-$)/g, "")}-${p.wpId}`,
            wpId: p.wpId.toString(),
            name: p.name,
            slug: p.slug,
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
