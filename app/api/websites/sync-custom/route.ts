import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

interface PageData {
  url: string;
  title: string;
  content: string;
  htmlContent: string;
}

interface RequestBody {
  websiteId: string;
  pages: PageData[]; // Expect an array of PageData objects
}

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    const body: RequestBody = await req.json();

    if (
      !body.websiteId ||
      !Array.isArray(body.pages) ||
      body.pages.length === 0
    ) {
      return NextResponse.json(
        { error: "Invalid request. websiteId and pages array are required." },
        { status: 400 }
      );
    }

    // Verify the website exists and belongs to the user
    const website = await prisma.website.findUnique({
      where: {
        id: body.websiteId,
        user: {
          email: session.user.email,
        },
      },
    });

    if (!website) {
      return NextResponse.json(
        { error: "Website not found or does not belong to the user" },
        { status: 404 }
      );
    }

    // Verify the website is of type "Custom"
    if (website.type !== "Custom") {
      return NextResponse.json(
        { error: "This endpoint is only for Custom websites" },
        { status: 400 }
      );
    }

    // Delete existing custom pages for this website
    // Note: Uses the correct model name 'Page' based on schema.prisma
    await prisma.page.deleteMany({
      where: {
        websiteId: website.id,
      },
    });
    console.log(
      `[SYNC API] Deleted existing pages for website ID: ${website.id}`
    );

    // Process each page object and create records
    const creationPromises = body.pages.map((pageData) => {
      // Basic validation for each page object
      if (
        !pageData.url ||
        typeof pageData.title !== "string" ||
        typeof pageData.content !== "string" ||
        typeof pageData.htmlContent !== "string"
      ) {
        console.warn("[SYNC API] Skipping invalid page data:", pageData);
        return Promise.resolve({
          url: pageData.url,
          success: false,
          error: "Invalid page data structure",
        }); // Resolve to indicate skip
      }

      return prisma.page
        .create({
          data: {
            title: pageData.title || pageData.url, // Use URL as fallback title
            url: pageData.url,
            content: pageData.content,
            html: pageData.htmlContent,
            websiteId: website.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        })
        .then((createdPage: any) => {
          return { url: pageData.url, success: true };
        })
        .catch((error: any) => {
          console.error(
            `[SYNC API] Error creating page for URL ${pageData.url}:`,
            error
          );
          return {
            url: pageData.url,
            success: false,
            error: (error as Error).message,
          };
        });
    });

    const results = await Promise.allSettled(creationPromises);
    console.log(`[SYNC API] Finished processing ${results.length} pages.`);

    // Update the website's lastSyncedAt timestamp
    try {
      // await prisma.website.update({
      //   where: { id: website.id },
      //   data: { lastSyncedAt: new Date() },
      // });
      console.log(
        `[SYNC API] Updated lastSyncedAt for website ID: ${website.id}`
      );
    } catch (updateError) {
      console.error(
        `[SYNC API] Failed to update lastSyncedAt for website ID: ${website.id}:`,
        updateError
      );
      // Continue even if timestamp update fails, but log it
    }

    // Count successful syncs
    const successfulSyncs = results.filter(
      (result) => result.status === "fulfilled" && (result.value as any).success
    ).length;

    const responsePayload = {
      success: true,
      message: `Successfully synced ${successfulSyncs} of ${body.pages.length} pages for website ${website.name}`,
      results: results.map((result) =>
        result.status === "fulfilled"
          ? result.value
          : { success: false, error: (result.reason as Error).message }
      ),
    };

    console.log("[SYNC API] Sending response:", responsePayload);
    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error("[SYNC API ERROR] Error in sync-custom API:", error);
    return NextResponse.json(
      { error: "Internal server error", details: (error as Error).message },
      { status: 500 }
    );
  }
}
