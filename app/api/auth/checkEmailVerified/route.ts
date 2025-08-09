import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";

export const dynamic = "force-dynamic";

interface User {
  id: string;
  email: string;
  emailVerified: boolean | number;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { login } = body;

    if (!login) {
      return NextResponse.json(
        { error: "Email or username is required" },
        { status: 400 }
      );
    }

    // Find user by email or username
    const isEmail = login.includes("@");
    const users = (await query(
      `SELECT id, email, emailVerified 
       FROM User 
       WHERE ${isEmail ? "email = ?" : "username = ?"}
       LIMIT 1`,
      [login]
    )) as User[];

    if (users.length === 0) {
      // Don't reveal that the user doesn't exist for security
      return NextResponse.json({ needsVerification: false }, { status: 200 });
    }

    const user = users[0];

    // Return whether the user needs verification
    return NextResponse.json({
      needsVerification: !user.emailVerified,
      email: user.email,
    });
  } catch (error) {
    console.error("Error checking email verification:", error);
    return NextResponse.json(
      { error: "Failed to check email verification status" },
      { status: 500 }
    );
  }
}
