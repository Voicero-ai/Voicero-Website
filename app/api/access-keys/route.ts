import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../lib/auth";
import { query } from "../../../lib/db";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all websites for the user
    const websites = (await query(
      "SELECT id, url, type FROM Website WHERE userId = ?",
      [session.user.id]
    )) as any[];

    // For each website, get its access keys
    for (const website of websites) {
      const accessKeys = await query(
        "SELECT id, name, `key`, createdAt FROM AccessKey WHERE websiteId = ?",
        [website.id]
      );
      website.accessKeys = accessKeys;
    }

    return NextResponse.json(websites);
  } catch (error) {
    console.error("Error fetching access keys:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { websiteId, name } = await request.json();

    // Verify website belongs to user
    const websites = (await query(
      "SELECT * FROM Website WHERE id = ? AND userId = ?",
      [websiteId, session.user.id]
    )) as any[];

    if (websites.length === 0) {
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
    }

    // Get current access keys to check limit
    const accessKeys = (await query(
      "SELECT * FROM AccessKey WHERE websiteId = ?",
      [websiteId]
    )) as any[];

    if (accessKeys.length >= 5) {
      return NextResponse.json(
        { error: "Maximum number of keys reached" },
        { status: 400 }
      );
    }

    // Generate a new access key
    const newAccessKey = generateAccessKey();
    const hashedAccessKey = await hashAccessKey(newAccessKey);

    // Store the hashed access key
    await query(
      "INSERT INTO AccessKey (id, name, key, websiteId) VALUES (UUID(), ?, ?, ?)",
      [name || "Default", hashedAccessKey, websiteId]
    );

    // Retrieve the newly created key
    const newKeys = (await query("SELECT * FROM AccessKey WHERE `key` = ?", [
      hashedAccessKey,
    ])) as any[];

    return NextResponse.json(newKeys[0]);
  } catch (error) {
    console.error("Error creating access key:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { keyId } = await request.json();

    // Verify the key belongs to a website owned by the user
    const accessKeys = (await query(
      `SELECT ak.* FROM AccessKey ak 
       JOIN Website w ON ak.websiteId = w.id 
       WHERE ak.id = ? AND w.userId = ?`,
      [keyId, session.user.id]
    )) as any[];

    if (accessKeys.length === 0) {
      return NextResponse.json(
        { error: "Access key not found" },
        { status: 404 }
      );
    }

    // Delete the access key
    await query("DELETE FROM AccessKey WHERE id = ?", [keyId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting access key:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Generate a secure access key
function generateAccessKey(): string {
  return `vk_${crypto.randomBytes(16).toString("hex")}_${crypto
    .randomBytes(16)
    .toString("hex")}`;
}

// Hash the access key before storage
async function hashAccessKey(accessKey: string): Promise<string> {
  return await bcrypt.hash(accessKey, 12);
}
