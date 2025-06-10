import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { cors } from "@/lib/cors";
export const dynamic = "force-dynamic";

interface Item {
  id: string;
  shopifyId: bigint | null;
  websiteId: string;
  isTraining: boolean | null;
}

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function GET(request: NextRequest) {
  try {
    // Get all untrained items and items currently being trained
    const items = {
      pages: await prisma.shopifyPage.findMany({
        where: {
          OR: [{ trained: false }, { isTraining: true }],
        },
        select: {
          id: true,
          shopifyId: true,
          websiteId: true,
          isTraining: true,
        },
      }),
      products: await prisma.shopifyProduct.findMany({
        where: {
          OR: [{ trained: false }, { isTraining: true }],
        },
        select: {
          id: true,
          shopifyId: true,
          websiteId: true,
          isTraining: true,
        },
      }),
      discounts: await prisma.shopifyDiscount.findMany({
        where: {
          OR: [{ trained: false }, { isTraining: true }],
        },
        select: {
          id: true,
          shopifyId: true,
          websiteId: true,
          isTraining: true,
        },
      }),
      collections: await prisma.shopifyCollection.findMany({
        where: {
          OR: [{ trained: false }, { isTraining: true }],
        },
        select: {
          id: true,
          shopifyId: true,
          websiteId: true,
          isTraining: true,
        },
      }),
      blogPosts: await prisma.shopifyBlogPost.findMany({
        where: {
          OR: [{ trained: false }, { isTraining: true }],
        },
        select: {
          id: true,
          shopifyId: true,
          websiteId: true,
          isTraining: true,
        },
      }),
    };

    // Transform the data to include vectorIds and convert BigInt to string
    const transformedItems = {
      pages: items.pages.map((item: Item) => ({
        id: item.id,
        vectorId: `page-${item.shopifyId?.toString() || ""}`,
        shopifyId: item.shopifyId?.toString() || "",
        websiteId: item.websiteId,
        isTraining: item.isTraining,
      })),
      products: items.products.map((item: Item) => ({
        id: item.id,
        vectorId: `product-${item.shopifyId?.toString() || ""}`,
        shopifyId: item.shopifyId?.toString() || "",
        websiteId: item.websiteId,
        isTraining: item.isTraining,
      })),
      discounts: items.discounts.map((item: Item) => ({
        id: item.id,
        vectorId: `discount-${item.shopifyId?.toString() || ""}`,
        shopifyId: item.shopifyId?.toString() || "",
        websiteId: item.websiteId,
        isTraining: item.isTraining,
      })),
      collections: items.collections.map((item: Item) => ({
        id: item.id,
        vectorId: `collection-${item.shopifyId?.toString() || ""}`,
        shopifyId: item.shopifyId?.toString() || "",
        websiteId: item.websiteId,
        isTraining: item.isTraining,
      })),
      blogPosts: items.blogPosts.map((item: Item) => ({
        id: item.id,
        vectorId: `post-${item.shopifyId?.toString() || ""}`,
        shopifyId: item.shopifyId?.toString() || "",
        websiteId: item.websiteId,
        isTraining: item.isTraining,
      })),
    };

    return cors(request, NextResponse.json(transformedItems));
  } catch (error) {
    console.error("Error checking training status:", error);
    return cors(
      request,
      NextResponse.json(
        { error: "Failed to check training status" },
        { status: 500 }
      )
    );
  }
}
