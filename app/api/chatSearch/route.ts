import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../lib/auth";
import { query } from "../../../lib/db";

export const dynamic = "force-dynamic";

// Define type for search result from database
interface SearchResultRaw {
  messageId: string;
  content: string;
  role: string;
  threadId: string;
  createdAt: Date;
  websiteDomain: string;
  websiteName: string | null;
  source_type?: string; // 'aithread', 'textconversation', or 'voiceconversation'
}

// Helper function to extract context around the match
function extractContextAroundMatch(
  text: string,
  query: string,
  contextLength: number = 100
): string {
  if (!text) return "";

  // Case insensitive search
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex === -1) return text.substring(0, Math.min(text.length, 200));

  const start = Math.max(0, matchIndex - contextLength);
  const end = Math.min(text.length, matchIndex + query.length + contextLength);

  let context = text.substring(start, end);

  // Add ellipsis if we trimmed the text
  if (start > 0) context = "..." + context;
  if (end < text.length) context = context + "...";

  return context;
}

export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const query_param = searchParams.get("q");

    // Validate search query
    if (!query_param || query_param.length < 7) {
      return NextResponse.json(
        { error: "Search query must be at least 7 characters" },
        { status: 400 }
      );
    }

    // Get user ID
    const userId = session.user.id;

    // Prepare the search query for AI messages
    const aiMessageQuery = `
      SELECT 
        m.id as messageId, 
        m.content COLLATE utf8mb4_unicode_ci as content, 
        m.role COLLATE utf8mb4_unicode_ci as role, 
        m.threadId,
        m.createdAt,
        w.url as websiteDomain,
        w.name as websiteName,
        'aithread' COLLATE utf8mb4_unicode_ci as source_type
      FROM AiMessage m
      JOIN AiThread t ON m.threadId = t.id
      JOIN Website w ON t.websiteId = w.id
      WHERE 
        w.userId = ?
        AND m.content LIKE ?
    `;

    // Query for TextChats
    const textChatQuery = `
      SELECT 
        tc.id as messageId, 
        tc.content COLLATE utf8mb4_unicode_ci as content, 
        CASE WHEN tc.messageType = 'user' THEN 'user' ELSE 'assistant' END COLLATE utf8mb4_unicode_ci as role,
        tc.textConversationId as threadId,
        tc.createdAt,
        w.url as websiteDomain,
        w.name as websiteName,
        'textconversation' COLLATE utf8mb4_unicode_ci as source_type
      FROM TextChats tc
      JOIN TextConversations t ON tc.textConversationId = t.id
      JOIN Session s ON t.sessionId COLLATE utf8mb4_unicode_ci = s.id COLLATE utf8mb4_unicode_ci
      JOIN Website w ON s.websiteId = w.id
      WHERE 
        w.userId = ?
        AND tc.content LIKE ?
    `;

    // Query for VoiceChats
    const voiceChatQuery = `
      SELECT 
        vc.id as messageId, 
        vc.content COLLATE utf8mb4_unicode_ci as content, 
        CASE WHEN vc.messageType = 'user' THEN 'user' ELSE 'assistant' END COLLATE utf8mb4_unicode_ci as role,
        vc.voiceConversationId as threadId,
        vc.createdAt,
        w.url as websiteDomain,
        w.name as websiteName,
        'voiceconversation' COLLATE utf8mb4_unicode_ci as source_type
      FROM VoiceChats vc
      JOIN VoiceConversations v ON vc.voiceConversationId = v.id
      JOIN Session s ON v.sessionId COLLATE utf8mb4_unicode_ci = s.id COLLATE utf8mb4_unicode_ci
      JOIN Website w ON s.websiteId = w.id
      WHERE 
        w.userId = ?
        AND vc.content LIKE ?
    `;

    // Let's use a different approach to avoid collation issues - separate queries
    // Instead of a complex UNION, we'll run the queries separately and combine results in memory

    // Run each query separately
    const aiResults = (await query(aiMessageQuery, [
      userId,
      `%${query_param}%`,
    ])) as SearchResultRaw[];

    const textResults = (await query(textChatQuery, [
      userId,
      `%${query_param}%`,
    ])) as SearchResultRaw[];

    const voiceResults = (await query(voiceChatQuery, [
      userId,
      `%${query_param}%`,
    ])) as SearchResultRaw[];

    // Combine results in JavaScript instead of using SQL UNION
    const results = [...aiResults, ...textResults, ...voiceResults]
      .sort((a, b) => {
        // Sort by createdAt DESC
        const dateA =
          a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        const dateB =
          b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, 50); // Apply the LIMIT 50 in memory

    // Results are already combined above

    // Add debugging for search results
    console.log(
      `Found ${results.length} search results across all conversation types`
    );

    // Count results by source type
    const counts = {
      aithread: results.filter((r) => r.source_type === "aithread").length,
      textconversation: results.filter(
        (r) => r.source_type === "textconversation"
      ).length,
      voiceconversation: results.filter(
        (r) => r.source_type === "voiceconversation"
      ).length,
    };
    console.log(
      `Results by type: AI threads: ${counts.aithread}, Text: ${counts.textconversation}, Voice: ${counts.voiceconversation}`
    );

    // Process results to include match context
    const formattedResults = results.map((result) => ({
      threadId: result.threadId,
      messageId: result.messageId,
      content: result.content,
      role: result.role,
      createdAt:
        result.createdAt instanceof Date
          ? result.createdAt.toISOString()
          : new Date(result.createdAt).toISOString(),
      websiteDomain: result.websiteDomain,
      websiteName: result.websiteName,
      source_type: result.source_type || "aithread", // Default to aithread for backward compatibility
      type: result.source_type === "voiceconversation" ? "voice" : "text", // Add type field for frontend
      matchContext: extractContextAroundMatch(result.content, query_param),
    }));

    return NextResponse.json({ results: formattedResults });
  } catch (error) {
    console.error("[CHAT_SEARCH_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to perform search" },
      { status: 500 }
    );
  }
}
