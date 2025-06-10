import { NextResponse, NextRequest } from "next/server";
import {
  PrismaClient,
  WordpressPage,
  WordpressPost,
  WordpressProduct,
} from "@prisma/client";
import OpenAI from "openai";
import { cors } from "../../../../lib/cors";

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();
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
    const website = await prisma.website.findFirst({
      where: {
        accessKeys: {
          some: {
            key: accessKey,
          },
        },
      },
      include: {
        pages: true,
        posts: true,
        products: true,
      },
    });

    if (!website) {
      return cors(
        request,
        NextResponse.json({ error: "Invalid access key" }, { status: 401 })
      );
    }

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

    // Update the website record with both assistant IDs
    const updatedWebsite = await prisma.website.update({
      where: { id: website.id },
      data: {
        aiAssistantId: textAssistantId,
        aiVoiceAssistantId: voiceAssistantId,
      },
      select: {
        id: true,
        aiAssistantId: true,
        aiVoiceAssistantId: true,
      },
    });

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
          pages: (website.pages || []).map((p: WordpressPage) => ({
            id: p.id.toString(),
            vectorId: `page-${(p.title || "")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/(^-|-$)/g, "")}-${p.wpId}`,
            wpId: p.wpId.toString(),
            title: p.title,
            slug: p.slug,
          })),
          posts: (website.posts || []).map((p: WordpressPost) => ({
            id: p.id.toString(),
            vectorId: `post-${(p.title || "")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/(^-|-$)/g, "")}-${p.wpId}`,
            wpId: p.wpId.toString(),
            title: p.title,
            slug: p.slug,
          })),
          products: (website.products || []).map((p: WordpressProduct) => ({
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
