import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";
import { compare } from "bcryptjs";

export const dynamic = "force-dynamic";

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
    const user = await prisma.user.findFirst({
      where: isEmail ? { email: login } : { username: login },
      select: {
        id: true,
        email: true,
        username: true,
        password: true,
        emailVerified: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "No user found with that email/username" },
        { status: 400 }
      );
    }

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
      emailVerified: user.emailVerified,
    });
  } catch (error) {
    console.error("Error checking credentials:", error);
    return NextResponse.json(
      { error: "Failed to validate credentials" },
      { status: 500 }
    );
  }
}
