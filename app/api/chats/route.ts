import prisma from "../../../lib/prisma";
import { auth } from "../../../lib/auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const websiteId = searchParams.get("websiteId");
    const type = searchParams.get("type") as "voice" | "text" | null;
    const sort =
      (searchParams.get("sort") as
        | "recent"
        | "oldest"
        | "longest"
        | "shortest") || "recent";
    const timeRange = searchParams.get("timeRange") || "all";
    const page = parseInt(searchParams.get("page") || "1");
    let limit = parseInt(searchParams.get("limit") || "10");
    const skip = (page - 1) * limit;

    const whereClause: {
      website: { userId: string; id?: string };
      createdAt?: { gte: Date };
      messages?: {
        some: {
          type?: string;
        };
      };
    } = {
      website: {
        userId: session.user.id,
        ...(websiteId ? { id: websiteId } : {}),
      },
      ...(type
        ? {
            messages: {
              some: {
                type: type,
              },
            },
          }
        : {}),
    };

    // Apply time range filter
    if (timeRange === "today") {
      whereClause.createdAt = {
        gte: new Date(new Date().setHours(0, 0, 0, 0)),
      };
    } else if (timeRange === "week") {
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      whereClause.createdAt = { gte: lastWeek };
    } else if (timeRange === "month") {
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      whereClause.createdAt = { gte: lastMonth };
    } else if (timeRange === "last20") {
      // For last20, we'll handle this in the query by limiting to 20 most recent
      limit = 20;
    }

    // Determine sort order
    let orderBy: any = {};
    if (sort === "recent") {
      orderBy = { lastMessageAt: "desc" };
    } else if (sort === "oldest") {
      orderBy = { lastMessageAt: "asc" };
    } else if (sort === "longest") {
      orderBy = { messages: { _count: "desc" } };
    } else if (sort === "shortest") {
      orderBy = { messages: { _count: "asc" } };
    }

    const [threads, totalCount] = await Promise.all([
      prisma.aiThread.findMany({
        where: whereClause,
        include: {
          website: {
            select: {
              id: true,
              url: true,
              name: true,
            },
          },
          messages: {
            take: 1,
            orderBy: {
              createdAt: "asc",
            },
            where: {
              role: "user",
            },
            select: {
              content: true,
              type: true,
            },
          },
          _count: {
            select: { messages: true },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.aiThread.count({
        where: whereClause,
      }),
    ]);

    // Transform the data to match the frontend structure
    const formattedThreads = threads.map((thread) => ({
      id: thread.id,
      type: thread.messages[0]?.type || "text", // Use the type from the first message
      startedAt: thread.createdAt.toISOString(),
      initialQuery: thread.messages[0]?.content || "New Conversation",
      messageCount: thread._count.messages,
      website: {
        id: thread.website.id,
        domain: thread.website.url,
        name: thread.website.name,
      },
    }));

    return NextResponse.json({
      sessions: formattedThreads,
      totalCount,
      hasMore: skip + limit < totalCount,
    });
  } catch (error) {
    console.error("[CHATS_GET]", { error });
    return new NextResponse("Internal error", { status: 500 });
  }
}
