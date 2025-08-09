import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { query } from "../../../../lib/db";

export const dynamic = "force-dynamic";

interface Website {
  id: string;
  url: string;
  userId: string;
  customInstructions: string | null;
}

// Helper function to count words
function countWords(str: string): number {
  return str.trim().split(/\s+/).length;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { websiteId, instructions } = await req.json();

    // Check word count
    if (instructions && countWords(instructions) > 300) {
      return NextResponse.json(
        { error: "Instructions cannot exceed 300 words" },
        { status: 400 }
      );
    }

    // Verify user owns this website
    const websites = (await query(
      "SELECT * FROM Website WHERE id = ? AND userId = ?",
      [websiteId, session.user.id]
    )) as Website[];

    if (websites.length === 0) {
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
    }

    // Update instructions
    await query("UPDATE Website SET customInstructions = ? WHERE id = ?", [
      instructions,
      websiteId,
    ]);

    // Get updated website
    const updatedWebsites = (await query("SELECT * FROM Website WHERE id = ?", [
      websiteId,
    ])) as Website[];

    return NextResponse.json(updatedWebsites[0]);
  } catch (error) {
    console.error("Error updating instructions:", error);
    return NextResponse.json(
      { error: "Failed to update instructions" },
      { status: 500 }
    );
  }
}
