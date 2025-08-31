import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../../lib/auth";
import { query } from "../../../../lib/db";
import { z } from "zod";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const createWebsiteSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  url: z.string().url("Invalid URL"),
  type: z.enum(["WordPress", "Custom"]),
  customType: z.string().optional().default(""),
  accessKey: z.string(),
});

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, url, accessKey, type } = body;

    // Required fields
    if (!name || !url || !accessKey || !type) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check if website with same URL and type already exists for this user
    const existingRows = (await query(
      `SELECT id FROM Website WHERE userId = ? AND url = ? AND type = ? LIMIT 1`,
      [session.user.id, url, type]
    )) as { id: string }[];
    const existingWebsite = existingRows.length > 0 ? existingRows[0] : null;

    if (existingWebsite) {
      return NextResponse.json(
        { error: "You already have a website with this URL and type" },
        { status: 400 }
      );
    }

    // Create website in the database with explicit UUID
    const customType = body.customType || "";
    // Generate a UUID for the website
    const websiteId = crypto.randomUUID();

    try {
      // First, insert the website into the database with explicit ID
      // Set active to false (0) by default
      await query(
        `INSERT INTO Website (id, userId, name, url, type, customType, active) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [websiteId, session.user.id, name, url, type, customType, false]
      );

      // Then create AccessKey entry linked to the website
      const accessKeyId = crypto.randomUUID();
      await query(
        `INSERT INTO AccessKey (id, name, \`key\`, websiteId, createdAt) VALUES (?, ?, ?, ?, NOW())`,
        [accessKeyId, name + " Key", accessKey, websiteId]
      );

      return NextResponse.json({
        success: true,
        websiteId,
        message: "Website created successfully",
        websiteData: {
          id: websiteId,
          name,
          url,
          type,
          customType,
          accessKey,
          userId: session.user.id,
        },
      });
    } catch (dbError: any) {
      console.error("Database error:", dbError);
      return NextResponse.json(
        {
          error: "Failed to create website in database",
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Error validating website data:", error);
    return NextResponse.json(
      { error: error.message || "Failed to validate website data" },
      { status: 500 }
    );
  }
}
