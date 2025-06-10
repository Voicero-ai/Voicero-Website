import prisma from "../../../lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import { NextResponse } from "next/server";
import { subDays, startOfDay, endOfDay, isSameDay } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

export const dynamic = "force-dynamic";

// Helper function to count redirects in a message
const countRedirectsInMessage = (message: {
  content: string;
  pageUrl?: string | null;
}) => {
  let redirectCount = 0;

  // Check pageUrl first
  if (message.pageUrl) {
    redirectCount++;
  }

  // Try to parse content as JSON
  try {
    let contentToProcess = message.content;
    if (contentToProcess.includes("```json")) {
      contentToProcess = contentToProcess.replace(/```json\n|\n```/g, "");
    }
    const contentObj = JSON.parse(contentToProcess);
    if (contentObj.url || contentObj.redirect_url) {
      redirectCount++;
    }
  } catch (e) {
    // If JSON parsing fails, try to find URLs in the content
    const urlRegex =
      /https?:\/\/[^\s)]+|(?:\/(?:pages|products|blogs|collections)\/[^\s)]+)/g;
    const urls = message.content.match(urlRegex);
    if (urls && urls.length > 0) {
      redirectCount += urls.length;
    }
  }

  return redirectCount;
};

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    console.log("Session:", session);

    if (!session?.user?.id) {
      console.log("No session or user ID found");
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Get the time range from the URL parameters
    const { searchParams } = new URL(request.url);
    const timeRange = searchParams.get("timeRange") || "7"; // Default to 7 days
    const days = parseInt(timeRange);

    // Generate dates for the selected range in UTC
    const dates = Array.from({ length: days })
      .map((_, i) => {
        const date = subDays(new Date(), i);
        const utcDate = toZonedTime(date, "UTC");
        return {
          start: startOfDay(utcDate),
          end: endOfDay(utcDate),
        };
      })
      .reverse();

    // Get user's websites with date-filtered threads
    const websites = await prisma.website.findMany({
      where: {
        userId: session.user.id,
      },
      select: {
        id: true,
        url: true,
        type: true,
        active: true,
        aiThreads: {
          select: {
            messages: {
              select: {
                content: true,
                type: true,
                role: true,
                createdAt: true,
              },
            },
          },
        },
        createdAt: true,
      },
    });

    // Calculate total stats
    const totalStats = websites.reduce(
      (acc, website) => {
        const allMessages = website.aiThreads.flatMap(
          (thread) => thread.messages
        );
        const totalChats = allMessages.filter(
          (m) => m.role === "assistant"
        ).length;
        const voiceChats = allMessages.filter((m) => m.type === "voice").length;

        const actionCounts = allMessages.reduce(
          (sum, message) => {
            if (message.content && message.role === "assistant") {
              try {
                const content = message.content.replace(/```json\n|\n```/g, "");
                const parsed = JSON.parse(content);
                if (parsed.action) {
                  switch (parsed.action) {
                    case "redirect":
                      sum.redirects++;
                      break;
                    case "scroll":
                      sum.scrolls++;
                      break;
                    case "purchase":
                      sum.purchases++;
                      break;
                    case "click":
                      sum.clicks++;
                      break;
                  }
                }
              } catch (e) {
                // If JSON parsing fails, try to find action in the content
                if (message.content.includes('"action":"redirect"'))
                  sum.redirects++;
                if (message.content.includes('"action":"scroll"'))
                  sum.scrolls++;
                if (message.content.includes('"action":"purchase"'))
                  sum.purchases++;
                if (message.content.includes('"action":"click"')) sum.clicks++;
              }
            }
            return sum;
          },
          { redirects: 0, scrolls: 0, purchases: 0, clicks: 0 }
        );

        return {
          totalChats: acc.totalChats + totalChats,
          totalMessages: acc.totalMessages + allMessages.length,
          voiceChats: acc.voiceChats + voiceChats,
          redirects: acc.redirects + actionCounts.redirects,
          scrolls: acc.scrolls + actionCounts.scrolls,
          purchases: acc.purchases + actionCounts.purchases,
          clicks: acc.clicks + actionCounts.clicks,
        };
      },
      {
        totalChats: 0,
        totalMessages: 0,
        voiceChats: 0,
        redirects: 0,
        scrolls: 0,
        purchases: 0,
        clicks: 0,
      }
    );

    // Format websites data
    const formattedWebsites = websites.map((site) => {
      const allMessages = site.aiThreads.flatMap((thread) => thread.messages);
      const monthlyChats = allMessages.filter(
        (m) => m.role === "assistant"
      ).length;

      const actionCounts = allMessages.reduce(
        (sum, message) => {
          if (message.content && message.role === "assistant") {
            try {
              const content = message.content.replace(/```json\n|\n```/g, "");
              const parsed = JSON.parse(content);
              if (parsed.action) {
                switch (parsed.action) {
                  case "redirect":
                    sum.redirects++;
                    break;
                  case "scroll":
                    sum.scrolls++;
                    break;
                  case "purchase":
                    sum.purchases++;
                    break;
                  case "click":
                    sum.clicks++;
                    break;
                }
              }
            } catch (e) {
              // If JSON parsing fails, try to find action in the content
              if (message.content.includes('"action":"redirect"'))
                sum.redirects++;
              if (message.content.includes('"action":"scroll"')) sum.scrolls++;
              if (message.content.includes('"action":"purchase"'))
                sum.purchases++;
              if (message.content.includes('"action":"click"')) sum.clicks++;
            }
          }
          return sum;
        },
        { redirects: 0, scrolls: 0, purchases: 0, clicks: 0 }
      );

      return {
        id: site.id,
        domain: site.url,
        platform: site.type.toLowerCase(),
        monthlyChats,
        aiRedirects: actionCounts.redirects,
        aiScrolls: actionCounts.scrolls,
        aiPurchases: actionCounts.purchases,
        aiClicks: actionCounts.clicks,
        status: site.active ? "active" : "inactive",
        createdAt: site.createdAt,
      };
    });

    // Generate chart data for each day
    const chartData = dates.map(({ start }) => {
      const dayMessages = websites.flatMap((site) =>
        site.aiThreads.flatMap((thread) =>
          thread.messages.filter((message) => {
            const messageDate = new Date(message.createdAt);
            return isSameDay(messageDate, start);
          })
        )
      );

      const actionCounts = dayMessages.reduce(
        (sum, message) => {
          if (message.content && message.role === "assistant") {
            try {
              const content = message.content.replace(/```json\n|\n```/g, "");
              const parsed = JSON.parse(content);
              if (parsed.action) {
                switch (parsed.action) {
                  case "redirect":
                    sum.redirects++;
                    break;
                  case "scroll":
                    sum.scrolls++;
                    break;
                  case "purchase":
                    sum.purchases++;
                    break;
                  case "click":
                    sum.clicks++;
                    break;
                }
              }
            } catch (e) {
              // If JSON parsing fails, try to find action in the content
              if (message.content.includes('"action":"redirect"'))
                sum.redirects++;
              if (message.content.includes('"action":"scroll"')) sum.scrolls++;
              if (message.content.includes('"action":"purchase"'))
                sum.purchases++;
              if (message.content.includes('"action":"click"')) sum.clicks++;
            }
          }
          return sum;
        },
        { redirects: 0, scrolls: 0, purchases: 0, clicks: 0 }
      );

      return {
        date: start.toISOString(),
        redirects: actionCounts.redirects,
        scrolls: actionCounts.scrolls,
        purchases: actionCounts.purchases,
        clicks: actionCounts.clicks,
        chats: dayMessages.filter((m) => m.role === "assistant").length,
      };
    });

    return NextResponse.json({
      stats: {
        totalChats: totalStats.totalChats,
        voiceChats: totalStats.voiceChats,
        aiRedirects: totalStats.redirects,
        aiScrolls: totalStats.scrolls,
        aiPurchases: totalStats.purchases,
        aiClicks: totalStats.clicks,
        activeSites: websites.filter((w) => w.active).length,
      },
      chartData,
      websites: formattedWebsites,
    });
  } catch (error) {
    console.error("Dashboard API Error:", error);
    if (error instanceof Error) {
      return new NextResponse(error.message, { status: 500 });
    }
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
