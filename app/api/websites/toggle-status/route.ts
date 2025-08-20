import { NextRequest, NextResponse } from "next/server";
import { cors } from '../../../../lib/cors';
import { query } from '../../../../lib/db';
import { verifyToken, getWebsiteIdFromToken } from '../../../../lib/token-verifier';
import { getServerSession } from "next-auth";
import { authOptions } from '../../../../lib/auth';

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

    // Parse body early (used by both auth paths)
    const { websiteId } = (await request.json().catch(() => ({}))) as {
      websiteId?: string;
    };

    // 1) Try session-based auth (owner-only)
    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      if (!websiteId) {
        return NextResponse.json(
          { error: "Website ID is required" },
          { status: 400 }
        );
      }

      // Ensure the logged-in user owns the website
      const rows = (await query(
        "SELECT id, userId, active FROM Website WHERE id = ? LIMIT 1",
        [websiteId]
      )) as { id: string; userId: string; active: number | boolean }[];

      const website = rows.length > 0 ? rows[0] : null;
      if (!website || website.userId !== (session.user as any).id) {
        return NextResponse.json(
          { error: "Website not found or access denied" },
          { status: 403 }
        );
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
    }

    // 2) Fall back to Bearer token auth (for external callers)
    const authHeader = request.headers.get("authorization");
    const isTokenValid = await verifyToken(authHeader);
    if (!isTokenValid) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid token" },
        { status: 401 }
      );
    }

    const websiteIdFromToken = await getWebsiteIdFromToken(authHeader);
    if (!websiteIdFromToken) {
      return NextResponse.json(
        { error: "Could not determine website ID from token" },
        { status: 400 }
      );
    }

    const finalWebsiteId = websiteId || websiteIdFromToken;
    if (!finalWebsiteId) {
      return NextResponse.json(
        { error: "Website ID is required" },
        { status: 400 }
      );
    }

    if (websiteId && websiteId !== websiteIdFromToken) {
      return NextResponse.json(
        { error: "Unauthorized to access this website" },
        { status: 403 }
      );
    }

    const rows = (await query(
      "SELECT id, active FROM Website WHERE id = ? LIMIT 1",
      [finalWebsiteId]
    )) as { id: string; active: number | boolean }[];

    const website = rows.length > 0 ? rows[0] : null;
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
