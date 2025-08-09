import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Count unread contacts for the user
    const unreadCountResult = await query(
      "SELECT COUNT(*) as count FROM Contact WHERE userId = ? AND `read` = ?",
      [userId, false]
    );

    // Extract the count from the result
    const unreadCount =
      Array.isArray(unreadCountResult) && unreadCountResult.length > 0
        ? (unreadCountResult[0] as { count: number }).count
        : 0;

    return NextResponse.json({ count: unreadCount });
  } catch (error) {
    console.error("Error fetching unread contacts:", error);
    return NextResponse.json(
      { error: "Failed to fetch unread contacts" },
      { status: 500 }
    );
  }
}
