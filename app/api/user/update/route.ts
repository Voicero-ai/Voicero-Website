import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../../lib/auth";
import { query } from "../../../../lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Define types
interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  profilePicture: string | null;
}

const updateUserSchema = z
  .object({
    name: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z
        .string()
        .min(2, "Name must be at least 2 characters")
        .transform((v) => v.trim())
        .optional()
    ),
    username: z.preprocess(
      (v) => {
        if (typeof v !== "string") return v;
        const cleaned = v.trim();
        if (cleaned === "") return undefined;
        return cleaned.replace(/\s+/g, "-").toLowerCase();
      },
      z
        .string()
        .min(3, "Username must be at least 3 characters")
        .regex(
          /^[a-z0-9_-]+$/,
          "Username can only contain letters, numbers, underscores, and dashes"
        )
        .optional()
    ),
    email: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z
        .string()
        .email("Invalid email address")
        .transform((v) => v.trim())
        .optional()
    ),
    profilePicture: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().url("Invalid URL").optional()
    ),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.username !== undefined ||
      data.email !== undefined ||
      data.profilePicture !== undefined,
    {
      message: "No fields to update",
      path: ["_"],
    }
  );

// Support POST in addition to PUT for clients using POST /api/updateUserSettings
export async function POST(req: Request) {
  return handleUpdate(req);
}

export async function PUT(req: Request) {
  return handleUpdate(req);
}

async function handleUpdate(req: Request) {
  try {
    console.time("user-update-route");
    console.log("[USER_UPDATE] Incoming request");
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      console.warn("[USER_UPDATE] Unauthorized: missing session user");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    console.log("[USER_UPDATE] session.user.id:", session.user.id);
    console.log("[USER_UPDATE] raw body:", body);
    const validatedData = updateUserSchema.parse(body);
    console.log("[USER_UPDATE] validatedData:", validatedData);

    // Check if username is taken (if username is being updated)
    if (validatedData.username) {
      const existingUsers = (await query(
        "SELECT id FROM User WHERE username = ?",
        [validatedData.username]
      )) as User[];

      console.log(
        "[USER_UPDATE] username check:",
        validatedData.username,
        "matches:",
        existingUsers.map((u) => u.id)
      );

      if (existingUsers.length > 0 && existingUsers[0].id !== session.user.id) {
        console.warn("[USER_UPDATE] username taken by:", existingUsers[0].id);
        return NextResponse.json(
          { error: "Username is already taken" },
          { status: 400 }
        );
      }
    }

    // Check if email is taken (if email is being updated)
    if (validatedData.email) {
      const existingUsers = (await query(
        "SELECT id FROM User WHERE email = ?",
        [validatedData.email]
      )) as User[];

      console.log(
        "[USER_UPDATE] email check:",
        validatedData.email,
        "matches:",
        existingUsers.map((u) => u.id)
      );

      if (existingUsers.length > 0 && existingUsers[0].id !== session.user.id) {
        console.warn("[USER_UPDATE] email taken by:", existingUsers[0].id);
        return NextResponse.json(
          { error: "Email is already registered" },
          { status: 400 }
        );
      }
    }

    // Build the update query dynamically
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    if (validatedData.name) {
      updateFields.push("name = ?");
      updateValues.push(validatedData.name);
    }

    if (validatedData.username) {
      updateFields.push("username = ?");
      updateValues.push(validatedData.username);
    }

    if (validatedData.email) {
      updateFields.push("email = ?");
      updateValues.push(validatedData.email);
    }

    if (validatedData.profilePicture) {
      updateFields.push("profilePicture = ?");
      updateValues.push(validatedData.profilePicture);
    }

    if (updateFields.length === 0) {
      console.warn("[USER_UPDATE] No fields to update");
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    // Add the user ID to the values array
    updateValues.push(session.user.id);

    // Execute the update query
    console.log("[USER_UPDATE] updateFields:", updateFields.join(", "));
    console.log(
      "[USER_UPDATE] updateValues (excluding id):",
      updateValues.slice(0, -1)
    );

    await query(
      `UPDATE User SET ${updateFields.join(", ")} WHERE id = ?`,
      updateValues
    );

    // Fetch the updated user
    const updatedUsers = (await query(
      "SELECT id, name, username, email, profilePicture FROM User WHERE id = ?",
      [session.user.id]
    )) as User[];

    const updatedUser = updatedUsers[0];

    console.log("[USER_UPDATE] success for user:", updatedUser?.id);
    console.timeEnd("user-update-route");
    return NextResponse.json(updatedUser);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      console.warn("[USER_UPDATE] validation error:", error.errors);
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    // Handle duplicate key errors gracefully
    if (error?.code === "ER_DUP_ENTRY") {
      console.warn("[USER_UPDATE] duplicate entry error:", error?.sqlMessage);
      return NextResponse.json(
        { error: "Username or email is already in use" },
        { status: 400 }
      );
    }

    console.error("Error updating user:", error);
    console.timeEnd("user-update-route");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
