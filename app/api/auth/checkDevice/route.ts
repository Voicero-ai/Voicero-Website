import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";

export const dynamic = "force-dynamic";

interface User {
  id: string;
  email: string;
  emailVerified: boolean | number;
}

interface VerifiedDevice {
  id: string;
  userId: string;
  deviceId: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, deviceId } = body;

    if (!userId || !deviceId) {
      return NextResponse.json(
        { error: "User ID and device ID are required" },
        { status: 400 }
      );
    }

    console.log(
      `Checking device verification for user ${userId}, device ${deviceId}`
    );

    // Check if the user exists
    const users = (await query(
      "SELECT id, email, emailVerified FROM User WHERE id = ?",
      [userId]
    )) as User[];

    if (users.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = users[0];

    // If email is not verified, always require verification
    if (!user.emailVerified) {
      return NextResponse.json({
        needsVerification: true,
        reason: "EMAIL_NOT_VERIFIED",
      });
    }

    // Check if this device is already verified for this user
    const verifiedDevices = (await query(
      "SELECT id, userId, deviceId FROM VerifiedDevice WHERE userId = ? AND deviceId = ?",
      [userId, deviceId]
    )) as VerifiedDevice[];

    // If device is not verified, require verification
    if (verifiedDevices.length === 0) {
      console.log(`Device ${deviceId} not verified for user ${userId}`);
      return NextResponse.json({
        needsVerification: true,
        reason: "DEVICE_NOT_VERIFIED",
      });
    }

    // Device is verified
    console.log(`Device ${deviceId} is verified for user ${userId}`);
    return NextResponse.json({
      needsVerification: false,
    });
  } catch (error) {
    console.error("Error checking device verification:", error);
    return NextResponse.json(
      { error: "Failed to check device verification" },
      { status: 500 }
    );
  }
}
