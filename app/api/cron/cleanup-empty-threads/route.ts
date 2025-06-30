import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";

export const dynamic = "force-dynamic";

// Constants for batch processing
const BATCH_SIZE = 20;
const MAX_TOTAL_PROCESSED = 200; // Safety limit to prevent long-running jobs

export async function GET(request: Request) {
  try {
    const now = new Date();
    console.log(
      "Executing daily empty thread cleanup cron job:",
      now.toISOString()
    );

    let totalDeleted = 0;
    let totalProcessed = 0;

    // PART 1: Process empty threads in batches
    console.log("Processing empty threads in batches...");

    let hasMoreEmptyThreads = true;
    let emptyDeletedCount = 0;

    while (hasMoreEmptyThreads && totalProcessed < MAX_TOTAL_PROCESSED) {
      // Get a batch of empty threads
      const emptyThreadsBatch = await prisma.aiThread.findMany({
        where: {
          messages: {
            none: {}, // This checks for threads with no related messages
          },
        },
        include: {
          _count: {
            select: {
              messages: true,
              sessions: true,
            },
          },
        },
        take: BATCH_SIZE,
      });

      if (emptyThreadsBatch.length === 0) {
        hasMoreEmptyThreads = false;
        continue;
      }

      console.log(
        `Processing batch of ${emptyThreadsBatch.length} empty threads`
      );

      // Process each empty thread in the batch
      for (const thread of emptyThreadsBatch) {
        try {
          totalProcessed++;

          // Check if the thread was just created (within last hour) - maybe give some grace period
          const threadAge = now.getTime() - thread.createdAt.getTime();
          const oneHourInMs = 60 * 60 * 1000;

          if (threadAge < oneHourInMs) {
            console.log(
              `Skipping recently created thread ${thread.id} (age: ${
                threadAge / 1000 / 60
              } minutes)`
            );
            continue;
          }

          // Log info about connected sessions
          if (thread._count.sessions > 0) {
            console.log(
              `Thread ${thread.id} has ${thread._count.sessions} sessions but 0 messages`
            );
          }

          // Delete the thread
          await prisma.aiThread.delete({
            where: { id: thread.id },
          });

          emptyDeletedCount++;
          totalDeleted++;
          console.log(
            `Deleted empty thread ${thread.id} (websiteId: ${thread.websiteId})`
          );
        } catch (error) {
          console.error(`Error processing thread ${thread.id}:`, error);
        }
      }
    }

    console.log(`Deleted ${emptyDeletedCount} completely empty threads`);

    // PART 2: Process threads with only assistant messages in batches
    console.log("Processing assistant-only threads in batches...");

    let skip = 0;
    let hasMoreThreads = true;
    let assistantOnlyDeletedCount = 0;

    while (hasMoreThreads && totalProcessed < MAX_TOTAL_PROCESSED) {
      // Get a batch of threads
      const threadsBatch = await prisma.aiThread.findMany({
        where: {
          messages: {
            some: {}, // Has at least one message
          },
        },
        include: {
          messages: true,
          _count: {
            select: {
              sessions: true,
            },
          },
        },
        take: BATCH_SIZE,
        skip: skip,
      });

      if (threadsBatch.length === 0) {
        hasMoreThreads = false;
        continue;
      }

      console.log(
        `Processing batch of ${threadsBatch.length} threads with messages (offset: ${skip})`
      );
      skip += threadsBatch.length;

      // Process each thread in the batch
      for (const thread of threadsBatch) {
        try {
          totalProcessed++;

          // Skip threads with no messages (already handled in Part 1)
          if (thread.messages.length === 0) {
            continue;
          }

          // Check if there are any user messages
          const hasUserMessages = thread.messages.some(
            (msg) => msg.role === "user"
          );

          // If there are no user messages, delete the thread
          if (!hasUserMessages) {
            // Check if the thread was just created (within last hour)
            const threadAge = now.getTime() - thread.createdAt.getTime();
            const oneHourInMs = 60 * 60 * 1000;

            if (threadAge < oneHourInMs) {
              console.log(
                `Skipping recently created assistant-only thread ${
                  thread.id
                } (age: ${threadAge / 1000 / 60} minutes)`
              );
              continue;
            }

            console.log(
              `Thread ${thread.id} has ${thread.messages.length} messages, all from assistant`
            );

            // Log info about connected sessions
            if (thread._count.sessions > 0) {
              console.log(
                `Thread ${thread.id} has ${thread._count.sessions} sessions but only assistant messages`
              );
            }

            // Delete the thread
            await prisma.aiThread.delete({
              where: { id: thread.id },
            });

            assistantOnlyDeletedCount++;
            totalDeleted++;
            console.log(
              `Deleted assistant-only thread ${thread.id} (websiteId: ${thread.websiteId})`
            );
          }
        } catch (error) {
          console.error(`Error processing thread ${thread.id}:`, error);
        }
      }
    }

    console.log(
      `Deleted ${assistantOnlyDeletedCount} threads with only assistant messages`
    );

    const hitLimit = totalProcessed >= MAX_TOTAL_PROCESSED;

    return NextResponse.json({
      message: `Cleanup complete - deleted ${totalDeleted} threads${
        hitLimit ? " (hit processing limit)" : ""
      }`,
      emptyThreadsDeleted: emptyDeletedCount,
      assistantOnlyThreadsDeleted: assistantOnlyDeletedCount,
      totalDeleted,
      totalProcessed,
      hitProcessingLimit: hitLimit,
    });
  } catch (error) {
    console.error("Error in cleanup-empty-threads cron job:", error);
    return NextResponse.json(
      { error: "Failed to process empty thread cleanup" },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
