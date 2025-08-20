import { NextRequest, NextResponse } from "next/server";
import { cors } from '../../../../lib/cors';
import { verifyToken, getWebsiteIdFromToken } from '../../../../lib/token-verifier';
import { query } from '../../../../lib/db';

export const dynamic = "force-dynamic";

function json(data: any, init?: number | ResponseInit) {
  return new NextResponse(JSON.stringify(data), {
    status: typeof init === "number" ? init : init?.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      ...(typeof init === "object" ? init.headers : {}),
    },
  });
}

// OPTIONS: CORS preflight
export async function OPTIONS(req: NextRequest) {
  const res = new NextResponse(null, { status: 204 });
  return cors(req, res);
}

// POST: Toggle a website feature (voice/text) on/off using bearer token auth
// Body: { feature: "voice"|"text", enabled: boolean }
export async function POST(req: NextRequest) {
  const res = new NextResponse();
  cors(req, res);

  try {
    const authHeader = req.headers.get("authorization");
    const isValid = await verifyToken(authHeader);
    if (!isValid) {
      return cors(req, json({ error: "Unauthorized" }, 401));
    }

    const websiteId = await getWebsiteIdFromToken(authHeader);
    if (!websiteId) {
      return cors(req, json({ error: "Website not found for token" }, 403));
    }

    const body = await req.json().catch(() => ({}));
    const feature = String(body?.feature || "").toLowerCase();
    const enabled = body?.enabled;

    if (
      (feature !== "voice" && feature !== "text") ||
      typeof enabled !== "boolean"
    ) {
      return cors(
        req,
        json(
          {
            error:
              "Invalid payload. Provide feature ('voice'|'text') and enabled (boolean).",
          },
          400
        )
      );
    }

    const column = feature === "voice" ? "showVoiceAI" : "showTextAI";

    console.log("doing toggle-feature", { websiteId, feature, enabled });

    // Update DB
    await query(`UPDATE Website SET ${column} = ? WHERE id = ?`, [
      enabled ? 1 : 0,
      websiteId,
    ]);

    // Read back the current values
    const rows = (await query(
      `SELECT showVoiceAI, showTextAI FROM Website WHERE id = ? LIMIT 1`,
      [websiteId]
    )) as any[];
    const current = rows && rows[0] ? rows[0] : {};

    console.log("done toggle-feature", { websiteId, feature, enabled });

    return cors(
      req,
      json({
        success: true,
        websiteId,
        feature,
        enabled,
        state: {
          showVoiceAI: Boolean(current.showVoiceAI),
          showTextAI: Boolean(current.showTextAI),
        },
      })
    );
  } catch (err) {
    console.error("/api/websites/toggle-feature error", err);
    return cors(req, json({ error: "Internal error" }, 500));
  }
}
