import { NextRequest, NextResponse } from "next/server";
import { cors } from "../../../../lib/cors";
import {
  verifyToken,
  getWebsiteIdFromToken,
} from "../../../../lib/token-verifier";
import { query } from "../../../../lib/db";
import { z } from "zod";

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

// Validation schema for website information
const websiteInfoSchema = z.object({
  name: z
    .string()
    .min(1, "Website name is required")
    .max(255, "Website name too long")
    .trim(),
  url: z.string().url("Invalid website URL").max(500, "Website URL too long"),
});

// OPTIONS: CORS preflight
export async function OPTIONS(req: NextRequest) {
  const res = new NextResponse(null, { status: 204 });
  return cors(req, res);
}

// POST: Update website information from WordPress
// Body: { name: string, url: string }
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

    console.log("doing updateWebsite", { websiteId });

    try {
      const validatedData = websiteInfoSchema.parse(body);

      // Sanitize the data
      const sanitizedName = validatedData.name.replace(/[<>\"'&]/g, "");
      const sanitizedUrl = validatedData.url;

      // Update website information
      await query(`UPDATE Website SET name = ?, url = ? WHERE id = ?`, [
        sanitizedName,
        sanitizedUrl,
        websiteId,
      ]);

      // Fetch updated website data
      const websiteRows = (await query(
        `SELECT id, name, url FROM Website WHERE id = ? LIMIT 1`,
        [websiteId]
      )) as any[];

      const updatedWebsite =
        websiteRows && websiteRows[0] ? websiteRows[0] : null;

      console.log("done updateWebsite", { websiteId });

      return cors(
        req,
        json({
          success: true,
          websiteId,
          data: updatedWebsite,
          message: "Website information updated successfully",
        })
      );
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        return cors(
          req,
          json(
            {
              error: "Validation failed",
              details: validationError.errors[0].message,
            },
            400
          )
        );
      }
      throw validationError;
    }
  } catch (err) {
    console.error("/api/wordpress/updateWebsite error", err);
    return cors(req, json({ error: "Internal server error" }, 500));
  }
}
