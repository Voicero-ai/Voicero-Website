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

// Validation schema for user settings
const userSettingsSchema = z.object({
  name: z
    .string()
    .min(1, "User name is required")
    .max(255, "User name too long")
    .trim(),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username too long")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Username can only contain letters, numbers, underscores, and dashes"
    )
    .trim(),
  email: z
    .string()
    .email("Invalid email address")
    .max(255, "Email too long")
    .trim(),
});

// OPTIONS: CORS preflight
export async function OPTIONS(req: NextRequest) {
  const res = new NextResponse(null, { status: 204 });
  return cors(req, res);
}

// POST: Update user settings from WordPress
// Body: { name: string, username: string, email: string }
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

    console.log("doing updateUserSettings", { websiteId });

    try {
      const validatedData = userSettingsSchema.parse(body);

      // Sanitize the data
      const sanitizedName = validatedData.name.replace(/[<>\"'&]/g, "");
      const sanitizedUsername = validatedData.username
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "");
      const sanitizedEmail = validatedData.email.toLowerCase().trim();

      // Get the user ID associated with this website
      const websiteRows = (await query(
        `SELECT userId FROM Website WHERE id = ? LIMIT 1`,
        [websiteId]
      )) as any[];

      if (!websiteRows || !websiteRows[0] || !websiteRows[0].userId) {
        return cors(
          req,
          json({ error: "User not found for this website" }, 404)
        );
      }

      const userId = websiteRows[0].userId;

      // Check if username is already taken by another user
      if (sanitizedUsername) {
        const existingUsers = (await query(
          "SELECT id FROM User WHERE username = ? AND id != ?",
          [sanitizedUsername, userId]
        )) as any[];

        if (existingUsers.length > 0) {
          return cors(req, json({ error: "Username is already taken" }, 400));
        }
      }

      // Check if email is already taken by another user
      if (sanitizedEmail) {
        const existingUsers = (await query(
          "SELECT id FROM User WHERE email = ? AND id != ?",
          [sanitizedEmail, userId]
        )) as any[];

        if (existingUsers.length > 0) {
          return cors(req, json({ error: "Email is already registered" }, 400));
        }
      }

      // Update user information
      await query(
        `UPDATE User SET name = ?, username = ?, email = ? WHERE id = ?`,
        [sanitizedName, sanitizedUsername, sanitizedEmail, userId]
      );

      // Fetch updated user data
      const userRows = (await query(
        `SELECT id, name, username, email FROM User WHERE id = ? LIMIT 1`,
        [userId]
      )) as any[];

      const updatedUser = userRows && userRows[0] ? userRows[0] : null;

      console.log("done updateUserSettings", { websiteId, userId });

      return cors(
        req,
        json({
          success: true,
          websiteId,
          userId,
          data: updatedUser,
          message: "User settings updated successfully",
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
    console.error("/api/wordpress/updateUserSettings error", err);
    return cors(req, json({ error: "Internal server error" }, 500));
  }
}
