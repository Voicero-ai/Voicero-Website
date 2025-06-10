import { NextResponse, NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cors } from "../../../lib/cors";
export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

// Add OPTIONS handler for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    console.log("Beginning saveBotSettings request processing");

    // Get the authorization header
    const authHeader = request.headers.get("authorization");
    console.log("Auth header:", authHeader ? "Present" : "Missing");

    if (!authHeader?.startsWith("Bearer ")) {
      console.log("Auth header invalid - missing Bearer prefix");
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
    console.log("Access key extracted:", accessKey ? "Present" : "Missing");

    if (!accessKey) {
      console.log("No access key provided");
      return cors(
        request,
        NextResponse.json({ error: "No access key provided" }, { status: 401 })
      );
    }

    // Get request body
    const requestBody = await request.json();
    console.log("Full request body received:", requestBody);

    const {
      websiteId,
      customInstructions,
      customWelcomeMessage,
      botName,
      color,
      iconBot,
      iconVoice,
      iconMessage,
      removeHighlight,
      popUpQuestions,
    } = requestBody;

    console.log("Extracted fields:", {
      websiteId,
      customInstructions: customInstructions ? "Present" : "Missing",
      customWelcomeMessage: customWelcomeMessage ? "Present" : "Missing",
      botName,
      color,
      iconBot: iconBot ? "Present" : "Missing",
      iconVoice: iconVoice ? "Present" : "Missing",
      iconMessage: iconMessage ? "Present" : "Missing",
      removeHighlight,
      popUpQuestions: popUpQuestions
        ? `Array with ${
            Array.isArray(popUpQuestions) ? popUpQuestions.length : 0
          } items`
        : "Missing",
    });

    if (!websiteId) {
      console.log("Website ID is missing");
      return cors(
        request,
        NextResponse.json({ error: "Website ID is required" }, { status: 400 })
      );
    }

    // Verify website access
    console.log(
      "Verifying website access with ID:",
      websiteId,
      "and access key"
    );
    const website = await prisma.website.findFirst({
      where: {
        id: websiteId,
        accessKeys: {
          some: {
            key: accessKey,
          },
        },
      },
      include: {
        popUpQuestions: true,
      },
    });

    console.log("Website found:", website ? "Yes" : "No");

    if (!website) {
      console.log("Invalid access key or website ID");
      return cors(
        request,
        NextResponse.json(
          { error: "Invalid access key or website ID" },
          { status: 401 }
        )
      );
    }

    // Prepare the data object with only fields that are provided
    const updateData: any = {};

    if (customInstructions !== undefined)
      updateData.customInstructions = customInstructions;
    if (customWelcomeMessage !== undefined)
      updateData.customWelcomeMessage = customWelcomeMessage;
    if (botName !== undefined) updateData.botName = botName;
    if (color !== undefined) updateData.color = color;
    if (iconBot !== undefined) updateData.iconBot = iconBot;
    if (iconVoice !== undefined) updateData.iconVoice = iconVoice;
    if (iconMessage !== undefined) updateData.iconMessage = iconMessage;
    if (removeHighlight !== undefined)
      updateData.removeHighlight = removeHighlight;

    console.log("Update data prepared:", updateData);

    // Begin transaction for atomic updates
    console.log("Beginning database transaction");
    const result = await prisma.$transaction(async (tx) => {
      // Update the website with the new settings
      console.log("Updating website with new settings");
      const updatedWebsite = await tx.website.update({
        where: { id: websiteId },
        data: updateData,
        include: {
          popUpQuestions: true,
        },
      });
      console.log("Website updated successfully");

      // If we're updating pop-up questions
      if (popUpQuestions !== undefined) {
        console.log("Processing popUpQuestions update");
        // Delete all existing questions
        console.log("Deleting existing popUpQuestions");
        await tx.popUpQuestion.deleteMany({
          where: {
            websiteId: websiteId,
          },
        });

        // Create new questions
        if (Array.isArray(popUpQuestions) && popUpQuestions.length > 0) {
          console.log(`Creating ${popUpQuestions.length} new popUpQuestions`);
          await tx.popUpQuestion.createMany({
            data: popUpQuestions.map((question: string) => ({
              question,
              websiteId,
            })),
          });
        }

        // Refetch to get the new questions
        console.log("Refetching website with updated popUpQuestions");
        const refreshedWebsite = await tx.website.findUnique({
          where: { id: websiteId },
          include: {
            popUpQuestions: true,
          },
        });

        return refreshedWebsite;
      }

      return updatedWebsite;
    });

    console.log("Transaction completed successfully, returning result");
    return cors(
      request,
      NextResponse.json({
        success: true,
        website: {
          id: result?.id,
          name: result?.name,
          customInstructions: result?.customInstructions,
          customWelcomeMessage: result?.customWelcomeMessage,
          botName: result?.botName,
          color: result?.color,
          iconBot: result?.iconBot,
          iconVoice: result?.iconVoice,
          iconMessage: result?.iconMessage,
          removeHighlight: result?.removeHighlight,
          popUpQuestions: result?.popUpQuestions,
        },
      })
    );
  } catch (error: any) {
    console.error("Save bot settings error:", error);
    console.log("Error stack trace:", error.stack);
    return cors(
      request,
      NextResponse.json(
        { error: "Failed to save bot settings", details: error.message },
        { status: 500 }
      )
    );
  }
}
