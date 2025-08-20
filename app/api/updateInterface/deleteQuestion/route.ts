import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../../../lib/auth';
import { cors } from '../../../../lib/cors';
import { query } from '../../../../lib/db';
import { verifyToken, getWebsiteIdFromToken } from '../../../../lib/token-verifier';

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

// POST: Delete a pop-up question by id
// Body: { websiteId, id }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let { websiteId, id } = body || {};

    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      if (!websiteId) {
        return cors(
          request,
          NextResponse.json(
            { error: "Website ID is required" },
            { status: 400 }
          )
        );
      }
      const ownership = (await query(
        `SELECT id FROM Website WHERE id = ? AND userId = ? LIMIT 1`,
        [websiteId, session.user.id]
      )) as { id: string }[];
      if (ownership.length === 0) {
        return cors(
          request,
          NextResponse.json(
            { error: "Unauthorized. You don't have access to this website." },
            { status: 403 }
          )
        );
      }
    } else {
      const authHeader = request.headers.get("Authorization");
      const isTokenValid = await verifyToken(authHeader);
      if (!isTokenValid) {
        return cors(
          request,
          NextResponse.json(
            {
              error:
                "Unauthorized. Please log in or provide a valid access key.",
            },
            { status: 401 }
          )
        );
      }
      const websiteIdFromToken = await getWebsiteIdFromToken(authHeader);
      if (!websiteIdFromToken) {
        return cors(
          request,
          NextResponse.json(
            { error: "Could not determine website ID from token" },
            { status: 400 }
          )
        );
      }
      if (!websiteId) websiteId = websiteIdFromToken;
      if (websiteId && websiteId !== websiteIdFromToken) {
        return cors(
          request,
          NextResponse.json(
            { error: "Unauthorized to access this website" },
            { status: 403 }
          )
        );
      }
    }

    if (!id) {
      return cors(
        request,
        NextResponse.json({ error: "id is required" }, { status: 400 })
      );
    }

    await query(`DELETE FROM PopUpQuestion WHERE id = ? AND websiteId = ?`, [
      id,
      websiteId,
    ]);

    return cors(request, NextResponse.json({ success: true }));
  } catch (err) {
    console.error("POST /api/updateInterface/deleteQuestion error:", err);
    return cors(
      request,
      NextResponse.json({ error: "Failed to delete question" }, { status: 500 })
    );
  }
}
