import { NextRequest, NextResponse } from "next/server";
import { cors } from "@/lib/cors";
import { query } from "@/lib/db";
import { verifyToken, getWebsiteIdFromToken } from "@/lib/token-verifier";

export const dynamic = "force-dynamic";

interface Website {
  id: string;
  name: string;
  customInstructions: string | null;
  customWelcomeMessage: string | null;
  botName: string | null;
  color: string | null;
  iconBot: string | null;
  iconVoice: string | null;
  iconMessage: string | null;
  removeHighlight: boolean;
  allowMultiAIReview: boolean;
  clickMessage: string | null;
}

interface PopUpQuestion {
  id: string;
  question: string;
  websiteId: string;
}

// Add OPTIONS handler for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    console.log("Beginning saveBotSettings request processing");

    // Verify the Bearer token
    const authHeader = request.headers.get("authorization");
    const isTokenValid = await verifyToken(authHeader);

    if (!isTokenValid) {
      console.log("Auth header invalid - invalid token");
      return cors(
        request,
        NextResponse.json(
          { error: "Unauthorized - Invalid token" },
          { status: 401 }
        )
      );
    }

    // Get the website ID from the verified token
    const websiteIdFromToken = await getWebsiteIdFromToken(authHeader);

    if (!websiteIdFromToken) {
      console.log("Could not determine website ID from token");
      return cors(
        request,
        NextResponse.json(
          { error: "Could not determine website ID from token" },
          { status: 400 }
        )
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
      allowMultiAIReview,
      clickMessage,
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
      allowMultiAIReview:
        allowMultiAIReview !== undefined ? "Present" : "Missing",
      clickMessage: clickMessage ? "Present" : "Missing",
    });

    if (!websiteId) {
      console.log("Website ID is missing");
      return cors(
        request,
        NextResponse.json({ error: "Website ID is required" }, { status: 400 })
      );
    }

    // Verify the requested websiteId matches the one from the token
    if (websiteId !== websiteIdFromToken) {
      console.log("Unauthorized to access this website");
      return cors(
        request,
        NextResponse.json(
          { error: "Unauthorized to access this website" },
          { status: 403 }
        )
      );
    }

    // Verify website exists
    console.log(
      "Verifying website exists with ID:",
      websiteId
    );

    const websiteResult = await query(
      `SELECT id FROM Website WHERE id = ?`,
      [websiteId]
    );

    if (Array.isArray(websiteResult) && websiteResult.length === 0) {
      console.log("Website not found");
      return cors(
        request,
        NextResponse.json(
          { error: "Website not found" },
          { status: 404 }
        )
      );
    }

    // Get the website and its popup questions
    const website = (await query(`SELECT * FROM Website WHERE id = ?`, [
      websiteId,
    ])) as Website[];

    if (website.length === 0) {
      console.log("Website not found");
      return cors(
        request,
        NextResponse.json({ error: "Website not found" }, { status: 404 })
      );
    }

    // Get existing popup questions
    const existingQuestions = (await query(
      `SELECT * FROM PopUpQuestion WHERE websiteId = ?`,
      [websiteId]
    )) as PopUpQuestion[];

    // Prepare the update fields and values
    const updateFields = [];
    const updateValues = [];

    if (customInstructions !== undefined) {
      updateFields.push("customInstructions = ?");
      updateValues.push(customInstructions);
    }

    if (customWelcomeMessage !== undefined) {
      updateFields.push("customWelcomeMessage = ?");
      updateValues.push(customWelcomeMessage);
    }

    if (botName !== undefined) {
      updateFields.push("botName = ?");
      updateValues.push(botName);
    }

    if (color !== undefined) {
      updateFields.push("color = ?");
      updateValues.push(color);
    }

    if (iconBot !== undefined) {
      updateFields.push("iconBot = ?");
      updateValues.push(iconBot);
    }

    if (iconVoice !== undefined) {
      updateFields.push("iconVoice = ?");
      updateValues.push(iconVoice);
    }

    if (iconMessage !== undefined) {
      updateFields.push("iconMessage = ?");
      updateValues.push(iconMessage);
    }

    if (removeHighlight !== undefined) {
      updateFields.push("removeHighlight = ?");
      updateValues.push(removeHighlight);
    }

    if (allowMultiAIReview !== undefined) {
      updateFields.push("allowMultiAIReview = ?");
      updateValues.push(allowMultiAIReview);
    }

    if (clickMessage !== undefined) {
      updateFields.push("clickMessage = ?");
      updateValues.push(clickMessage);
    }

    console.log("Update data prepared:", { updateFields, updateValues });

    // Begin transaction-like operations
    console.log("Beginning database operations");

    // Update the website with the new settings if there are fields to update
    if (updateFields.length > 0) {
      console.log("Updating website with new settings");
      await query(
        `UPDATE Website SET ${updateFields.join(", ")} WHERE id = ?`,
        [...updateValues, websiteId]
      );
      console.log("Website updated successfully");
    }

    // If we're updating pop-up questions
    if (popUpQuestions !== undefined) {
      console.log("Processing popUpQuestions update");

      // Delete all existing questions
      console.log("Deleting existing popUpQuestions");
      await query(`DELETE FROM PopUpQuestion WHERE websiteId = ?`, [websiteId]);

      // Create new questions
      if (Array.isArray(popUpQuestions) && popUpQuestions.length > 0) {
        console.log(`Creating ${popUpQuestions.length} new popUpQuestions`);

        for (const question of popUpQuestions) {
          await query(
            `INSERT INTO PopUpQuestion (question, websiteId) VALUES (?, ?)`,
            [question, websiteId]
          );
        }
      }
    }

    // Get the updated website data
    const updatedWebsiteResult = (await query(
      `SELECT * FROM Website WHERE id = ?`,
      [websiteId]
    )) as Website[];

    const updatedWebsite = updatedWebsiteResult[0];

    // Get the updated popup questions
    const updatedQuestions = (await query(
      `SELECT * FROM PopUpQuestion WHERE websiteId = ?`,
      [websiteId]
    )) as PopUpQuestion[];

    console.log("Operations completed successfully, returning result");
    return cors(
      request,
      NextResponse.json({
        success: true,
        website: {
          id: updatedWebsite.id,
          name: updatedWebsite.name,
          customInstructions: updatedWebsite.customInstructions,
          customWelcomeMessage: updatedWebsite.customWelcomeMessage,
          botName: updatedWebsite.botName,
          color: updatedWebsite.color,
          iconBot: updatedWebsite.iconBot,
          iconVoice: updatedWebsite.iconVoice,
          iconMessage: updatedWebsite.iconMessage,
          removeHighlight: updatedWebsite.removeHighlight,
          allowMultiAIReview: updatedWebsite.allowMultiAIReview,
          clickMessage: updatedWebsite.clickMessage,
          popUpQuestions: updatedQuestions,
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
