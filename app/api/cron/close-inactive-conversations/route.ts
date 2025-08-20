import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const now = new Date();
    console.log(
      "Executing hourly conversation closure cron job:",
      now.toISOString()
    );

    // Calculate the time 1 hour ago in UTC
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    console.log("One hour ago (UTC):", oneHourAgo.toISOString());

    // Find TextConversations that haven't had a message in over an hour and aren't already closed
    const inactiveConversations = (await query(
      `
      SELECT tc.id, tc.mostRecentConversationAt, tc.closed
      FROM TextConversations tc
      WHERE tc.closed = false
      AND tc.mostRecentConversationAt < ?
      `,
      [oneHourAgo]
    )) as { id: string; mostRecentConversationAt: Date; closed: boolean }[];

    console.log(
      `Found ${inactiveConversations.length} inactive conversations to close`
    );

    let closedCount = 0;

    // Close each inactive conversation
    for (const conversation of inactiveConversations) {
      try {
        await query("UPDATE TextConversations SET closed = true WHERE id = ?", [
          conversation.id,
        ]);

        closedCount++;
        console.log(
          `Closed conversation ${
            conversation.id
          } - last message: ${conversation.mostRecentConversationAt.toISOString()}`
        );
      } catch (error) {
        console.error(`Error closing conversation ${conversation.id}:`, error);
      }
    }

    console.log(`Successfully closed ${closedCount} inactive conversations`);

    return NextResponse.json({
      message: `Closed ${closedCount} inactive conversations`,
      totalProcessed: inactiveConversations.length,
      closedCount,
      oneHourAgo: oneHourAgo.toISOString(),
      currentTime: now.toISOString(),
    });
  } catch (error) {
    console.error("Error in close-inactive-conversations cron job:", error);
    return NextResponse.json(
      { error: "Failed to process conversation closure" },
      { status: 500 }
    );
  }
}
