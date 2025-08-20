import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from '../../../../lib/auth';
import { query } from '../../../../lib/db';

export const dynamic = "force-dynamic";

// Define interface for website
interface Website {
  id: string;
  url: string;
  userId: string;
  botName: string;
  customWelcomeMessage: string | null;
  iconBot: string;
  iconVoice: string;
  iconMessage: string;
  customInstructions: string | null;
  color: string | null;
  clickMessage: string | null;
  showVoiceAI?: boolean;
  showTextAI?: boolean;
}

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
      showVoiceAI,
      showTextAI,
    } = data || {};

    if (!websiteId) {
      return NextResponse.json(
        { error: "Website ID is required" },
        { status: 400 }
      );
    }

    // Verify user owns this website
    const websites = (await query(
      "SELECT * FROM Website WHERE id = ? AND userId = ?",
      [websiteId, session.user.id]
    )) as Website[];

    if (websites.length === 0) {
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

    // Dynamically build SET clause to avoid undefined bindings
    const fields: string[] = [];
    const values: any[] = [];

    if (botName !== undefined) {
      fields.push("botName = ?");
      values.push(botName || "Bot");
    }
    if (customWelcomeMessage !== undefined) {
      fields.push("customWelcomeMessage = ?");
      values.push(customWelcomeMessage ?? null);
    }
    if (iconBot !== undefined) {
      fields.push("iconBot = ?");
      values.push(iconBot || "bot");
    }
    if (iconVoice !== undefined) {
      fields.push("iconVoice = ?");
      values.push(iconVoice || "microphone");
    }
    if (iconMessage !== undefined) {
      fields.push("iconMessage = ?");
      values.push(iconMessage || "message");
    }
    if (customInstructions !== undefined) {
      fields.push("customInstructions = ?");
      values.push(customInstructions ?? null);
    }
    if (color !== undefined) {
      fields.push("color = ?");
      values.push(color ?? null);
    }
    if (clickMessage !== undefined) {
      fields.push("clickMessage = ?");
      values.push(clickMessage ?? null);
    }
    if (showVoiceAI !== undefined) {
      fields.push("showVoiceAI = ?");
      values.push(showVoiceAI ? 1 : 0);
    }
    if (showTextAI !== undefined) {
      fields.push("showTextAI = ?");
      values.push(showTextAI ? 1 : 0);
    }

    if (fields.length === 0) {
      return NextResponse.json({ success: true });
    }

    values.push(websiteId);
    await query(`UPDATE Website SET ${fields.join(", ")} WHERE id = ?`, values);

    // Get the updated website
    const updatedWebsites = (await query("SELECT * FROM Website WHERE id = ?", [
      websiteId,
    ])) as Website[];

    const updatedWebsite = updatedWebsites[0];

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
        showVoiceAI: Boolean(updatedWebsite.showVoiceAI),
        showTextAI: Boolean(updatedWebsite.showTextAI),
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
