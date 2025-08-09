import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";

export const dynamic = "force-dynamic";

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
      `Adding verified device for user ${userId}, device ${deviceId}`
    );

    // Check if the device is already verified (to avoid duplicates)
    const existingDevices = (await query(
      "SELECT id, userId, deviceId FROM VerifiedDevice WHERE userId = ? AND deviceId = ?",
      [userId, deviceId]
    )) as VerifiedDevice[];

    if (existingDevices.length > 0) {
      console.log(`Device ${deviceId} already verified for user ${userId}`);
      return NextResponse.json({
        message: "Device already verified",
        deviceId: existingDevices[0].id,
      });
    }

    // Add the device to verified devices
    const result = await query(
      "INSERT INTO VerifiedDevice (userId, deviceId) VALUES (?, ?)",
      [userId, deviceId]
    );

    const deviceDbId = (result as any).insertId;

    console.log(`Successfully added verified device: ${deviceDbId}`);
    return NextResponse.json({
      message: "Device verified successfully",
      deviceId: deviceDbId,
    });
  } catch (error) {
    console.error("Error adding verified device:", error);
    return NextResponse.json(
      { error: "Failed to add verified device" },
      { status: 500 }
    );
  }
}
