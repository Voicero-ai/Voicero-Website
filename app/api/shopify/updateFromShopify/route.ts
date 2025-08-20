import { NextRequest, NextResponse } from "next/server";
import { cors } from "@/lib/cors";
import { query } from "@/lib/db";
import { verifyToken, getWebsiteIdFromToken } from "@/lib/token-verifier";

export const dynamic = "force-dynamic";

interface AccessKey {
  websiteId: string;
}

interface Website {
  id: string;
  plan: string;
  queryLimit: number;
  renewsOn: Date | null;
  color: string | null;
}

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
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

    // Get request body
    const body = await request.json();
    const { plan, queryLimit, subscriptionEnds, color } = body;

    // Validate required fields
    if (!plan || !queryLimit) {
      return cors(
        request,
        NextResponse.json(
          { error: "Missing required fields: plan and queryLimit" },
          { status: 400 }
        )
      );
    }

    // Validate color format if provided
    if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
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

    // Verify website exists
    const websiteExists = (await query(
      "SELECT id FROM Website WHERE id = ?",
      [websiteId]
    )) as Website[];

    if (websiteExists.length === 0) {
      return cors(
        request,
        NextResponse.json({ error: "Website not found" }, { status: 404 })
      );
    }

    // Prepare update data
    const updateFields = ["plan = ?", "queryLimit = ?"];
    const updateValues = [plan, queryLimit];

    if (subscriptionEnds) {
      updateFields.push("renewsOn = ?");
      updateValues.push(new Date(subscriptionEnds));
    } else {
      updateFields.push("renewsOn = NULL");
    }

    if (color) {
      updateFields.push("color = ?");
      updateValues.push(color);
    }

    // Update the website using the found website ID
    await query(`UPDATE Website SET ${updateFields.join(", ")} WHERE id = ?`, [
      ...updateValues,
      websiteId,
    ]);

    // Get the updated website
    const updatedWebsite = (await query(
      "SELECT id, plan, queryLimit, renewsOn, color FROM Website WHERE id = ?",
      [websiteId]
    )) as Website[];

    if (updatedWebsite.length === 0) {
      return cors(
        request,
        NextResponse.json({ error: "Failed to retrieve updated website" }, { status: 500 })
      );
    }

    return cors(
      request,
      NextResponse.json({
        success: true,
        website: updatedWebsite[0],
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
