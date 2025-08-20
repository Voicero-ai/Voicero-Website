import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../../lib/auth";
import { cors } from '../../../../lib/cors';
import { query } from '../../../../lib/db';
import { verifyToken, getWebsiteIdFromToken } from '../../../../lib/token-verifier';
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let { websiteId, question, documentAnswer, number, type, status } =
      body || {};

    // Defaults
    question = question ?? "New question";
    documentAnswer = documentAnswer ?? "";
    number = typeof number === "number" ? number : 0;
    type = type === "ai" ? "ai" : "manual";
    status = status === "published" ? "published" : "draft";

    // Try session-based auth first
    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      if (!websiteId) {
        return cors(
          request,
          NextResponse.json({ error: "websiteId is required" }, { status: 400 })
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
      // Fallback to Bearer token auth
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

    const id = randomUUID();
    await query(
      `INSERT INTO HelpModule (id, websiteId, question, documentAnswer, number, type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, websiteId, question, documentAnswer, number, type, status]
    );

    return cors(request, NextResponse.json({ success: true, id }));
  } catch (err) {
    console.error("POST /api/helpCenter/add error:", err);
    return cors(
      request,
      NextResponse.json({ error: "Failed to add help module" }, { status: 500 })
    );
  }
}
