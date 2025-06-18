import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    // Check auth - only logged in users can update website settings
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request
    const data = await request.json();
    const {
      websiteId,
      botName,
      customWelcomeMessage,
      iconBot,
      iconVoice,
      iconMessage,
      customInstructions,
      color,
      clickMessage,
    } = data;

    if (!websiteId) {
      return NextResponse.json(
        { error: "Website ID is required" },
        { status: 400 }
      );
    }

    // Verify user owns this website
    const website = await prisma.website.findFirst({
      where: {
        id: websiteId,
        userId: session.user.id,
      },
    });

    if (!website) {
      return NextResponse.json(
        { error: "Website not found or access denied" },
        { status: 404 }
      );
    }

    // Validate icon values
    const validBotIcons = ["bot", "voice", "message"];
    const validVoiceIcons = ["microphone", "waveform", "speaker"];
    const validMessageIcons = ["message", "document", "cursor"];

    if (iconBot && !validBotIcons.includes(iconBot)) {
      return NextResponse.json({ error: "Invalid bot icon" }, { status: 400 });
    }

    if (iconVoice && !validVoiceIcons.includes(iconVoice)) {
      return NextResponse.json(
        { error: "Invalid voice icon" },
        { status: 400 }
      );
    }

    if (iconMessage && !validMessageIcons.includes(iconMessage)) {
      return NextResponse.json(
        { error: "Invalid message icon" },
        { status: 400 }
      );
    }

    // Update the website settings
    const updatedWebsite = await prisma.website.update({
      where: {
        id: websiteId,
      },
      data: {
        botName: botName || "Bot",
        customWelcomeMessage,
        iconBot: iconBot || "bot",
        iconVoice: iconVoice || "microphone",
        iconMessage: iconMessage || "message",
        customInstructions,
        color,
        clickMessage,
      },
    });

    return NextResponse.json({
      success: true,
      website: {
        id: updatedWebsite.id,
        botName: updatedWebsite.botName,
        customWelcomeMessage: updatedWebsite.customWelcomeMessage,
        iconBot: updatedWebsite.iconBot,
        iconVoice: updatedWebsite.iconVoice,
        iconMessage: updatedWebsite.iconMessage,
        clickMessage: updatedWebsite.clickMessage,
      },
    });
  } catch (error) {
    console.error("Error updating website UI settings:", error);
    return NextResponse.json(
      { error: "Failed to update website UI settings" },
      { status: 500 }
    );
  }
}
