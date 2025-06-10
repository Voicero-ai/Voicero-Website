import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cors } from "../../../../lib/cors";
export const dynamic = "force-dynamic";
const prisma = new PrismaClient();

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
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

    // First find the website ID using the access key
    const accessKeyRecord = await prisma.accessKey.findUnique({
      where: {
        key: accessKey,
      },
      select: {
        websiteId: true,
      },
    });

    if (!accessKeyRecord) {
      return cors(
        request,
        NextResponse.json({ error: "Invalid access key" }, { status: 401 })
      );
    }

    // Update the website using the found website ID
    const website = await prisma.website.update({
      where: {
        id: accessKeyRecord.websiteId,
      },
      data: {
        plan: plan,
        queryLimit: queryLimit,
        renewsOn: subscriptionEnds ? new Date(subscriptionEnds) : null,
        ...(color && { color: color }),
      },
    });

    return cors(
      request,
      NextResponse.json({
        success: true,
        website: {
          id: website.id,
          plan: website.plan,
          queryLimit: website.queryLimit,
          renewsOn: website.renewsOn,
          color: website.color,
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
