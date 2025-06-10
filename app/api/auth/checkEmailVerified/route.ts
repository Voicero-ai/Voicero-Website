import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";
import { compare } from "bcryptjs";

export const dynamic = "force-dynamic";

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
    const user = await prisma.user.findFirst({
      where: isEmail ? { email: login } : { username: login },
      select: {
        id: true,
        email: true,
        emailVerified: true,
      },
    });

    if (!user) {
      // Don't reveal that the user doesn't exist for security
      return NextResponse.json({ needsVerification: false }, { status: 200 });
    }

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
