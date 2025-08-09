import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

interface Website {
  id: string;
  url: string;
  userId: string;
  color: string | null;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { websiteId, color } = await req.json();

    if (!websiteId || !color) {
      return NextResponse.json(
        { error: "Website ID and color are required" },
        { status: 400 }
      );
    }

    // Verify the website belongs to the user
    const websites = (await query(
      "SELECT * FROM Website WHERE id = ? AND userId = ?",
      [websiteId, session.user.id]
    )) as Website[];

    if (websites.length === 0) {
      return NextResponse.json(
        { error: "Website not found or unauthorized" },
        { status: 404 }
      );
    }

    // Update the website color
    await query("UPDATE Website SET color = ? WHERE id = ?", [
      color,
      websiteId,
    ]);

    // Get the updated website
    const updatedWebsites = (await query("SELECT * FROM Website WHERE id = ?", [
      websiteId,
    ])) as Website[];

    return NextResponse.json(updatedWebsites[0]);
  } catch (error) {
    console.error("Error updating website color:", error);
    return NextResponse.json(
      { error: "Failed to update website color" },
      { status: 500 }
    );
  }
}
