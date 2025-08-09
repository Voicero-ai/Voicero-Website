import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";

export const dynamic = "force-dynamic";

// Internal batch size for database efficiency
const BATCH_SIZE = 200;

interface Thread {
  id: string;
  websiteId: string;
  sessions_count?: number;
}

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
    const emptyThreadIds = (await query(`
      SELECT a.id 
      FROM AiThread a 
      WHERE NOT EXISTS (SELECT 1 FROM AiMessage m WHERE m.threadId = a.id)
    `)) as { id: string }[];

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
          const result = await query(
            "DELETE FROM _AiThreadToSession WHERE A = ?",
            [threadId]
          );

          const deleteCount = (result as any).affectedRows || 0;
          console.log(
            `Directly deleted ${deleteCount} session connections for thread ${threadId}`
          );
          totalConnectionsRemoved += deleteCount;

          // Now delete the thread itself
          const deleteResult = await query(
            "DELETE FROM AiThread WHERE id = ?",
            [threadId]
          );

          const threadDeleteCount = (deleteResult as any).affectedRows || 0;
          if (threadDeleteCount > 0) {
            console.log(`Successfully deleted thread ${threadId}`);
            totalDeleted += threadDeleteCount;
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
      const emptyThreadsBatch = (await query(
        `
        SELECT a.id, a.websiteId, 
          (SELECT COUNT(*) FROM _AiThreadToSession WHERE A = a.id) as sessions_count
        FROM AiThread a
        WHERE NOT EXISTS (SELECT 1 FROM AiMessage m WHERE m.threadId = a.id)
        ORDER BY a.createdAt ASC
        LIMIT ? OFFSET ?
      `,
        [BATCH_SIZE, emptyOffset]
      )) as Thread[];

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
        .filter((thread) => (thread.sessions_count || 0) > 0)
        .map((thread) => thread.id);

      if (threadIdsWithSessions.length > 0) {
        console.log(
          `Found ${threadIdsWithSessions.length} threads with sessions to disconnect`
        );

        // First, manually disconnect the sessions from threads
        for (const threadId of threadIdsWithSessions) {
          try {
            // Direct SQL to delete the connections
            const result = await query(
              "DELETE FROM _AiThreadToSession WHERE A = ?",
              [threadId]
            );

            const deleteCount = (result as any).affectedRows || 0;
            console.log(
              `Directly deleted ${deleteCount} session connections for thread ${threadId}`
            );
            totalConnectionsRemoved += deleteCount;
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

      if (threadIds.length > 0) {
        // Batch delete all threads in this batch using a parameterized query
        const placeholders = threadIds.map(() => "?").join(",");
        const deleteResult = await query(
          `DELETE FROM AiThread WHERE id IN (${placeholders})`,
          threadIds
        );

        const deleteCount = (deleteResult as any).affectedRows || 0;
        emptyDeletedCount += deleteCount;
        totalDeleted += deleteCount;
        console.log(`Deleted ${deleteCount} empty threads in batch`);
      }

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
      const assistantOnlyThreadsIds = (await query(
        `
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
        LIMIT ? OFFSET ?
      `,
        [BATCH_SIZE, assistantOffset]
      )) as { id: string; websiteId: string }[];

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
      const threadsWithSessions = (await query(
        `
        SELECT a.id, 
          (SELECT COUNT(*) FROM _AiThreadToSession WHERE A = a.id) as sessions_count
        FROM AiThread a
        WHERE a.id IN (${threadIds.map(() => "?").join(",")})
      `,
        threadIds
      )) as Thread[];

      // Get IDs of threads with sessions
      const threadIdsWithSessions = threadsWithSessions
        .filter((thread) => (thread.sessions_count || 0) > 0)
        .map((thread) => thread.id);

      if (threadIdsWithSessions.length > 0) {
        console.log(
          `Found ${threadIdsWithSessions.length} assistant-only threads with sessions to disconnect`
        );

        // Directly disconnect the sessions from threads
        for (const threadId of threadIdsWithSessions) {
          try {
            // Direct SQL to delete the connections
            const result = await query(
              "DELETE FROM _AiThreadToSession WHERE A = ?",
              [threadId]
            );

            const deleteCount = (result as any).affectedRows || 0;
            console.log(
              `Directly deleted ${deleteCount} session connections for thread ${threadId}`
            );
            totalConnectionsRemoved += deleteCount;
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

      if (threadIds.length > 0) {
        // Batch delete all message records for these threads
        const placeholders = threadIds.map(() => "?").join(",");
        await query(
          `DELETE FROM AiMessage WHERE threadId IN (${placeholders})`,
          threadIds
        );

        // Batch delete all threads in this batch
        const deleteResult = await query(
          `DELETE FROM AiThread WHERE id IN (${placeholders})`,
          threadIds
        );

        const deleteCount = (deleteResult as any).affectedRows || 0;
        assistantOnlyDeletedCount += deleteCount;
        totalDeleted += deleteCount;
        console.log(`Deleted ${deleteCount} assistant-only threads in batch`);
      }

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
      const orphanedConnections = (await query(
        `
        SELECT ts.A as threadId, ts.B as sessionId 
        FROM _AiThreadToSession ts 
        WHERE NOT EXISTS (SELECT 1 FROM AiThread t WHERE t.id = ts.A)
        LIMIT ?
      `,
        [BATCH_SIZE]
      )) as { threadId: string; sessionId: string }[];

      if (orphanedConnections.length === 0) {
        hasMoreOrphanedConnections = false;
        console.log("No more orphaned connections to process");
        continue;
      }

      // Extract thread IDs
      const threadIds = orphanedConnections.map((conn) => conn.threadId);

      // Batch delete orphaned connections
      if (threadIds.length > 0) {
        const placeholders = threadIds.map(() => "?").join(",");
        const result = await query(
          `DELETE FROM _AiThreadToSession WHERE A IN (${placeholders})`,
          threadIds
        );

        const deleteCount = (result as any).affectedRows || 0;
        orphanedConnectionsRemoved += deleteCount;
        orphanedBatchCount++;
        console.log(
          `Deleted ${deleteCount} orphaned session connections in batch ${orphanedBatchCount}`
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
  }
}
