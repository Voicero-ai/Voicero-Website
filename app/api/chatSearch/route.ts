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

    // Prepare the search using direct SQL
    const results = (await query(
      `
      SELECT 
        m.id as messageId, 
        m.content, 
        m.role, 
        m.threadId,
        m.createdAt,
        w.url as websiteDomain,
        w.name as websiteName
      FROM AiMessage m
      JOIN AiThread t ON m.threadId = t.id
      JOIN Website w ON t.websiteId = w.id
      WHERE 
        w.userId = ?
        AND m.content LIKE ?
      ORDER BY m.createdAt DESC
      LIMIT 50
    `,
      [userId, `%${query_param}%`]
    )) as SearchResultRaw[];

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
