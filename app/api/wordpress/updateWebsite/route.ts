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
    const websiteIdFromToken = await getWebsiteIdFromToken(authHeader);

    if (!websiteIdFromToken) {
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
    const { websiteId, name, url, customInstructions } = body;

    // Validate required fields
    if (!websiteId) {
      return cors(
        request,
        NextResponse.json(
          { error: "Missing required field: websiteId" },
          { status: 400 }
        )
      );
    }

    // Validate at least one update field is provided
    if (!name && !url && !customInstructions) {
      return cors(
        request,
        NextResponse.json(
          {
            error:
              "At least one update field (name, url, or customInstructions) must be provided",
          },
          { status: 400 }
        )
      );
    }

    // Verify the website matches the one from the token
    if (websiteIdFromToken !== websiteId) {
      return cors(
        request,
        NextResponse.json(
          { error: "Unauthorized to update this website" },
          { status: 403 }
        )
      );
    }

    // Find the website
    const website = await prisma.website.findUnique({
      where: {
        id: websiteId,
      },
    });

    if (!website) {
      return cors(
        request,
        NextResponse.json({ error: "Website not found" }, { status: 404 })
      );
    }

    // Prepare update data
    const updateData: any = {};
    if (name) updateData.name = name;
    if (url) updateData.url = url;
    if (customInstructions) updateData.customInstructions = customInstructions;

    // If URL is being updated, check if it's already in use
    if (url) {
      const existingWebsite = await prisma.website.findFirst({
        where: {
          url: url,
          id: {
            not: websiteId,
          },
        },
        select: {
          id: true,
        },
      });

      if (existingWebsite) {
        return cors(
          request,
          NextResponse.json({ error: "URL is already in use" }, { status: 400 })
        );
      }
    }

    // Update the website
    const updatedWebsite = await prisma.website.update({
      where: {
        id: websiteId,
      },
      data: updateData,
      select: {
        id: true,
        name: true,
        url: true,
        customInstructions: true,
      },
    });

    return cors(
      request,
      NextResponse.json({
        success: true,
        message: "Website updated successfully",
        website: updatedWebsite,
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
