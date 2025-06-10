import { NextRequest, NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";
import { auth } from "../../../../lib/auth";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const threadId = searchParams.get("sessionId");

    if (!threadId) {
      return new NextResponse("Thread ID is required", { status: 400 });
    }

    const thread = await prisma.aiThread.findUnique({
      where: {
        id: threadId,
        website: {
          userId: session.user.id,
        },
      },
      include: {
        website: {
          select: {
            id: true,
            url: true,
          },
        },
        messages: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!thread) {
      return new NextResponse("Thread not found", { status: 404 });
    }

    const formattedSession = {
      id: thread.id,
      type: "text",
      website: {
        id: thread.website.id,
        domain: thread.website.url,
      },
      startedAt: thread.createdAt.toISOString(),
      messages: thread.messages.map((msg) => {
        let content = msg.content;
        let metadata = {
          scrollToText: undefined as string | undefined,
          jsonResponse: undefined as any,
          url: undefined as string | undefined,
        };

        // Handle JSON responses
        try {
          if (typeof content === "string") {
            // Remove JSON code block markers if present
            let jsonContent = content;
            if (content.includes("```json")) {
              jsonContent = content.replace(/```json\n|\n```/g, "");
            }

            const parsed = JSON.parse(jsonContent);
            metadata.jsonResponse = parsed;

            if (parsed.answer) {
              content = parsed.answer;
            }

            // Handle different action types
            if (parsed.action) {
              switch (parsed.action) {
                case "scroll":
                  metadata.scrollToText = parsed.scroll_to_text;
                  break;
                case "redirect":
                case "buy":
                case "update":
                case "remove":
                  metadata.url = parsed.url;
                  break;
              }
            }
          }
        } catch (e) {
          // If parsing fails, use the content as-is (plain text)
          console.log("Message is plain text:", content);
          // Clear metadata for non-JSON responses
          metadata = {
            scrollToText: undefined,
            jsonResponse: undefined,
            url: undefined,
          };
        }

        return {
          id: msg.id,
          type: msg.role as "user" | "ai",
          content: content,
          timestamp: msg.createdAt.toISOString(),
          metadata: Object.values(metadata).some((v) => v !== undefined)
            ? metadata
            : undefined,
        };
      }),
    };

    return NextResponse.json(formattedSession);
  } catch (error) {
    console.error("[CHAT_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
