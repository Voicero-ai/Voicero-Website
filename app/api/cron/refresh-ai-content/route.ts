import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  console.log("Starting AI content refresh cron job");

  try {
    // Call external API
    const handle = "/refresh-data/refresh-ai-content";
    try {
      await fetch(`https://train.voicero.ai/api${handle}`);
    } catch (fetchError) {
      console.log(`API call made for ${handle}, ignoring response`);
    }

    // Wait 15 seconds
    await new Promise((resolve) => setTimeout(resolve, 15000));

    console.log("AI content refresh cron job completed");

    return NextResponse.json({
      success: true,
      status: "completed",
    });
  } catch (error) {
    console.error("Error in AI content refresh cron job:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
