import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../lib/auth";
import { cors } from "@/lib/cors";
import { query } from "../../../lib/db";
import crypto from "crypto";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

interface Website {
  id: string;
  url: string;
  name: string;
  userId: string;
  type: string;
}

interface AccessKey {
  id: string;
  key: string;
  websiteId: string;
}

export async function POST(request: Request) {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { siteUrl, wpRedirect, websiteId, type } = await request.json();

    if (!siteUrl || !wpRedirect || !type) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    // Validate type
    if (!["WordPress", "Shopify"].includes(type)) {
      return NextResponse.json({ error: "Invalid site type" }, { status: 400 });
    }

    let website: Website;
    let accessKey: AccessKey;
    const websiteName = extractWebsiteName(siteUrl);

    if (websiteId) {
      // Use existing website
      const websites = (await query(
        "SELECT * FROM Website WHERE id = ? AND userId = ? AND type = ?",
        [websiteId, session.user.id, type]
      )) as Website[];

      if (websites.length === 0) {
        return NextResponse.json(
          { error: "Website not found" },
          { status: 404 }
        );
      }

      website = websites[0];

      // Get access keys for this website
      const accessKeys = (await query(
        "SELECT * FROM AccessKey WHERE websiteId = ?",
        [website.id]
      )) as AccessKey[];

      if (accessKeys.length > 0) {
        accessKey = accessKeys[0];
      } else {
        // Create a new access key
        const newKey = generateAccessKey();
        const hashedKey = await hashAccessKey(newKey);
        const accessKeyResult = await query(
          "INSERT INTO AccessKey (`key`, websiteId) VALUES (?, ?)",
          [hashedKey, website.id]
        );

        accessKey = {
          id: (accessKeyResult as any).insertId,
          key: newKey,
          websiteId: website.id,
        };
      }
    } else {
      // Check if website already exists
      const existingWebsites = (await query(
        "SELECT * FROM Website WHERE url = ? AND userId = ? AND type = ?",
        [siteUrl, session.user.id, type]
      )) as Website[];

      if (existingWebsites.length > 0) {
        website = existingWebsites[0];

        // Get access keys for this website
        const accessKeys = (await query(
          "SELECT * FROM AccessKey WHERE websiteId = ?",
          [website.id]
        )) as AccessKey[];

        if (accessKeys.length > 0) {
          accessKey = accessKeys[0];
        } else {
          // Create a new access key
          const newKey = generateAccessKey();
          const hashedKey = await hashAccessKey(newKey);
          const accessKeyResult = await query(
            "INSERT INTO AccessKey (`key`, websiteId) VALUES (?, ?)",
            [hashedKey, website.id]
          );

          accessKey = {
            id: (accessKeyResult as any).insertId,
            key: newKey,
            websiteId: website.id,
          };
        }
      } else {
        // Create a new website
        const renewsOn = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Set 30 days from now
        const websiteResult = await query(
          `INSERT INTO Website 
            (url, name, userId, type, plan, queryLimit, renewsOn) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [siteUrl, websiteName, session.user.id, type, "", 0, renewsOn]
        );

        const newWebsiteId = (websiteResult as any).insertId;

        // Create a new access key
        const newKey = generateAccessKey();
        const hashedKey = await hashAccessKey(newKey);
        const accessKeyResult = await query(
          "INSERT INTO AccessKey (`key`, websiteId) VALUES (?, ?)",
          [hashedKey, newWebsiteId]
        );

        website = {
          id: newWebsiteId,
          url: siteUrl,
          name: websiteName,
          userId: session.user.id,
          type: type,
        };

        accessKey = {
          id: (accessKeyResult as any).insertId,
          key: newKey,
          websiteId: newWebsiteId,
        };
      }
    }

    // Construct redirect URL with access key
    const redirectUrl = new URL(wpRedirect);
    redirectUrl.searchParams.set("access_key", accessKey.key);

    return NextResponse.json({
      redirectUrl: redirectUrl.toString(),
      accessKey: accessKey.key,
    });
  } catch (error) {
    console.error("Connection error:", error);
    return NextResponse.json(
      { error: "Failed to process connection" },
      { status: 500 }
    );
  }
}

// Generate a secure access key
function generateAccessKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Hash the access key before storage
async function hashAccessKey(accessKey: string): Promise<string> {
  return await bcrypt.hash(accessKey, 12);
}

function extractWebsiteName(url: string): string {
  try {
    // Get the part between // and the next /
    const match = url.match(/\/\/(.*?)(?:\/|$)/);
    if (!match) return "My Website";

    // Get the domain without the TLD
    const domain = match[1].split(".")[0];

    // Capitalize first letter and replace hyphens/underscores with spaces
    return (
      domain.charAt(0).toUpperCase() + domain.slice(1).replace(/[-_]/g, " ")
    );
  } catch (error) {
    return "My Website";
  }
}
