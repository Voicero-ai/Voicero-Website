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
      `Adding verified device for user ${userId}, device ${deviceId}`
    );

    // Check if the device is already verified (to avoid duplicates)
    const existingDevice = await prisma.verifiedDevice.findFirst({
      where: {
        userId: userId,
        deviceId: deviceId,
      },
    });

    if (existingDevice) {
      console.log(`Device ${deviceId} already verified for user ${userId}`);
      return NextResponse.json({
        message: "Device already verified",
        deviceId: existingDevice.id,
      });
    }

    // Add the device to verified devices
    const verifiedDevice = await prisma.verifiedDevice.create({
      data: {
        userId: userId,
        deviceId: deviceId,
      },
    });

    console.log(`Successfully added verified device: ${verifiedDevice.id}`);
    return NextResponse.json({
      message: "Device verified successfully",
      deviceId: verifiedDevice.id,
    });
  } catch (error) {
    console.error("Error adding verified device:", error);
    return NextResponse.json(
      { error: "Failed to add verified device" },
      { status: 500 }
    );
  }
}
