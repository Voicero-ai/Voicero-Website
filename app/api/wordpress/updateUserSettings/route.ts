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
    const { websiteId, name, username, email } = body;

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
    if (!name && !username && !email) {
      return cors(
        request,
        NextResponse.json(
          {
            error:
              "At least one update field (name, username, or email) must be provided",
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

    // Verify the website matches the one from the access key
    if (accessKeyRecord.websiteId !== websiteId) {
      return cors(
        request,
        NextResponse.json(
          { error: "Unauthorized to update this website's user" },
          { status: 403 }
        )
      );
    }

    // Find the website and its associated user
    const website = await prisma.website.findUnique({
      where: {
        id: websiteId,
      },
      select: {
        userId: true,
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
    if (email) updateData.email = email;
    if (username) updateData.username = username;

    // If email is being updated, check if it's already in use
    if (email) {
      const existingUser = await prisma.user.findUnique({
        where: {
          email: email,
        },
        select: {
          id: true,
        },
      });

      if (existingUser && existingUser.id !== website.userId) {
        return cors(
          request,
          NextResponse.json(
            { error: "Email is already in use" },
            { status: 400 }
          )
        );
      }
    }

    // If username is being updated, check if it's already in use
    if (username) {
      const existingUser = await prisma.user.findUnique({
        where: {
          username: username,
        },
        select: {
          id: true,
        },
      });

      if (existingUser && existingUser.id !== website.userId) {
        return cors(
          request,
          NextResponse.json(
            { error: "Username is already in use" },
            { status: 400 }
          )
        );
      }
    }

    // Update the user
    const updatedUser = await prisma.user.update({
      where: {
        id: website.userId,
      },
      data: updateData,
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
      },
    });

    return cors(
      request,
      NextResponse.json({
        success: true,
        message: "User settings updated successfully",
        user: updatedUser,
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
