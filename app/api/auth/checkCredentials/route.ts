import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { query } from "../../../../lib/db";

export const dynamic = "force-dynamic";

interface User {
  id: string;
  email: string;
  username: string;
  password: string;
  emailVerified: boolean | number;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { login, password } = body;

    if (!login || !password) {
      return NextResponse.json(
        { error: "Email/username and password are required" },
        { status: 400 }
      );
    }

    // Find user by email or username
    const isEmail = login.includes("@");
    const users = (await query(
      `SELECT id, email, username, password, emailVerified 
       FROM User 
       WHERE ${isEmail ? "email = ?" : "username = ?"}
       LIMIT 1`,
      [login]
    )) as User[];

    if (users.length === 0) {
      return NextResponse.json(
        { error: "No user found with that email/username" },
        { status: 400 }
      );
    }

    const user = users[0];

    // Verify password
    const isPasswordValid = await compare(password, user.password);
    if (!isPasswordValid) {
      return NextResponse.json({ error: "Invalid password" }, { status: 400 });
    }

    // Return user details without sensitive information
    return NextResponse.json({
      userId: user.id,
      email: user.email,
      username: user.username,
      emailVerified: !!user.emailVerified,
    });
  } catch (error) {
    console.error("Error checking credentials:", error);
    return NextResponse.json(
      { error: "Failed to validate credentials" },
      { status: 500 }
    );
  }
}
