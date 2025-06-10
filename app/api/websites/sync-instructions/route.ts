import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

const openai = new OpenAI();

const INSTRUCTIONS_DELIMITER = "------";
const INSTRUCTIONS_MARKER =
  "Company Orders Follow these as extra data when answering your questions:";

async function updateAssistantInstructions(
  assistantId: string,
  currentInstructions: string,
  newCustomInstructions: string | null
) {
  // Get current assistant
  const assistant = await openai.beta.assistants.retrieve(assistantId);

  // Get the current instructions
  let instructions = assistant.instructions || "";

  // Remove old custom instructions if they exist
  const regex = new RegExp(
    `${INSTRUCTIONS_MARKER}\\s*${INSTRUCTIONS_DELIMITER}\\s*([\\s\\S]*?)\\s*${INSTRUCTIONS_DELIMITER}`,
    "g"
  );
  instructions = instructions.replace(regex, "").trim();

  // Add new custom instructions if they exist
  if (newCustomInstructions) {
    instructions = `${instructions}\n\n${INSTRUCTIONS_MARKER}\n${INSTRUCTIONS_DELIMITER}\n${newCustomInstructions}\n${INSTRUCTIONS_DELIMITER}`;
  }

  // Update the assistant
  await openai.beta.assistants.update(assistantId, {
    instructions: instructions.trim(),
  });
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { websiteId, instructions } = await req.json();

    // Verify user owns this website and get assistant IDs
    const website = await prisma.website.findFirst({
      where: {
        id: websiteId,
        userId: session.user.id,
      },
      select: {
        id: true,
        aiAssistantId: true,
        aiVoiceAssistantId: true,
      },
    });

    if (!website) {
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
    }

    // Update both assistants if they exist
    if (website.aiAssistantId) {
      await updateAssistantInstructions(
        website.aiAssistantId,
        instructions,
        instructions
      );
    }

    if (website.aiVoiceAssistantId) {
      await updateAssistantInstructions(
        website.aiVoiceAssistantId,
        instructions,
        instructions
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error syncing instructions:", error);
    return NextResponse.json(
      { error: "Failed to sync instructions" },
      { status: 500 }
    );
  }
}
