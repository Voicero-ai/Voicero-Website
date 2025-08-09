import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../../lib/auth";
import { query } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createWebsiteSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  url: z.string().url("Invalid URL"),
  type: z.enum(["WordPress", "Shopify", "Custom"]),
  customType: z.string().optional().default(""),
  accessKey: z.string(),
  plan: z.enum(["Starter", "Enterprise"]),
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

    // Don't create the website yet - just return the validated data
    // The website will be created after payment confirmation
    return NextResponse.json({
      websiteData: {
        name,
        url,
        type,
        accessKey,
        userId: session.user.id,
      },
      checkoutUrl: true,
    });
  } catch (error: any) {
    console.error("Error validating website data:", error);
    return NextResponse.json(
      { error: error.message || "Failed to validate website data" },
      { status: 500 }
    );
  }
}
