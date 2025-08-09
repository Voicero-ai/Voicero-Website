import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";
export const dynamic = "force-dynamic";

interface Website {
  id: string;
  plan: string;
  renewsOn: Date;
}

export async function GET(request: Request) {
  try {
    const now = new Date();
    console.log("Executing monthly query reset cron job:", now.toISOString());

    // Find all websites that have reached their renewal date
    const websites = (await query(
      "SELECT id, plan, renewsOn FROM Website WHERE renewsOn <= ?",
      [now]
    )) as Website[];

    console.log(`Found ${websites.length} websites due for query reset`);

    // Process each website
    let resetCount = 0;
    for (const website of websites) {
      try {
        // Reset monthly queries and set next renewal date
        const nextRenewal = new Date(website.renewsOn);
        nextRenewal.setMonth(nextRenewal.getMonth() + 1); // Set next month

        // Set the appropriate query limit based on plan
        const queryLimit = website.plan === "Enterprise" ? 999999 : 1000;

        // For upgrades (free to pro), reset to 0
        // For renewals, reset to 0
        // For downgrades (pro to free), capped in the webhook handler

        await query(
          "UPDATE Website SET monthlyQueries = 0, renewsOn = ?, queryLimit = ? WHERE id = ?",
          [nextRenewal, queryLimit, website.id]
        );

        resetCount++;
        console.log(
          `Reset queries for website ${website.id} (${
            website.plan
          } plan), next renewal: ${nextRenewal.toISOString()}`
        );
      } catch (error) {
        console.error(`Error processing website ${website.id}:`, error);
      }
    }

    return NextResponse.json({
      message: `Reset monthly queries for ${resetCount} websites`,
      totalProcessed: websites.length,
    });
  } catch (error) {
    console.error("Error in reset-queries cron job:", error);
    return NextResponse.json(
      { error: "Failed to process query resets" },
      { status: 500 }
    );
  }
}
