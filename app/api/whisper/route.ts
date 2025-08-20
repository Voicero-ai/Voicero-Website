import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { cors } from "@/lib/cors";
import { query } from "@/lib/db";
import { verifyToken, getWebsiteIdFromToken } from "@/lib/token-verifier";

export const dynamic = "force-dynamic";

// Add debug logging for environment variables
console.log("Environment check:", {
  hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
  hasAccessKey: Boolean(process.env.ACCESS_KEY),
  accessKeyLength: process.env.ACCESS_KEY?.length,
  accessKeyStart: process.env.ACCESS_KEY?.substring(0, 5),
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    // Verify the Bearer token
    const authHeader = request.headers.get("authorization");
    const isTokenValid = await verifyToken(authHeader);

    if (!isTokenValid) {
      return cors(
        request,
        NextResponse.json(
          { error: "Unauthorized - Invalid token" },
          { status: 401 }
        )
      );
    }

    // Get the website ID from the verified token
    const websiteId = await getWebsiteIdFromToken(authHeader);

    if (!websiteId) {
      return cors(
        request,
        NextResponse.json(
          { error: "Could not determine website ID from token" },
          { status: 400 }
        )
      );
    }

    // Find the website using the website ID
    const websiteRows = (await query(
      `SELECT w.* FROM Website w WHERE w.id = ? LIMIT 1`,
      [websiteId]
    )) as any[];
    const website = websiteRows[0];

    console.log("Website found:", website ? "yes" : "no"); // Debug log

    if (!website) {
      return cors(
        request,
        NextResponse.json({ error: "Website not found" }, { status: 404 })
      );
    }

    // Get the form data from the request
    const formData = await request.formData();
    const audioFile = formData.get("audio");

    if (!audioFile || !(audioFile instanceof Blob)) {
      return cors(
        request,
        NextResponse.json({ error: "No audio file provided" }, { status: 400 })
      );
    }

    // Send to OpenAI Whisper API - updated to properly handle the file format
    const response = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "gpt-4o-mini-transcribe",
      response_format: "json",
    });

    // Wrap all responses with cors
    return cors(
      request,
      NextResponse.json({
        text: response.text,
      })
    );
  } catch (error) {
    console.error("Whisper API error:", error);
    return cors(
      request,
      NextResponse.json(
        {
          error: "Error processing audio",
          details: error instanceof Error ? error.message : String(error),
        },
        { status: 500 }
      )
    );
  }
}

// Add this test endpoint
export async function GET(request: NextRequest) {
  return cors(
    request,
    NextResponse.json({
      hasAccessKey: Boolean(process.env.ACCESS_KEY),
      accessKeyLength: process.env.ACCESS_KEY?.length,
      // Don't send the full key for security
      accessKeyStart: process.env.ACCESS_KEY?.substring(0, 5),
    })
  );
}
