import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";

export const dynamic = "force-dynamic";

// Internal batch size for database efficiency
const BATCH_SIZE = 200;

export async function GET(request: Request) {
  try {
    const now = new Date();
    console.log(
      "Executing daily empty thread cleanup cron job:",
      now.toISOString()
    );

    let totalDeleted = 0;
    let totalConnectionsRemoved = 0;
    let orphanedConnectionsRemoved = 0;

    // PART 0: First, directly delete problematic thread-session connections
    console.log("Checking for problematic threads...");

    // Get IDs of empty threads
    const emptyThreadIds = await prisma.$queryRaw`
      SELECT a.id 
      FROM AiThread a 
      WHERE NOT EXISTS (SELECT 1 FROM AiMessage m WHERE m.threadId = a.id)
    `;

    if (Array.isArray(emptyThreadIds) && emptyThreadIds.length > 0) {
      console.log(
        `Found ${emptyThreadIds.length} empty threads to process directly`
      );

      // For each empty thread, directly delete its session connections
      for (const thread of emptyThreadIds) {
        const threadId = thread.id;
        console.log(`Directly processing thread: ${threadId}`);

        // Direct SQL to delete the connections
        try {
          const result = await prisma.$executeRaw`
            DELETE FROM _AiThreadToSession WHERE A = ${threadId}
          `;
          console.log(
            `Directly deleted ${result} session connections for thread ${threadId}`
          );
          totalConnectionsRemoved += result;

          // Now delete the thread itself
          const deleteResult = await prisma.aiThread.deleteMany({
            where: {
              id: threadId,
            },
          });

          if (deleteResult.count > 0) {
            console.log(`Successfully deleted thread ${threadId}`);
            totalDeleted += deleteResult.count;
          } else {
            console.log(`Failed to delete thread ${threadId}`);
          }
        } catch (error) {
          console.error(`Error processing thread ${threadId}:`, error);
        }
      }
    }

    // PART 1: Process empty threads in batches
    console.log("Processing ALL empty threads...");

    let emptyDeletedCount = 0;
    let hasMoreEmptyThreads = true;
    let emptyOffset = 0;

    // Process all empty threads without an artificial limit
    while (hasMoreEmptyThreads) {
      // Get a batch of empty threads
      const emptyThreadsBatch = await prisma.aiThread.findMany({
        where: {
          messages: {
            none: {}, // This checks for threads with no related messages
          },
          // Remove the time filter to get all empty threads regardless of age
        },
        select: {
          id: true,
          websiteId: true,
          _count: {
            select: {
              sessions: true,
            },
          },
        },
        take: BATCH_SIZE,
        skip: emptyOffset,
        orderBy: {
          createdAt: "asc",
        },
      });

      if (emptyThreadsBatch.length === 0) {
        hasMoreEmptyThreads = false;
        console.log("No more empty threads to process");
        continue;
      }

      console.log(
        `Processing batch of ${emptyThreadsBatch.length} empty threads (offset: ${emptyOffset})`
      );

      // Get thread IDs with sessions
      const threadIdsWithSessions = emptyThreadsBatch
        .filter((thread) => thread._count.sessions > 0)
        .map((thread) => thread.id);

      if (threadIdsWithSessions.length > 0) {
        console.log(
          `Found ${threadIdsWithSessions.length} threads with sessions to disconnect`
        );

        // First, manually disconnect the sessions from threads
        for (const threadId of threadIdsWithSessions) {
          try {
            // Direct SQL to delete the connections
            const result = await prisma.$executeRaw`
              DELETE FROM _AiThreadToSession WHERE A = ${threadId}
            `;
            console.log(
              `Directly deleted ${result} session connections for thread ${threadId}`
            );
            totalConnectionsRemoved += result;
          } catch (error) {
            console.error(
              `Error disconnecting sessions for thread ${threadId}:`,
              error
            );
          }
        }

        console.log(
          `Manually removed ${totalConnectionsRemoved} session connections`
        );
      }

      // Get all thread IDs in this batch
      const threadIds = emptyThreadsBatch.map((thread) => thread.id);

      // Batch delete all threads in this batch
      const deleteResult = await prisma.aiThread.deleteMany({
        where: {
          id: {
            in: threadIds,
          },
        },
      });

      emptyDeletedCount += deleteResult.count;
      totalDeleted += deleteResult.count;
      console.log(`Deleted ${deleteResult.count} empty threads in batch`);

      // Update offset for next iteration
      emptyOffset += emptyThreadsBatch.length;
    }

    console.log(`Deleted ${emptyDeletedCount} completely empty threads`);

    // PART 2: Process threads with only assistant messages in batches
    console.log("Processing ALL assistant-only threads...");

    let assistantOnlyDeletedCount = 0;
    let assistantOffset = 0;
    let hasMoreThreads = true;

    // Process all assistant-only threads without an artificial limit
    while (hasMoreThreads) {
      // Get threads with messages, excluding threads with user messages
      const assistantOnlyThreadsIds = (await prisma.$queryRaw`
        SELECT a.id, a.websiteId 
        FROM AiThread a
        WHERE EXISTS (
          SELECT 1 FROM AiMessage m 
          WHERE m.threadId = a.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM AiMessage m 
          WHERE m.threadId = a.id AND m.role = 'user'
        )
        ORDER BY a.createdAt ASC
        LIMIT ${BATCH_SIZE}
        OFFSET ${assistantOffset}
      `) as { id: string; websiteId: string }[];

      if (assistantOnlyThreadsIds.length === 0) {
        hasMoreThreads = false;
        console.log("No more assistant-only threads to process");
        continue;
      }

      console.log(
        `Processing batch of ${assistantOnlyThreadsIds.length} assistant-only threads (offset: ${assistantOffset})`
      );

      // Extract the thread IDs
      const threadIds = assistantOnlyThreadsIds.map((thread) => thread.id);

      // Get threads with sessions
      const threadsWithSessions = await prisma.aiThread.findMany({
        where: {
          id: {
            in: threadIds,
          },
        },
        include: {
          _count: {
            select: {
              sessions: true,
            },
          },
        },
      });

      // Get IDs of threads with sessions
      const threadIdsWithSessions = threadsWithSessions
        .filter((thread) => thread._count.sessions > 0)
        .map((thread) => thread.id);

      if (threadIdsWithSessions.length > 0) {
        console.log(
          `Found ${threadIdsWithSessions.length} assistant-only threads with sessions to disconnect`
        );

        // Directly disconnect the sessions from threads
        for (const threadId of threadIdsWithSessions) {
          try {
            // Direct SQL to delete the connections
            const result = await prisma.$executeRaw`
              DELETE FROM _AiThreadToSession WHERE A = ${threadId}
            `;
            console.log(
              `Directly deleted ${result} session connections for thread ${threadId}`
            );
            totalConnectionsRemoved += result;
          } catch (error) {
            console.error(
              `Error disconnecting sessions for thread ${threadId}:`,
              error
            );
          }
        }

        console.log(
          `Manually removed ${totalConnectionsRemoved} session connections for assistant-only threads`
        );
      }

      // Batch delete all message records for these threads
      await prisma.aiMessage.deleteMany({
        where: {
          threadId: {
            in: threadIds,
          },
        },
      });

      // Batch delete all threads in this batch
      const deleteResult = await prisma.aiThread.deleteMany({
        where: {
          id: {
            in: threadIds,
          },
        },
      });

      assistantOnlyDeletedCount += deleteResult.count;
      totalDeleted += deleteResult.count;
      console.log(
        `Deleted ${deleteResult.count} assistant-only threads in batch`
      );

      // Update offset for next iteration
      assistantOffset += assistantOnlyThreadsIds.length;
    }

    console.log(
      `Deleted ${assistantOnlyDeletedCount} threads with only assistant messages`
    );

    // PART 3: Clean up orphaned AiThreadToSession entries
    console.log("Cleaning up orphaned AiThreadToSession entries...");

    let hasMoreOrphanedConnections = true;
    let orphanedBatchCount = 0;

    while (hasMoreOrphanedConnections) {
      // Get a batch of orphaned thread-to-session connections
      const orphanedConnections = (await prisma.$queryRaw`
        SELECT ts.A as threadId, ts.B as sessionId 
        FROM _AiThreadToSession ts 
        WHERE NOT EXISTS (SELECT 1 FROM AiThread t WHERE t.id = ts.A)
        LIMIT ${BATCH_SIZE}
      `) as { threadId: string; sessionId: string }[];

      if (orphanedConnections.length === 0) {
        hasMoreOrphanedConnections = false;
        console.log("No more orphaned connections to process");
        continue;
      }

      // Extract thread IDs
      const threadIds = orphanedConnections.map((conn) => conn.threadId);

      // Batch delete orphaned connections
      if (threadIds.length > 0) {
        const result = await prisma.$executeRawUnsafe(
          `DELETE FROM _AiThreadToSession WHERE A IN (${threadIds
            .map(() => "?")
            .join(",")})`,
          ...threadIds
        );

        orphanedConnectionsRemoved += result;
        orphanedBatchCount++;
        console.log(
          `Deleted ${result} orphaned session connections in batch ${orphanedBatchCount}`
        );
      }
    }

    console.log(
      `Deleted ${orphanedConnectionsRemoved} total orphaned thread-to-session connections`
    );

    return NextResponse.json({
      message: `Cleanup complete - deleted ${totalDeleted} threads total and ${orphanedConnectionsRemoved} orphaned connections`,
      emptyThreadsDeleted: emptyDeletedCount,
      assistantOnlyThreadsDeleted: assistantOnlyDeletedCount,
      totalConnectionsRemoved,
      orphanedConnectionsRemoved,
      totalDeleted,
      emptyThreadsProcessed: emptyOffset,
      assistantThreadsProcessed: assistantOffset,
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
