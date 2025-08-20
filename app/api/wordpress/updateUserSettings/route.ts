import { NextRequest, NextResponse } from "next/server";
import { cors } from "@/lib/cors";
import { query } from "@/lib/db";
import { verifyToken, getWebsiteIdFromToken } from "@/lib/token-verifier";

export const dynamic = "force-dynamic";

interface AccessKey {
  websiteId: string;
}

interface Website {
  userId: string;
}

interface User {
  id: string;
  name: string;
  username: string;
  email: string;
}

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    // Verify the Bearer token
    const authHeader = request.headers.get("authorization");
    const isTokenValid = await verifyToken(authHeader);

    if (!isTokenValid) {
      return cors(
        request,
        NextResponse.json(
          { error: "Unauthorized - Invalid token" },
          { status: 401 }
        )
      );
    }

    // Get the website ID from the verified token
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

    // Get request body
    const body = await request.json();
    const { websiteId, name, username, email } = body;

    // Validate required fields
    if (!websiteId) {
      return cors(
        request,
        NextResponse.json(
          { error: "Missing required field: websiteId" },
          { status: 400 }
        )
      );
    }

    // Validate at least one update field is provided
    if (!name && !username && !email) {
      return cors(
        request,
        NextResponse.json(
          {
            error:
              "At least one update field (name, username, or email) must be provided",
          },
          { status: 400 }
        )
      );
    }

    // Verify the website matches the one from the token
    if (websiteIdFromToken !== websiteId) {
      return cors(
        request,
        NextResponse.json(
          { error: "Unauthorized to update this website's user" },
          { status: 403 }
        )
      );
    }

    // Find the website and its associated user
    const websites = (await query("SELECT userId FROM Website WHERE id = ?", [
      websiteId,
    ])) as Website[];

    if (websites.length === 0) {
      return cors(
        request,
        NextResponse.json({ error: "Website not found" }, { status: 404 })
      );
    }

    const website = websites[0];

    // Prepare update data parts
    const updateParts = [];
    const updateValues = [];

    if (name) {
      updateParts.push("name = ?");
      updateValues.push(name);
    }

    if (email) {
      updateParts.push("email = ?");
      updateValues.push(email);
    }

    if (username) {
      updateParts.push("username = ?");
      updateValues.push(username);
    }

    // If email is being updated, check if it's already in use
    if (email) {
      const existingUsers = (await query(
        "SELECT id FROM User WHERE email = ?",
        [email]
      )) as { id: string }[];

      if (existingUsers.length > 0 && existingUsers[0].id !== website.userId) {
        return cors(
          request,
          NextResponse.json(
            { error: "Email is already in use" },
            { status: 400 }
          )
        );
      }
    }

    // If username is being updated, check if it's already in use
    if (username) {
      const existingUsers = (await query(
        "SELECT id FROM User WHERE username = ?",
        [username]
      )) as { id: string }[];

      if (existingUsers.length > 0 && existingUsers[0].id !== website.userId) {
        return cors(
          request,
          NextResponse.json(
            { error: "Username is already in use" },
            { status: 400 }
          )
        );
      }
    }

    // Update the user
    if (updateParts.length > 0) {
      const updateQuery = `UPDATE User SET ${updateParts.join(
        ", "
      )} WHERE id = ?`;
      updateValues.push(website.userId);

      await query(updateQuery, updateValues);
    }

    // Get the updated user
    const updatedUsers = (await query(
      "SELECT id, name, username, email FROM User WHERE id = ?",
      [website.userId]
    )) as User[];

    const updatedUser = updatedUsers[0];

    return cors(
      request,
      NextResponse.json({
        success: true,
        message: "User settings updated successfully",
        user: updatedUser,
      })
    );
  } catch (error) {
    console.error("API Error:", error);
    return cors(
      request,
      NextResponse.json({ error: "Internal server error" }, { status: 500 })
    );
  }
}
