import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cors } from "../../../lib/cors";
export const dynamic = "force-dynamic";
const prisma = new PrismaClient();

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function GET(request: NextRequest) {
  try {
    const response = new NextResponse();

    // Try to get token from Authorization header first
    let accessKey = null;
    const authHeader = request.headers.get("authorization");
    console.log("Auth header received:", authHeader); // Debug log

    if (authHeader?.startsWith("Bearer ")) {
      // Extract the access key from the header
      accessKey = authHeader.split(" ")[1];
      console.log(
        "Access key from header:",
        accessKey?.substring(0, 10) + "..."
      );
    }

    // If no valid header, try to get from URL params
    if (!accessKey) {
      // Get the URL search params
      const url = new URL(request.url);
      accessKey = url.searchParams.get("access_token");
      console.log(
        "Access key from URL params:",
        accessKey ? accessKey.substring(0, 10) + "..." : "none"
      );
    }

    // If still no access key, return 401
    if (!accessKey) {
      console.log("No access key found in header or URL params");
      return cors(
        request,
        NextResponse.json({ error: "No access key provided" }, { status: 401 })
      );
    }

    // Find the website associated with this access key
    const website = await prisma.website.findFirst({
      where: {
        accessKeys: {
          some: {
            key: accessKey,
          },
        },
      },
      include: {
        _count: {
          select: {
            pages: true,
            posts: true,
            products: true,
            shopifyPages: true,
            shopifyProducts: true,
            shopifyBlog: true,
            ShopifyDiscount: true,
            ShopifyCollection: true,
            ShopifyBlogPost: true,
          },
        },
        accessKeys: true,
        popUpQuestions: true,
        VectorDbConfig: true,
        shopifyBlog: true,
        // Include all content types with their IDs
        shopifyPages: {
          select: {
            id: true,
            shopifyId: true,
            handle: true,
          },
        },
        shopifyProducts: {
          select: {
            id: true,
            shopifyId: true,
            handle: true,
          },
        },
        ShopifyBlogPost: {
          select: {
            id: true,
            shopifyId: true,
            handle: true,
          },
        },
        ShopifyCollection: {
          select: {
            id: true,
            shopifyId: true,
            handle: true,
          },
        },
        ShopifyDiscount: {
          select: {
            id: true,
            shopifyId: true,
            code: true,
          },
        },
      },
    });

    console.log("Website found:", website ? "yes" : "no"); // Debug log

    if (!website) {
      return cors(
        request,
        NextResponse.json({ error: "Invalid access key" }, { status: 401 })
      );
    }

    // Return the website data with type-specific counts and IDs
    return cors(
      request,
      NextResponse.json({
        website: {
          id: website.id,
          name: website.name,
          url: website.url,
          type: website.type,
          plan: website.plan,
          active: website.active,
          monthlyQueries: website.monthlyQueries,
          queryLimit: website.queryLimit,
          renewsOn: website.renewsOn,
          syncFrequency: website.syncFrequency,
          lastSyncedAt: website.lastSyncedAt,
          customInstructions: website.customInstructions,
          popUpQuestions: website.popUpQuestions,
          VectorDbConfig: website.VectorDbConfig,
          color: website.color,
          allowAutoCancel: website.allowAutoCancel,
          allowAutoReturn: website.allowAutoReturn,
          allowAutoExchange: website.allowAutoExchange,
          allowAutoClick: website.allowAutoClick,
          allowAutoScroll: website.allowAutoScroll,
          allowAutoHighlight: website.allowAutoHighlight,
          allowAutoRedirect: website.allowAutoRedirect,
          allowAutoGetUserOrders: website.allowAutoGetUserOrders,
          allowAutoUpdateUserInfo: website.allowAutoUpdateUserInfo,
          allowAutoFillForm: website.allowAutoFillForm,
          allowAutoTrackOrder: website.allowAutoTrackOrder,
          allowAutoLogout: website.allowAutoLogout,
          allowAutoLogin: website.allowAutoLogin,
          allowAutoGenerateImage: website.allowAutoGenerateImage,
          removeHighlight: website.removeHighlight,
          customWelcomeMessage: website.customWelcomeMessage,
          botName: website.botName,
          iconBot: website.iconBot,
          iconVoice: website.iconVoice,
          iconMessage: website.iconMessage,
          _count:
            website.type === "WordPress"
              ? {
                  pages: website._count.pages,
                  posts: website._count.posts,
                  products: website._count.products,
                }
              : {
                  pages: website._count.shopifyPages,
                  posts: website._count.ShopifyBlogPost,
                  products: website._count.shopifyProducts,
                  discounts: website._count.ShopifyDiscount,
                  collections: website._count.ShopifyCollection,
                },
          // Include all content IDs for Shopify
          content:
            website.type === "Shopify"
              ? {
                  pages: website.shopifyPages.map((p) => ({
                    id: p.id,
                    shopifyId: p.shopifyId.toString(),
                    handle: p.handle,
                  })),
                  products: website.shopifyProducts.map((p) => ({
                    id: p.id,
                    shopifyId: p.shopifyId.toString(),
                    handle: p.handle,
                  })),
                  posts: website.ShopifyBlogPost.map((p) => ({
                    id: p.id,
                    shopifyId: p.shopifyId.toString(),
                    handle: p.handle,
                  })),
                  collections: website.ShopifyCollection.map((c) => ({
                    id: c.id,
                    shopifyId: c.shopifyId?.toString() || "",
                    handle: c.handle,
                  })),
                  discounts: website.ShopifyDiscount.map((d) => ({
                    id: d.id,
                    shopifyId: d.shopifyId.toString(),
                    code: d.code,
                  })),
                }
              : undefined,
        },
      })
    );
  } catch (error) {
    console.error("API Error:", error);
    return cors(
      request,
      NextResponse.json({ error: "Internal server error" }, { status: 500 })
    );
  }
}
