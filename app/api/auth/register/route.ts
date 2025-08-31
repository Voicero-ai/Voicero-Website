import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { query } from "../../../../lib/db";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// User interface
interface User {
  id: string;
  username: string;
  email: string;
  name: string;
  createdAt: Date;
}

// Validation schema
const registerSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Username can only contain letters, numbers, underscores, and dashes"
    ),
  email: z.string().email("Please enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(
      /^(?=.*[0-9])(?=.*[!@#$%^&*])/,
      "Password must contain at least 1 number and 1 special character"
    ),
  companyName: z.string().min(2, "Company name is required"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Validate request body
    const validatedData = registerSchema.parse(body);

    // Check if username is taken
    const existingUsernames = (await query(
      "SELECT id FROM User WHERE username = ?",
      [validatedData.username]
    )) as { id: string }[];

    if (existingUsernames.length > 0) {
      return NextResponse.json(
        { error: "Username is already taken" },
        { status: 400 }
      );
    }

    // Check if email is taken
    const existingEmails = (await query("SELECT id FROM User WHERE email = ?", [
      validatedData.email,
    ])) as { id: string }[];

    if (existingEmails.length > 0) {
      return NextResponse.json(
        { error: "Email is already registered" },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await hash(validatedData.password, 12);

    // Create user with explicit UUID
    const userUuid = crypto.randomUUID();

    // Insert with explicit ID
    await query(
      "INSERT INTO User (id, username, email, password, name) VALUES (?, ?, ?, ?, ?)",
      [
        userUuid,
        validatedData.username,
        validatedData.email,
        hashedPassword,
        validatedData.companyName,
      ]
    );

    // Get the created user
    const users = (await query(
      "SELECT id, username, email, name, createdAt FROM User WHERE id = ?",
      [userUuid]
    )) as User[];

    const user = users[0];

    return NextResponse.json(
      {
        message: "User registered successfully",
        user,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
