import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const now = new Date();
    console.log("Executing hourly thread refresh cron job:", now.toISOString());

    // One hour ago
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Find all threads that have at least one message
    const threads = await prisma.aiThread.findMany({
      where: {
        messages: {
          some: {}, // Ensure there is at least one message
        },
      },
      include: {
        messages: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1, // Get only most recent message
        },
        website: true,
        sessions: true, // Include sessions connected to this thread
      },
    });

    console.log(`Found ${threads.length} threads with messages`);

    // Filter threads where the last message was more than an hour ago
    const outdatedThreads = threads.filter(
      (thread) =>
        thread.messages.length > 0 && thread.messages[0].createdAt < oneHourAgo
    );

    console.log(`Found ${outdatedThreads.length} threads to refresh`);

    // Process each thread that needs a refresh
    let createdCount = 0;
    for (const thread of outdatedThreads) {
      try {
        // Create a new thread for the same website
        const newThread = await prisma.aiThread.create({
          data: {
            threadId: `${thread.threadId.split("-")[0]}-${Date.now()}`, // Create a new unique threadId
            websiteId: thread.websiteId,
            title: `Continued from ${thread.title || "previous chat"}`,
            lastMessageAt: now,
            // Connect the same sessions from the old thread to the new one
            sessions: {
              connect: thread.sessions.map((session) => ({ id: session.id })),
            },
          },
        });

        createdCount++;
        console.log(
          `Created new thread ${newThread.id} for website ${thread.websiteId} to replace old thread ${thread.id} with ${thread.sessions.length} sessions connected`
        );
      } catch (error) {
        console.error(`Error processing thread ${thread.id}:`, error);
      }
    }

    return NextResponse.json({
      message: `Created ${createdCount} new threads to replace outdated ones`,
      totalProcessed: outdatedThreads.length,
    });
  } catch (error) {
    console.error("Error in refresh-threads cron job:", error);
    return NextResponse.json(
      { error: "Failed to refresh threads" },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
