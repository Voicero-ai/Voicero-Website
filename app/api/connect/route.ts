import { NextRequest, NextResponse } from "next/server";
import { cors } from '../../../lib/cors';
import { query } from '../../../lib/db';
import { verifyToken, getWebsiteIdFromToken } from '../../../lib/token-verifier';

export const dynamic = "force-dynamic";

// Define interfaces for database entities
interface Website {
  id: string;
  name: string;
  url: string;
  type: string;
  plan: string;
  active: boolean;
  monthlyQueries: number;
  queryLimit: number;
  renewsOn: Date | null;
  syncFrequency: string | null;
  lastSyncedAt: Date | null;
  customInstructions: string | null;
  color: string | null;
  allowAutoCancel: boolean;
  allowAutoReturn: boolean;
  allowAutoExchange: boolean;
  allowAutoClick: boolean;
  allowAutoScroll: boolean;
  allowAutoHighlight: boolean;
  allowAutoRedirect: boolean;
  allowAutoGetUserOrders: boolean;
  allowAutoUpdateUserInfo: boolean;
  allowAutoFillForm: boolean;
  allowAutoTrackOrder: boolean;
  allowAutoLogout: boolean;
  allowAutoLogin: boolean;
  allowAutoGenerateImage: boolean;
  removeHighlight: boolean;
  customWelcomeMessage: string | null;
  botName: string | null;
  iconBot: string | null;
  iconVoice: string | null;
  iconMessage: string | null;
  allowMultiAIReview: boolean;
  clickMessage: string | null;
}

interface PopUpQuestion {
  id: string;
  question: string;
  websiteId: string;
}

interface VectorDbConfig {
  id: string;
  websiteId: string;
  namespace: string;
}

interface ShopifyPage {
  id: string;
  shopifyId: string;
  handle: string;
}

interface ShopifyProduct {
  id: string;
  shopifyId: string;
  handle: string;
}

interface ShopifyBlogPost {
  id: string;
  shopifyId: string;
  handle: string;
}

interface ShopifyCollection {
  id: string;
  shopifyId: string | null;
  handle: string;
}

interface ShopifyDiscount {
  id: string;
  shopifyId: string;
  code: string;
}

interface ShopifyBlog {
  id: string;
  websiteId: string;
  title: string;
}

interface ContentCounts {
  pages: number;
  posts: number;
  products: number;
  discounts?: number;
  collections?: number;
}

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function GET(request: NextRequest) {
  try {
    const response = new NextResponse();

    // Try to get token from Authorization header first
    let websiteId = null;
    const authHeader = request.headers.get("authorization");
    console.log("Auth header received:", authHeader); // Debug log

    if (authHeader?.startsWith("Bearer ")) {
      // Verify the Bearer token
      const isTokenValid = await verifyToken(authHeader);
      
      if (isTokenValid) {
        // Get the website ID from the verified token
        websiteId = await getWebsiteIdFromToken(authHeader);
        console.log(
          "Website ID from token:",
          websiteId || "none"
        );
      }
    }

    // If no valid header, try to get from URL params
    if (!websiteId) {
      // Get the URL search params
      const url = new URL(request.url);
      const accessToken = url.searchParams.get("access_token");
      console.log(
        "Access token from URL params:",
        accessToken ? accessToken.substring(0, 10) + "..." : "none"
      );
      
      if (accessToken) {
        // For backward compatibility, try to find website by access token
        const websites = (await query(
          `SELECT w.* FROM Website w
           JOIN AccessKey ak ON w.id = ak.websiteId
           WHERE ak.\`key\` = ?`,
          [accessToken]
        )) as Website[];
        
        if (websites.length > 0) {
          websiteId = websites[0].id;
        }
      }
    }

    // If still no website ID, return 401
    if (!websiteId) {
      console.log("No valid token or access key found");
      return cors(
        request,
        NextResponse.json({ error: "No valid token or access key provided" }, { status: 401 })
      );
    }

    // Find the website using the website ID
    const websites = (await query(
      `SELECT w.* FROM Website w WHERE w.id = ?`,
      [websiteId]
    )) as Website[];

    console.log("Website found:", websites.length > 0 ? "yes" : "no"); // Debug log

    if (websites.length === 0) {
      return cors(
        request,
        NextResponse.json({ error: "Website not found" }, { status: 404 })
      );
    }

    const website = websites[0];

    // Get access keys
    const accessKeys = (await query(
      "SELECT * FROM AccessKey WHERE websiteId = ?",
      [website.id]
    )) as any[];

    // Get popup questions
    const popUpQuestions = (await query(
      "SELECT * FROM PopUpQuestion WHERE websiteId = ?",
      [website.id]
    )) as PopUpQuestion[];

    // Get vector DB config
    const vectorDbConfigs = (await query(
      "SELECT * FROM VectorDbConfig WHERE websiteId = ?",
      [website.id]
    )) as VectorDbConfig[];

    // Get Shopify blog
    const shopifyBlogs = (await query(
      "SELECT * FROM ShopifyBlog WHERE websiteId = ?",
      [website.id]
    )) as ShopifyBlog[];

    // Get content counts based on website type
    let contentCounts: ContentCounts;

    if (website.type === "WordPress") {
      const [pageCount, postCount, productCount] = await Promise.all([
        query(
          "SELECT COUNT(*) as count FROM WordpressPage WHERE websiteId = ?",
          [website.id]
        ),
        query(
          "SELECT COUNT(*) as count FROM WordpressPost WHERE websiteId = ?",
          [website.id]
        ),
        query(
          "SELECT COUNT(*) as count FROM WordpressProduct WHERE websiteId = ?",
          [website.id]
        ),
      ]);

      contentCounts = {
        pages: (pageCount as any[])[0]?.count || 0,
        posts: (postCount as any[])[0]?.count || 0,
        products: (productCount as any[])[0]?.count || 0,
      };
    } else {
      // Shopify counts
      const [
        pageCount,
        postCount,
        productCount,
        discountCount,
        collectionCount,
      ] = await Promise.all([
        query("SELECT COUNT(*) as count FROM ShopifyPage WHERE websiteId = ?", [
          website.id,
        ]),
        query(
          "SELECT COUNT(*) as count FROM ShopifyBlogPost WHERE websiteId = ?",
          [website.id]
        ),
        query(
          "SELECT COUNT(*) as count FROM ShopifyProduct WHERE websiteId = ?",
          [website.id]
        ),
        query(
          "SELECT COUNT(*) as count FROM ShopifyDiscount WHERE websiteId = ?",
          [website.id]
        ),
        query(
          "SELECT COUNT(*) as count FROM ShopifyCollection WHERE websiteId = ?",
          [website.id]
        ),
      ]);

      contentCounts = {
        pages: (pageCount as any[])[0]?.count || 0,
        posts: (postCount as any[])[0]?.count || 0,
        products: (productCount as any[])[0]?.count || 0,
        discounts: (discountCount as any[])[0]?.count || 0,
        collections: (collectionCount as any[])[0]?.count || 0,
      };
    }

    // For Shopify websites, get all content IDs
    let shopifyContent;
    if (website.type === "Shopify") {
      // Get all Shopify content
      const [
        shopifyPages,
        shopifyProducts,
        shopifyBlogPosts,
        shopifyCollections,
        shopifyDiscounts,
      ] = await Promise.all([
        query(
          "SELECT id, shopifyId, handle FROM ShopifyPage WHERE websiteId = ?",
          [website.id]
        ) as Promise<ShopifyPage[]>,
        query(
          "SELECT id, shopifyId, handle FROM ShopifyProduct WHERE websiteId = ?",
          [website.id]
        ) as Promise<ShopifyProduct[]>,
        query(
          "SELECT id, shopifyId, handle FROM ShopifyBlogPost WHERE websiteId = ?",
          [website.id]
        ) as Promise<ShopifyBlogPost[]>,
        query(
          "SELECT id, shopifyId, handle FROM ShopifyCollection WHERE websiteId = ?",
          [website.id]
        ) as Promise<ShopifyCollection[]>,
        query(
          "SELECT id, shopifyId, code FROM ShopifyDiscount WHERE websiteId = ?",
          [website.id]
        ) as Promise<ShopifyDiscount[]>,
      ]);

      shopifyContent = {
        pages: (shopifyPages as ShopifyPage[]).map((p) => ({
          id: p.id,
          shopifyId: p.shopifyId.toString(),
          handle: p.handle,
        })),
        products: (shopifyProducts as ShopifyProduct[]).map((p) => ({
          id: p.id,
          shopifyId: p.shopifyId.toString(),
          handle: p.handle,
        })),
        posts: (shopifyBlogPosts as ShopifyBlogPost[]).map((p) => ({
          id: p.id,
          shopifyId: p.shopifyId.toString(),
          handle: p.handle,
        })),
        collections: (shopifyCollections as ShopifyCollection[]).map((c) => ({
          id: c.id,
          shopifyId: c.shopifyId?.toString() || "",
          handle: c.handle,
        })),
        discounts: (shopifyDiscounts as ShopifyDiscount[]).map((d) => ({
          id: d.id,
          shopifyId: d.shopifyId.toString(),
          code: d.code,
        })),
      };
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
          popUpQuestions: popUpQuestions,
          VectorDbConfig:
            vectorDbConfigs.length > 0 ? vectorDbConfigs[0] : null,
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
          allowMultiAIReview: website.allowMultiAIReview,
          clickMessage: website.clickMessage,
          _count: contentCounts,
          // Include all content IDs for Shopify
          content: website.type === "Shopify" ? shopifyContent : undefined,
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
