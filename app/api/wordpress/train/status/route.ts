import { NextRequest, NextResponse } from "next/server";
import prisma from '../../../../../lib/prisma';
import { cors } from '../../../../../lib/cors';
export const dynamic = "force-dynamic";

interface Item {
  id: number;
  wpId: number | null;
  websiteId: string;
  trained: boolean | null;
  isTraining: boolean | null;
}

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function GET(request: NextRequest) {
  try {
    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const batchSize = parseInt(searchParams.get("limit") || "12", 10);
    const websiteId = searchParams.get("websiteId");

    if (!websiteId) {
      return cors(
        request,
        NextResponse.json(
          { error: "Missing required websiteId parameter" },
          { status: 400 }
        )
      );
    }

    // Find items that need training (not trained and not currently training)
    const pendingItems = {
      pages: await prisma.wordpressPage.findMany({
        where: {
          websiteId: websiteId,
          trained: false,
          isTraining: false,
        },
        select: {
          id: true,
          wpId: true,
          websiteId: true,
          trained: true,
          isTraining: true,
        },
        take: batchSize,
      }),
      posts: await prisma.wordpressPost.findMany({
        where: {
          websiteId: websiteId,
          trained: false,
          isTraining: false,
        },
        select: {
          id: true,
          wpId: true,
          websiteId: true,
          trained: true,
          isTraining: true,
        },
        take: batchSize,
      }),
      products: await prisma.wordpressProduct.findMany({
        where: {
          websiteId: websiteId,
          trained: false,
          isTraining: false,
        },
        select: {
          id: true,
          wpId: true,
          websiteId: true,
          trained: true,
          isTraining: true,
        },
        take: batchSize,
      }),
    };

    // Find items that are currently training
    const inProgressItems = {
      pages: await prisma.wordpressPage.findMany({
        where: {
          websiteId: websiteId,
          isTraining: true,
        },
        select: {
          id: true,
          wpId: true,
          websiteId: true,
          trained: true,
          isTraining: true,
        },
      }),
      posts: await prisma.wordpressPost.findMany({
        where: {
          websiteId: websiteId,
          isTraining: true,
        },
        select: {
          id: true,
          wpId: true,
          websiteId: true,
          trained: true,
          isTraining: true,
        },
      }),
      products: await prisma.wordpressProduct.findMany({
        where: {
          websiteId: websiteId,
          isTraining: true,
        },
        select: {
          id: true,
          wpId: true,
          websiteId: true,
          trained: true,
          isTraining: true,
        },
      }),
    };

    // Count total pending and in-progress items
    const pendingCount =
      pendingItems.pages.length +
      pendingItems.posts.length +
      pendingItems.products.length;

    const inProgressCount =
      inProgressItems.pages.length +
      inProgressItems.posts.length +
      inProgressItems.products.length;

    // Select a batch of items to process (prioritize pages, then posts, then products)
    const batch = [
      ...pendingItems.pages,
      ...pendingItems.posts,
      ...pendingItems.products,
    ].slice(0, batchSize);

    // Check if there are any pending items
    if (pendingCount === 0 && inProgressCount === 0) {
      // All items are trained
      return cors(
        request,
        NextResponse.json(
          {
            status: "complete",
            message: "All WordPress items are trained",
            pendingCount: 0,
            inProgressCount: 0,
            batch: [],
          },
          { status: 200 }
        )
      );
    } else if (pendingCount === 0 && inProgressCount > 0) {
      // Some items are still training
      return cors(
        request,
        NextResponse.json(
          {
            status: "in_progress",
            message: `${inProgressCount} WordPress items are currently training`,
            pendingCount: 0,
            inProgressCount: inProgressCount,
            batch: [],
          },
          { status: 202 }
        )
      );
    } else {
      // Return a batch of items to train
      return cors(
        request,
        NextResponse.json(
          {
            status: "pending",
            message: `${pendingCount} WordPress items need training`,
            pendingCount: pendingCount,
            inProgressCount: inProgressCount,
            batch: batch,
          },
          { status: 200 }
        )
      );
    }
  } catch (error) {
    console.error("Error checking WordPress training status:", error);
    return cors(
      request,
      NextResponse.json(
        { error: "Failed to check WordPress training status" },
        { status: 500 }
      )
    );
  }
}
