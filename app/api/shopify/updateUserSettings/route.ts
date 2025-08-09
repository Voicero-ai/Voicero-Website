import { NextRequest, NextResponse } from "next/server";
import { cors } from "../../../../lib/cors";
import { query } from "../../../../lib/db";

export const dynamic = "force-dynamic";

interface AccessKey {
  id: string;
  key: string;
  websiteId: string;
}

interface Website {
  id: string;
  userId: string;
}

interface User {
  id: string;
  name: string | null;
  username: string;
  email: string;
}

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return cors(
        request,
        NextResponse.json(
          { error: "Missing or invalid authorization header" },
          { status: 401 }
        )
      );
    }

    // Extract the access key
    const accessKey = authHeader.split(" ")[1];

    if (!accessKey) {
      return cors(
        request,
        NextResponse.json({ error: "No access key provided" }, { status: 401 })
      );
    }

    // Get request body
    const body = await request.json();
    const { websiteId: providedWebsiteId, name, username, email } = body;

    // websiteId is optional when using access key; we'll infer it below if not provided

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

    // First find the website ID using the access key
    const accessKeys = (await query(
      "SELECT websiteId FROM AccessKey WHERE `key` = ?",
      [accessKey]
    )) as AccessKey[];

    if (accessKeys.length === 0) {
      return cors(
        request,
        NextResponse.json({ error: "Invalid access key" }, { status: 401 })
      );
    }

    const accessKeyRecord = accessKeys[0];

    // Determine target websiteId: prefer provided, fallback to access key's websiteId
    let websiteId = providedWebsiteId || accessKeyRecord.websiteId;

    // If providedWebsiteId was sent and doesn't match, ensure both websites belong to the same user
    if (providedWebsiteId && accessKeyRecord.websiteId !== providedWebsiteId) {
      const [accessKeyWebsiteResult, providedWebsiteResult] = await Promise.all(
        [
          query("SELECT userId FROM Website WHERE id = ?", [
            accessKeyRecord.websiteId,
          ]),
          query("SELECT userId FROM Website WHERE id = ?", [providedWebsiteId]),
        ]
      );

      const accessKeyWebsites = accessKeyWebsiteResult as Website[];
      const providedWebsites = providedWebsiteResult as Website[];

      if (providedWebsites.length === 0) {
        // If provided website is not found, fallback to the access key's websiteId
        websiteId = accessKeyRecord.websiteId;
      } else {
        // Only enforce same-owner when providedWebsite exists
        if (accessKeyWebsites.length === 0) {
          return cors(
            request,
            NextResponse.json({ error: "Invalid access key" }, { status: 401 })
          );
        }

        if (accessKeyWebsites[0].userId !== providedWebsites[0].userId) {
          return cors(
            request,
            NextResponse.json(
              { error: "Unauthorized to update this website's user" },
              { status: 403 }
            )
          );
        }
      }
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

    // Prepare update data fields and values
    const updateFields = [];
    const updateValues = [];

    if (name) {
      updateFields.push("name = ?");
      updateValues.push(name);
    }

    if (email) {
      updateFields.push("email = ?");
      updateValues.push(email);
    }

    if (username) {
      updateFields.push("username = ?");
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
    if (updateFields.length > 0) {
      await query(`UPDATE User SET ${updateFields.join(", ")} WHERE id = ?`, [
        ...updateValues,
        website.userId,
      ]);
    }

    // Get the updated user
    const updatedUsers = (await query(
      "SELECT id, name, username, email FROM User WHERE id = ?",
      [website.userId]
    )) as User[];

    return cors(
      request,
      NextResponse.json({
        success: true,
        message: "User settings updated successfully",
        user: updatedUsers[0],
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
