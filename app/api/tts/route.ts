// FIXED SERVER-SIDE IMPLEMENTATION FOR ELEVENLABS TTS API

import { NextRequest, NextResponse } from "next/server";
import { cors } from "@/lib/cors";
import { query } from "@/lib/db";
import { verifyToken, getWebsiteIdFromToken } from "@/lib/token-verifier";

export const dynamic = "force-dynamic";

// ElevenLabs API configuration
const ELEVEN_LABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";

// Voice settings tuned for sales-oriented speech - FIXED
const VOICE_SETTINGS = {
  stability: 0.75,
  similarity_boost: 0.75,
  // speaking_rate removed - not officially supported
  style_intensity: 0.5, // Changed from style to style_intensity
  use_speaker_boost: true,
};

interface Website {
  id: string;
}

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
    const websites = (await query(
      `SELECT w.id FROM Website w WHERE w.id = ? LIMIT 1`,
      [websiteId]
    )) as Website[];

    console.log("Website found:", websites.length > 0 ? "yes" : "no"); // Debug log

    if (websites.length === 0) {
      return cors(
        request,
        NextResponse.json({ error: "Website not found" }, { status: 404 })
      );
    }

    const website = websites[0];

    // Get the text from the request body
    const body = await request.json();
    const { text } = body;

    if (!text) {
      return cors(
        request,
        NextResponse.json({ error: "No text provided" }, { status: 400 })
      );
    }

    // First try with simpler parameters that are guaranteed to work
    const VOICE_ID = "DtsPFCrhbCbbJkwZsb3d"; // Piper's voice ID

    // Check if text is long enough for streaming endpoint
    const isLongText = text.length > 300;
    const endpoint = isLongText
      ? `${ELEVEN_LABS_API_URL}/${VOICE_ID}/stream` // Use streaming for longer texts
      : `${ELEVEN_LABS_API_URL}/${VOICE_ID}`;

    console.log(
      `Using ${
        isLongText ? "streaming" : "standard"
      } endpoint for text of length ${text.length}`
    );

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": process.env.ELEVEN_LABS_API_KEY || "",
        Accept: "audio/mpeg", // Explicitly request audio format
      },
      body: JSON.stringify({
        text,
        // Start with minimal parameters for testing
        voice_settings: {
          stability: 0.75,
          similarity_boost: 0.75,
          // Add other params only after confirming these work
        },
        output_format: "mp3_44100",
      }),
    });

    console.log("ElevenLabs API response status:", response.status);

    if (!response.ok) {
      // Try to get the error as text first
      const errorText = await response.text();

      // Try to parse as JSON if possible
      let errorData = {};
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { text: errorText };
      }

      console.error("ElevenLabs API error details:", errorData);
      return cors(
        request,
        NextResponse.json(
          {
            error: "ElevenLabs API error",
            status: response.status,
            details: errorData,
          },
          { status: response.status }
        )
      );
    }

    // Get the audio data
    const audioBuffer = await response.arrayBuffer();
    console.log("Audio buffer size:", audioBuffer.byteLength, "bytes");
    console.log("Response content-type:", response.headers.get("content-type"));

    // More thorough validation of the audio data
    if (audioBuffer.byteLength > 0) {
      // Check if the buffer is suspiciously small for an audio file
      if (audioBuffer.byteLength < 1000) {
        console.warn(
          "Response is suspiciously small for audio data:",
          audioBuffer.byteLength,
          "bytes"
        );

        // Try to decode as text to check if it's an error message
        try {
          const textDecoder = new TextDecoder();
          const contentAsText = textDecoder.decode(audioBuffer);
          console.error("Small response as text:", contentAsText);

          // Check if it looks like JSON, an error message, or other non-audio text
          if (
            contentAsText.match(/[\{\}"':]/) ||
            contentAsText.toLowerCase().includes("error") ||
            contentAsText.match(/^\s*[\w\s\.\-\,]+\s*$/)
          ) {
            return cors(
              request,
              NextResponse.json(
                {
                  error:
                    "Invalid audio: Response too small and appears to be text",
                  details: contentAsText,
                },
                { status: 500 }
              )
            );
          }
        } catch (e) {
          console.error("Couldn't decode small response as text:", e);
        }
      }

      // Check for valid MP3 data
      const view = new Uint8Array(audioBuffer.slice(0, 4));
      // Check for MP3 header markers (ID3 or MPEG frame sync)
      const isMP3 =
        (view[0] === 0x49 && view[1] === 0x44 && view[2] === 0x33) || // "ID3"
        (view[0] === 0xff && (view[1] & 0xe0) === 0xe0); // MPEG frame sync

      if (!isMP3) {
        console.warn("Response doesn't appear to be valid MP3 data");
        // Try to decode as text to see if it's an error message
        try {
          const textDecoder = new TextDecoder();
          const contentAsText = textDecoder.decode(audioBuffer);
          console.error("Response as text:", contentAsText);

          // If it looks like an error message, return it instead
          if (contentAsText.includes("error") || contentAsText.includes("{")) {
            return cors(
              request,
              NextResponse.json(
                {
                  error: "ElevenLabs returned error disguised as audio",
                  details: contentAsText,
                },
                { status: 500 }
              )
            );
          }
        } catch (e) {
          console.error("Couldn't decode response as text:", e);
        }
      } else {
        console.log("Valid MP3 signature detected");
      }
    }

    // Return the audio with proper headers
    const headers = {
      "Content-Type": "audio/mpeg",
      "Content-Length": audioBuffer.byteLength.toString(),
    };
    console.log("Response headers:", headers);

    return cors(
      request,
      new NextResponse(audioBuffer, {
        headers,
      })
    );
  } catch (error) {
    console.error("TTS API error:", error);
    return cors(
      request,
      NextResponse.json(
        {
          error: "Error processing text-to-speech",
          details: error instanceof Error ? error.message : String(error),
        },
        { status: 500 }
      )
    );
  }
}

// Once the basic implementation works, you can gradually add back the other parameters:
/*
// FULL IMPLEMENTATION WITH ALL PARAMETERS AFTER TESTING BASIC VERSION WORKS
const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "xi-api-key": process.env.ELEVEN_LABS_API_KEY,
    "Accept": "audio/mpeg"
  },
  body: JSON.stringify({
    text,
    model_id: "eleven_monolingual_v1", // Try this first before multilingual
    voice_settings: {
      stability: 0.75,
      similarity_boost: 0.75,
      style_intensity: 0.5,
      use_speaker_boost: true
    },
    output_format: "mp3_44100"
  }),
});
*/
