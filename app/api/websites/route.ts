import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../lib/auth";
import { query } from "../../../lib/db";
export const dynamic = "force-dynamic";

interface WebsiteWithCounts {
  id: string;
  url: string;
  name: string | null;
  type: string;
  plan: string;
  active: boolean;
  renewsOn: Date | null;
  stripeId: string | null;
  monthlyQueries: number;
  syncFrequency: string;
  lastSyncedAt: Date | null;
  createdAt: Date;
  _count: {
    [key: string]: number;
  };
}

interface TransformedWebsite extends Omit<WebsiteWithCounts, "_count"> {
  queryLimit: number;
  content: {
    products: number;
    blogPosts: number;
    pages: number;
  };
  status: "active" | "inactive";
}

interface CountResult {
  count: number;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all websites for the user
    const websites = (await query(
      "SELECT * FROM Website WHERE userId = ? ORDER BY createdAt DESC",
      [session.user.id]
    )) as any[];

    // For each website, get the counts of related items
    for (const website of websites) {
      website._count = {};

      if (website.type === "WordPress") {
        // Get WordPress counts
        const [products, posts, pages] = await Promise.all([
          query(
            "SELECT COUNT(*) as count FROM WordpressProduct WHERE websiteId = ?",
            [website.id]
          ),
          query(
            "SELECT COUNT(*) as count FROM WordpressPost WHERE websiteId = ?",
            [website.id]
          ),
          query(
            "SELECT COUNT(*) as count FROM WordpressPage WHERE websiteId = ?",
            [website.id]
          ),
        ]);

        const productsResult = products as CountResult[];
        const postsResult = posts as CountResult[];
        const pagesResult = pages as CountResult[];

        website._count.products = productsResult[0]?.count || 0;
        website._count.posts = postsResult[0]?.count || 0;
        website._count.pages = pagesResult[0]?.count || 0;
      } else if (website.type === "Custom") {
        // Get Custom website counts - only pages from CustomPage table
        try {
          const [customPages, legacyPages] = await Promise.all([
            query(
              "SELECT COUNT(*) as count FROM CustomPage WHERE websiteId = ?",
              [website.id]
            ),
            query("SELECT COUNT(*) as count FROM Page WHERE websiteId = ?", [
              website.id,
            ]),
          ]);

          const customPagesResult = customPages as CountResult[];
          const legacyPagesResult = legacyPages as CountResult[];

          // Use CustomPage count if available, otherwise fall back to legacy Page table
          const totalPages =
            (customPagesResult[0]?.count || 0) > 0
              ? customPagesResult[0]?.count || 0
              : legacyPagesResult[0]?.count || 0;

          website._count.products = 0; // Custom websites don't have products
          website._count.posts = 0; // Custom websites don't have blog posts
          website._count.pages = totalPages;
          website._count.customPages = customPagesResult[0]?.count || 0;
          website._count.legacyPages = legacyPagesResult[0]?.count || 0;
        } catch (error) {
          console.error(
            `Error counting Custom website content for ${website.id}:`,
            error
          );
          website._count.products = 0;
          website._count.posts = 0;
          website._count.pages = 0;
          website._count.customPages = 0;
          website._count.legacyPages = 0;
        }
      } else {
        // Get Shopify counts
        const [products, blogs, pages] = await Promise.all([
          query(
            "SELECT COUNT(*) as count FROM ShopifyProduct WHERE websiteId = ?",
            [website.id]
          ),
          query(
            "SELECT COUNT(*) as count FROM ShopifyBlog WHERE websiteId = ?",
            [website.id]
          ),
          query(
            "SELECT COUNT(*) as count FROM ShopifyPage WHERE websiteId = ?",
            [website.id]
          ),
        ]);

        const productsResult = products as CountResult[];
        const blogsResult = blogs as CountResult[];
        const pagesResult = pages as CountResult[];

        website._count.shopifyProducts = productsResult[0]?.count || 0;
        website._count.shopifyBlog = blogsResult[0]?.count || 0;
        website._count.shopifyPages = pagesResult[0]?.count || 0;
      }
    }

    const transformedWebsites: TransformedWebsite[] = websites.map(
      (website) => ({
        ...website,
        queryLimit: website.plan === "Growth" ? 10000 : 1000,
        content: {
          products:
            website.type === "WordPress"
              ? website._count.products
              : website.type === "Custom"
              ? 0 // Custom websites don't have products
              : website._count.shopifyProducts,
          blogPosts:
            website.type === "WordPress"
              ? website._count.posts
              : website.type === "Custom"
              ? 0 // Custom websites don't have blog posts
              : website._count.shopifyBlog || 0,
          pages:
            website.type === "WordPress"
              ? website._count.pages
              : website.type === "Custom"
              ? website._count.pages // Use the combined count we calculated
              : website._count.shopifyPages,
        },
        status: website.active ? "active" : "inactive",
      })
    );

    return NextResponse.json(transformedWebsites);
  } catch (error) {
    console.error("Error fetching websites:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
