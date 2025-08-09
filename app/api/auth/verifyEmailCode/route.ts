import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";

export const dynamic = "force-dynamic";

interface User {
  id: string;
  email: string;
  emailCode: string | null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, code } = body;

    if (!email || !code) {
      return NextResponse.json(
        { error: "Email and verification code are required" },
        { status: 400 }
      );
    }

    // Find user by email
    const users = (await query(
      "SELECT id, email, emailCode FROM User WHERE email = ?",
      [email]
    )) as User[];

    if (users.length === 0) {
      return NextResponse.json(
        { error: "Invalid verification code" },
        { status: 400 }
      );
    }

    const user = users[0];

    // Check if the code matches
    if (user.emailCode !== code) {
      return NextResponse.json(
        { error: "Invalid verification code" },
        { status: 400 }
      );
    }

    // Mark email as verified and clear the code
    await query(
      "UPDATE User SET emailVerified = ?, emailCode = ? WHERE id = ?",
      [true, null, user.id]
    );

    return NextResponse.json(
      { message: "Email verified successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error verifying email:", error);
    return NextResponse.json(
      { error: "Failed to verify email" },
      { status: 500 }
    );
  }
}
