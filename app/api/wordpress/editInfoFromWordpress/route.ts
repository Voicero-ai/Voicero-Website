import { NextRequest, NextResponse } from "next/server";
import { cors } from '../../../../lib/cors';
import prisma from '../../../../lib/prisma';
import { verifyToken, getWebsiteIdFromToken } from '../../../../lib/token-verifier';

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    console.log("Received editInfoFromWordpress request");

    // Verify the Bearer token
    const authHeader = request.headers.get("authorization");
    const isTokenValid = await verifyToken(authHeader);

    if (!isTokenValid) {
      console.log("Invalid token");
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
      console.log("Could not determine website ID from token");
      return cors(
        request,
        NextResponse.json(
          { error: "Could not determine website ID from token" },
          { status: 400 }
        )
      );
    }

    console.log("Website ID from token:", websiteId);

    // Get request body
    const body = await request.json();
    console.log("Request body:", JSON.stringify(body, null, 2));

    const {
      name,
      url,
      customInstructions,
      popUpQuestions,
      active,
      plan,
      queryLimit,
      monthlyQueries,
      renewsOn,
      lastSyncedAt,
      syncFrequency,
      color,
    } = body;

    console.log("Color received:", color);
    console.log("PopUpQuestions received:", popUpQuestions);

    // Validate color format if provided
    if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      console.log("Invalid color format:", color);
      return cors(
        request,
        NextResponse.json(
          {
            error:
              "Invalid color format. Must be a valid hex color code (e.g. #FF0000)",
          },
          { status: 400 }
        )
      );
    }

    // Parse popUpQuestions if it's a string
    let parsedPopUpQuestions = [];
    try {
      parsedPopUpQuestions =
        typeof popUpQuestions === "string"
          ? JSON.parse(popUpQuestions)
          : popUpQuestions || [];
      console.log("Parsed popUpQuestions:", parsedPopUpQuestions);
    } catch (e) {
      console.error("Error parsing popUpQuestions:", e);
      parsedPopUpQuestions = [];
    }

    // Verify website exists
    const website = await prisma.website.findUnique({
      where: {
        id: websiteId,
      },
    });

    console.log("Website found:", website ? "yes" : "no");

    if (!website) {
      console.log("Website not found");
      return cors(
        request,
        NextResponse.json({ error: "Website not found" }, { status: 404 })
      );
    }

    console.log("Updating website with data:", {
      name,
      url,
      customInstructions,
      active,
      plan,
      queryLimit,
      monthlyQueries,
      renewsOn,
      syncFrequency,
      color,
      popUpQuestions: parsedPopUpQuestions,
    });

    // Update the website using the found website ID
    const updatedWebsite = await prisma.website.update({
      where: {
        id: websiteId,
      },
      data: {
        name: name,
        url: url,
        customInstructions: customInstructions,
        active: active,
        plan: plan,
        queryLimit: queryLimit,
        monthlyQueries: monthlyQueries,
        renewsOn: renewsOn ? new Date(renewsOn) : null,
        syncFrequency: syncFrequency,
        color: color || undefined,
        // Handle pop-up questions update
        popUpQuestions: {
          deleteMany: {}, // Delete all existing questions
          createMany: {
            data: parsedPopUpQuestions.map((q: { question: string }) => ({
              question: q.question,
            })),
          },
        },
      },
      include: {
        popUpQuestions: true,
      },
    });

    console.log("Website updated successfully:", {
      id: updatedWebsite.id,
      name: updatedWebsite.name,
      color: updatedWebsite.color,
      popUpQuestions: updatedWebsite.popUpQuestions,
    });

    return cors(
      request,
      NextResponse.json({
        success: true,
        website: {
          id: updatedWebsite.id,
          name: updatedWebsite.name,
          url: updatedWebsite.url,
          customInstructions: updatedWebsite.customInstructions,
          active: updatedWebsite.active,
          plan: updatedWebsite.plan,
          queryLimit: updatedWebsite.queryLimit,
          monthlyQueries: updatedWebsite.monthlyQueries,
          renewsOn: updatedWebsite.renewsOn,
          lastSyncedAt: updatedWebsite.lastSyncedAt,
          syncFrequency: updatedWebsite.syncFrequency,
          popUpQuestions: updatedWebsite.popUpQuestions,
          color: updatedWebsite.color,
        },
      })
    );
  } catch (error) {
    console.error("API Error:", error);
    return cors(
      request,
      NextResponse.json({ error: "Internal server error" }, { status: 500 })
    );
  }
}
