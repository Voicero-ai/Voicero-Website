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
    const action = searchParams.get("action") as
      | "click"
      | "scroll"
      | "purchase"
      | "redirect"
      | null;
    const sort =
      (searchParams.get("sort") as
        | "recent"
        | "oldest"
        | "longest"
        | "shortest") || "recent";
    const page = parseInt(searchParams.get("page") || "1");
    let limit = parseInt(searchParams.get("limit") || "10");
    const skip = (page - 1) * limit;

    const whereClause: {
      website: { userId: string; id?: string };
      messages?: {
        some: {
          content?: {
            contains: string;
          };
          role?: string;
          AND?: any[];
          OR?: any[];
        };
      };
    } = {
      website: {
        userId: session.user.id,
        ...(websiteId ? { id: websiteId } : {}),
      },
    };

    // Apply action filter
    if (action) {
      const actionQueries = {
        click: 'action":"click',
        scroll: 'action":"scroll',
        purchase: 'action":"purchase',
        redirect: ['action":"redirect', "pageUrl", "redirect_url", 'url":'],
      };

      const actionSearchTerms =
        action === "redirect"
          ? actionQueries.redirect
          : [actionQueries[action as keyof typeof actionQueries]];

      whereClause.messages = {
        some: {
          role: "assistant",
          OR: actionSearchTerms.map((term) => ({
            content: { contains: term },
          })),
        },
      };
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
            orderBy: {
              createdAt: "asc",
            },
            select: {
              content: true,
              type: true,
              role: true,
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
    const formattedThreads = threads.map((thread) => {
      const initialMessage = thread.messages.find((m) => m.role === "user");

      // Check for AI actions in assistant messages
      const hasClick = thread.messages.some(
        (m) => m.role === "assistant" && m.content.includes('"action":"click')
      );
      const hasScroll = thread.messages.some(
        (m) => m.role === "assistant" && m.content.includes('"action":"scroll')
      );
      const hasPurchase = thread.messages.some(
        (m) =>
          m.role === "assistant" && m.content.includes('"action":"purchase')
      );
      const hasRedirect = thread.messages.some(
        (m) =>
          m.role === "assistant" &&
          (m.content.includes('"action":"redirect') ||
            m.content.includes("pageUrl") ||
            m.content.includes("redirect_url") ||
            m.content.includes('url":'))
      );

      return {
        id: thread.id,
        type: initialMessage?.type || "text", // Use the type from the first user message
        startedAt: thread.createdAt.toISOString(),
        initialQuery: initialMessage?.content || "New Conversation",
        messageCount: thread._count.messages,
        website: {
          id: thread.website.id,
          domain: thread.website.url,
          name: thread.website.name,
        },
        hasAction:
          hasClick || hasScroll || hasPurchase || hasRedirect
            ? {
                click: hasClick,
                scroll: hasScroll,
                purchase: hasPurchase,
                redirect: hasRedirect,
              }
            : undefined,
      };
    });

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
