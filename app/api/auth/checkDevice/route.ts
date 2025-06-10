import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";

export const dynamic = "force-dynamic";

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
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailVerified: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // If email is not verified, always require verification
    if (!user.emailVerified) {
      return NextResponse.json({
        needsVerification: true,
        reason: "EMAIL_NOT_VERIFIED",
      });
    }

    // Check if this device is already verified for this user
    const verifiedDevice = await prisma.verifiedDevice.findFirst({
      where: {
        userId: userId,
        deviceId: deviceId,
      },
    });

    // If device is not verified, require verification
    if (!verifiedDevice) {
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
