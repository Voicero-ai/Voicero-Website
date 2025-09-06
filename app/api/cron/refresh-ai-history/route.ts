import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    console.log("Starting AI history refresh cron job...");

    // Call external API
    const handle = "/refresh-data/refresh-ai-history";
    try {
      await fetch(`https://train.voicero.ai/api${handle}`);
    } catch (fetchError) {
      console.log(`API call made for ${handle}, ignoring response`);
    }

    // Wait 15 seconds
    await new Promise((resolve) => setTimeout(resolve, 15000));

    console.log("AI history refresh cron job completed");

    return NextResponse.json({
      success: true,
      status: "completed",
    });
  } catch (error: any) {
    console.error("AI history cron job error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to refresh AI history",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
