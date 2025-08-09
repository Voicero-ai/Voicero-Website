import { NextRequest, NextResponse } from "next/server";
import { cors } from "../../../../lib/cors";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    // Handle CORS
    const response = new NextResponse();
    const corsResponse = await cors(request, response);
    if (corsResponse.status === 204) {
      return corsResponse;
    }

    const { websiteId, accessKey } = await request.json();

    if (!websiteId && !accessKey) {
      return NextResponse.json(
        { error: "Missing websiteId or accessKey" },
        { status: 400 }
      );
    }

    let website: { id: string; active: number | boolean } | null = null;

    if (websiteId) {
      const rows = (await query(
        "SELECT id, active FROM Website WHERE id = ? LIMIT 1",
        [websiteId]
      )) as { id: string; active: number | boolean }[];
      website = rows.length > 0 ? rows[0] : null;
    } else if (accessKey) {
      const rows = (await query(
        `SELECT w.id, w.active
         FROM Website w
         JOIN AccessKey ak ON ak.websiteId = w.id
         WHERE ak.key = ?
         LIMIT 1`,
        [accessKey]
      )) as { id: string; active: number | boolean }[];
      website = rows.length > 0 ? rows[0] : null;
    }

    if (!website) {
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
    }

    const currentActive = Boolean(website.active);
    const nextActive = !currentActive;
    await query("UPDATE Website SET active = ? WHERE id = ?", [
      nextActive,
      website.id,
    ]);

    return NextResponse.json({
      status: nextActive ? "active" : "inactive",
    });
  } catch (error) {
    console.error("Error toggling website status:", error);
    return NextResponse.json(
      { error: "Failed to toggle website status" },
      { status: 500 }
    );
  }
}
