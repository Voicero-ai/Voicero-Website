import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../../lib/auth";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const s3 = new S3Client({
  region: "us-east-2",
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY as string,
  },
});

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get origin for CORS
    const origin = request.headers.get("origin") || "";

    // Generate unique file name
    const fileType = request.headers.get("content-type") || "image/jpeg";
    const fileExtension = fileType.split("/")[1];
    const fileName = `${session.user.id}-${crypto
      .randomBytes(16)
      .toString("hex")}.${fileExtension}`;
    const key = `userProfiles/${fileName}`;

    // Create presigned URL
    const putObjectCommand = new PutObjectCommand({
      Bucket: "voicero",
      Key: key,
      ContentType: fileType,
    });

    const uploadUrl = await getSignedUrl(s3, putObjectCommand, {
      expiresIn: 60,
    });

    // Return response with CORS headers
    return NextResponse.json(
      {
        uploadUrl,
        key,
        bucketUrl: `https://voicero.s3.us-east-2.amazonaws.com`,
      },
      {
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }
    );
  } catch (error) {
    console.error("Error generating upload URL:", error);
    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 }
    );
  }
}

// Handle OPTIONS preflight request
export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin") || "";

  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
