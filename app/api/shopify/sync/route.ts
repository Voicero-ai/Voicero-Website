import { NextRequest, NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";
import { cors } from "../../../../lib/cors";
import { PrismaClient, Prisma } from "@prisma/client";
import axios from "axios";
import * as cheerio from "cheerio";

export const dynamic = "force-dynamic";

// If you prefer using this new prismaWithPool client, that's fine,
// but ensure the DB URL and environment match exactly what is used
// by the rest of your app.
const prismaWithPool = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: ["query", "error", "warn"],
});

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

interface ShopifyProductInput {
  shopifyId: string | number;
  title?: string;
  handle?: string;
  vendor?: string;
  productType?: string;
  description?: string;
  bodyHtml?: string;
  tags?: string[];
  publishedAt?: string;
  status?: string;
  seo?: any;
  priceRange?: any;
  totalInventory?: number;
  tracksInventory?: boolean;
  hasOnlyDefaultVariant?: boolean;
  hasOutOfStockVariants?: boolean;
  collections?: Array<{
    title: string;
    handle: string;
    description?: string;
    ruleSet?: { rules: Array<{ title: string }> };
    sortOrder?: string;
    updatedAt?: string;
  }>;
  variants?: Array<{
    shopifyId: string | number;
    title?: string;
    price?: string | number;
    sku?: string;
    inventory?: number;
    compareAtPrice?: number;
    inventoryPolicy?: string;
    inventoryTracking?: boolean;
    weight?: number;
    weightUnit?: string;
  }>;
  images?: Array<{
    shopifyId: string | number;
    url?: string;
    src?: string;
    altText?: string;
    alt?: string;
  }>;
}

interface PageInput {
  shopifyId: number;
  handle?: string;
  title?: string;
  content?: string;
  bodySummary?: string;
  publishedAt?: string;
  isPublished?: boolean;
  templateSuffix?: string;
  metafields?: Array<{
    id: string;
    namespace: string;
    key: string;
    value: string;
  }>;
}

interface BlogInput {
  shopifyId: number;
  handle?: string;
  title?: string;
  articlesCount?: number;
  commentPolicy?: string;
  feed?: any;
  tags?: string[];
  templateSuffix?: string;
  metafields?: Array<{
    id: string;
    namespace: string;
    key: string;
    value: string;
  }>;
  posts?: Array<{
    shopifyId: number;
    handle?: string;
    title?: string;
    content?: string;
    author?: string;
    image?: { src?: string };
    isPublished?: boolean;
    publishedAt?: string;
    summary?: string;
    tags?: string[];
    templateSuffix?: string;
    metafields?: Array<{
      id: string;
      namespace: string;
      key: string;
      value: string;
    }>;
  }>;
}

interface DiscountInput {
  shopifyId: number;
  title: string;
  code?: string;
  type: string;
  value: string;
  appliesTo?: string;
  startsAt: string;
  endsAt?: string;
  status?: string;
}

interface ShopifySyncBody {
  fullSync?: boolean;
  data?: {
    shop?: any;
    products?: ShopifyProductInput[];
    pages?: PageInput[];
    blogs?: BlogInput[];
    collections?: Array<{
      shopifyId: number;
      title: string;
      handle: string;
      description?: string;
      image?: any;
      ruleSet?: { rules: Array<{ title: string }> };
      sortOrder?: string;
      updatedAt?: string;
      products?: Array<{
        shopifyId: number | string;
        title?: string;
        handle?: string;
      }>;
    }>;
    discounts?: {
      automaticDiscounts?: DiscountInput[];
      codeDiscounts?: DiscountInput[];
    };
  };
}

// Function to format date
function formatDate(date: Date): string {
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function scrapeUrl(url: string): Promise<string | null> {
  try {
    console.log(`Scraping content from URL: ${url}`);
    const response = await axios.get(url, {
      timeout: 10000, // 10 seconds timeout
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; VoiceroBot/1.0; +https://voicero.ai)",
        Accept: "text/html,application/xhtml+xml,application/xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.data) {
      console.warn(`No data returned from ${url}`);
      return null;
    }

    const $ = cheerio.load(response.data);

    // Only remove scripts, styles, and SVGs but keep structure and content
    $("script").remove(); // Remove all scripts
    $("style").remove(); // Remove style tags
    $("svg").remove(); // Remove SVG elements
    $("link[rel='stylesheet']").remove(); // Remove CSS
    $("meta").remove(); // Remove meta tags
    $("iframe").remove(); // Remove iframes for security

    // Replace images with their alt text or placeholders
    $("img").each((_, img) => {
      const $img = $(img);
      const alt = $img.attr("alt") || "[Image]";
      $img.replaceWith(`<div class="image-placeholder">${alt}</div>`);
    });

    // Get the main content area if it exists, otherwise use body
    let content = "";
    const mainContent = $(
      "#MainContent, #main-content, main, .main-content, article, .product-description, .collection-description, .page-content"
    );

    if (mainContent.length > 0) {
      // Use the first main content area found
      content = $(mainContent[0]).html() || "";
    } else {
      // Fallback to body content
      content = $("body").html() || "";
    }

    if (content.length < 100) {
      console.warn(
        `Content from ${url} is suspiciously short (${content.length} chars)`
      );
    } else {
      console.log(
        `Successfully scraped content from ${url} (${content.length} chars)`
      );
    }

    return content;
  } catch (error: any) {
    console.error(`Error scraping ${url}:`, error.message);
    if (error.response) {
      console.error(`Response status: ${error.response.status}`);
    }
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      console.error(`Connection to ${url} failed - site may be unavailable`);
    }
    if (error.code === "ETIMEDOUT") {
      console.error(`Connection to ${url} timed out`);
    }
    return null;
  }
}

// Helper function to construct the full URL for a Shopify entity
async function constructShopifyUrl(
  website: any,
  handle: string | undefined | null,
  type: "products" | "pages" | "blogs" | "collections"
): Promise<string | null> {
  if (!handle) return null;

  // Get base URL from website record
  const baseUrl = website.url;
  if (!baseUrl) return null;

  // Normalize base URL
  let normalizedUrl = baseUrl;
  if (!normalizedUrl.startsWith("http")) {
    normalizedUrl = `https://${normalizedUrl}`;
  }
  if (normalizedUrl.endsWith("/")) {
    normalizedUrl = normalizedUrl.slice(0, -1);
  }

  // Check if this is a policy page
  const policyHandles = [
    "privacy-policy",
    "refund-policy",
    "shipping-policy",
    "terms-of-service",
    "contact-information",
  ];

  // If it's a page and the handle matches a policy page, use the policies path
  if (
    type === "pages" &&
    policyHandles.some((policyHandle) =>
      handle.toLowerCase().includes(policyHandle)
    )
  ) {
    return `${normalizedUrl}/policies/${handle}`;
  }

  // Construct full URL based on entity type
  return `${normalizedUrl}/${type}/${handle}`;
}

// Function to generate a random BigInt similar to 145482219825
function generateRandomShopifyId(): bigint {
  // Generate a random number between 100000000000 and 999999999999 (12 digits like 145482219825)
  const randomNum = Math.floor(Math.random() * 900000000000) + 100000000000;
  return BigInt(randomNum);
}

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    console.log("=== Starting Shopify Sync (All Upserts, No Full Deletes) ===");
    console.log("DATABASE_URL in production =>", process.env.DATABASE_URL);

    await prismaWithPool.$connect();
    console.log("Database connection established");

    // Authorization
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return cors(
        request,
        NextResponse.json(
          { error: "Missing or invalid authorization header" },
          { status: 401 }
        )
      );
    }
    const accessKey = authHeader.split(" ")[1];

    // Find website by access key
    const website = await prismaWithPool.website.findFirst({
      where: { accessKeys: { some: { key: accessKey } } },
    });
    if (!website) {
      return cors(
        request,
        NextResponse.json({ error: "Website not found" }, { status: 404 })
      );
    }
    console.log(
      "Website found =>",
      website.id,
      website.name,
      website.url,
      "Plan:",
      website.plan
    );

    // Parse request
    let body: ShopifySyncBody;
    try {
      const rawBody = await request.text();
      console.log("Raw request body:", rawBody);
      body = JSON.parse(rawBody) as ShopifySyncBody;
      console.log("Parsed request body:", body);
    } catch (err) {
      return cors(
        request,
        NextResponse.json(
          { error: "Invalid JSON in request body" },
          { status: 400 }
        )
      );
    }

    // Now we properly grab data from body.data rather than top-level body
    const dataBody = body.data || {};
    const {
      products = [],
      pages = [],
      blogs = [],
      collections = [],
      discounts = { automaticDiscounts: [], codeDiscounts: [] },
    } = dataBody;

    // Get all existing items from our database for comparison
    const existingProducts = await prismaWithPool.shopifyProduct.findMany({
      where: { websiteId: website.id },
      select: { shopifyId: true },
    });
    console.log(
      "Existing products in DB:",
      existingProducts.map((p) => p.shopifyId.toString())
    );

    // Create sets of current Shopify IDs for comparison
    const currentProductIds = new Set(products.map((p) => Number(p.shopifyId)));
    console.log("Current Shopify product IDs:", Array.from(currentProductIds));

    // Find items to delete (exist in our DB but not in current Shopify data)
    const productsToDelete = existingProducts.filter(
      (p) => !currentProductIds.has(Number(p.shopifyId))
    );
    console.log(
      "Products to delete:",
      productsToDelete.map((p) => p.shopifyId.toString())
    );

    // Do the same for other types
    const existingPages = await prismaWithPool.shopifyPage.findMany({
      where: { websiteId: website.id },
      select: { shopifyId: true, id: true, title: true, handle: true },
    });
    console.log(
      "Existing pages in DB:",
      existingPages.map((p) => p.shopifyId.toString())
    );

    // Convert any pages with shopifyId 0 to have a random ID instead
    for (const page of existingPages) {
      if (page.shopifyId === BigInt(0)) {
        const randomId = generateRandomShopifyId();
        console.log(
          `Converting existing page ID 0 to random ID ${randomId} (${
            page.title || page.handle || "unknown"
          })`
        );
        await prismaWithPool.shopifyPage.update({
          where: { id: page.id },
          data: { shopifyId: randomId },
        });
        // Update in our local array too
        page.shopifyId = randomId;
      }
    }

    const currentPageIds = new Set(pages.map((p) => Number(p.shopifyId)));
    console.log("Current Shopify page IDs:", Array.from(currentPageIds));

    const pagesToDelete = existingPages.filter(
      (p) => !currentPageIds.has(Number(p.shopifyId))
    );
    console.log(
      "Pages to delete:",
      pagesToDelete.map((p) => p.shopifyId.toString())
    );

    // Blogs
    const existingBlogs = await prismaWithPool.shopifyBlog.findMany({
      where: { websiteId: website.id },
      select: { shopifyId: true },
    });
    console.log(
      "Existing blogs in DB:",
      existingBlogs.map((b) => b.shopifyId.toString())
    );

    const currentBlogIds = new Set(blogs.map((b) => Number(b.shopifyId)));
    console.log("Current Shopify blog IDs:", Array.from(currentBlogIds));

    const blogsToDelete = existingBlogs.filter(
      (b) => !currentBlogIds.has(Number(b.shopifyId))
    );
    console.log(
      "Blogs to delete:",
      blogsToDelete.map((b) => b.shopifyId.toString())
    );

    // Collections
    const existingCollections = await prismaWithPool.shopifyCollection.findMany(
      {
        where: { websiteId: website.id },
        select: { shopifyId: true },
      }
    );
    console.log(
      "Existing collections in DB:",
      existingCollections.map((c) => c.shopifyId?.toString() || "")
    );

    const currentCollectionIds = new Set(
      collections.map((c) => Number(c.shopifyId))
    );
    console.log(
      "Current Shopify collection IDs:",
      Array.from(currentCollectionIds)
    );

    const collectionsToDelete = existingCollections.filter(
      (c) => !currentCollectionIds.has(Number(c.shopifyId))
    );
    console.log(
      "Collections to delete:",
      collectionsToDelete.map((c) => c.shopifyId?.toString() || "")
    );

    // Discounts
    const existingDiscounts = await prismaWithPool.shopifyDiscount.findMany({
      where: { websiteId: website.id },
      select: { shopifyId: true },
    });
    console.log(
      "Existing discounts in DB:",
      existingDiscounts.map((d) => d.shopifyId.toString())
    );

    const currentDiscountIds = new Set([
      ...(discounts.automaticDiscounts || []).map((d) => Number(d.shopifyId)),
      ...(discounts.codeDiscounts || []).map((d) => Number(d.shopifyId)),
    ]);
    console.log(
      "Current Shopify discount IDs:",
      Array.from(currentDiscountIds)
    );

    const discountsToDelete = existingDiscounts.filter(
      (d) => !currentDiscountIds.has(Number(d.shopifyId))
    );
    console.log(
      "Discounts to delete:",
      discountsToDelete.map((d) => d.shopifyId.toString())
    );

    // Log deletion counts
    console.log("=== Items to Delete ===");
    console.log(`Products to delete: ${productsToDelete.length}`);
    console.log(`Pages to delete: ${pagesToDelete.length}`);
    console.log(`Blogs to delete: ${blogsToDelete.length}`);
    console.log(`Collections to delete: ${collectionsToDelete.length}`);
    console.log(`Discounts to delete: ${discountsToDelete.length}`);
    console.log("=====================");

    // Delete items that no longer exist in Shopify
    if (productsToDelete.length > 0) {
      await prismaWithPool.shopifyProduct.deleteMany({
        where: {
          websiteId: website.id,
          shopifyId: { in: productsToDelete.map((p) => p.shopifyId) },
        },
      });
    }

    if (pagesToDelete.length > 0) {
      await prismaWithPool.shopifyPage.deleteMany({
        where: {
          websiteId: website.id,
          shopifyId: { in: pagesToDelete.map((p) => p.shopifyId) },
        },
      });
    }

    if (blogsToDelete.length > 0) {
      await prismaWithPool.shopifyBlog.deleteMany({
        where: {
          websiteId: website.id,
          shopifyId: { in: blogsToDelete.map((b) => b.shopifyId) },
        },
      });
    }

    if (collectionsToDelete.length > 0) {
      await prismaWithPool.shopifyCollection.deleteMany({
        where: {
          websiteId: website.id,
          shopifyId: {
            in: collectionsToDelete
              .map((c) => c.shopifyId)
              .filter((id): id is bigint => id !== null),
          },
        },
      });
    }

    if (discountsToDelete.length > 0) {
      await prismaWithPool.shopifyDiscount.deleteMany({
        where: {
          websiteId: website.id,
          shopifyId: { in: discountsToDelete.map((d) => d.shopifyId) },
        },
      });
    }

    // Filter out inactive/unpublished content
    const activeProducts = products.filter(
      (product) =>
        product.status === "ACTIVE" &&
        product.publishedAt &&
        new Date(product.publishedAt) <= new Date()
    );

    const activePages = pages.filter(
      (page) =>
        page.isPublished &&
        page.publishedAt &&
        new Date(page.publishedAt) <= new Date()
    );

    const activeBlogs = blogs.filter((blog) => {
      const activePosts = blog.posts?.filter(
        (post) =>
          post.isPublished !== false &&
          post.publishedAt &&
          new Date(post.publishedAt) <= new Date()
      );
      return activePosts && activePosts.length > 0;
    });

    const activeCollections = collections.filter(
      (collection) => collection.products && collection.products.length > 0
    );

    const activeDiscounts = {
      automaticDiscounts: (discounts.automaticDiscounts || []).filter(
        (discount) =>
          discount.status === "ACTIVE" &&
          new Date(discount.startsAt) <= new Date() &&
          (!discount.endsAt || new Date(discount.endsAt) > new Date())
      ),
      codeDiscounts: (discounts.codeDiscounts || []).filter(
        (discount) =>
          discount.status === "ACTIVE" &&
          new Date(discount.startsAt) <= new Date() &&
          (!discount.endsAt || new Date(discount.endsAt) > new Date())
      ),
    };

    // Just in case you need to check fullSync:
    const isFullSync = !!body.fullSync;
    console.log("fullSync? =>", isFullSync);

    // Log summary of what's being processed
    console.log("=== Sync Summary ===");
    console.log(
      `Active Products: ${activeProducts.length} (${products.length} total)`
    );
    console.log(`Active Pages: ${activePages.length} (${pages.length} total)`);
    console.log(`Active Blogs: ${activeBlogs.length} (${blogs.length} total)`);
    console.log(
      `Active Collections: ${activeCollections.length} (${collections.length} total)`
    );
    console.log(
      `Active Code Discounts: ${activeDiscounts.codeDiscounts.length} (${
        discounts.codeDiscounts?.length || 0
      } total)`
    );
    console.log(
      `Active Automatic Discounts: ${
        activeDiscounts.automaticDiscounts.length
      } (${discounts.automaticDiscounts?.length || 0} total)`
    );
    console.log("===================");

    //----------------------------------------------------------------------
    // (A) Upsert PRODUCTS in Chunks
    //----------------------------------------------------------------------
    if (activeProducts.length > 0) {
      console.log(`Processing ${activeProducts.length} active product(s)`);
      const productChunks = chunkArray<ShopifyProductInput>(activeProducts, 10);
      for (const chunk of productChunks) {
        console.log(`Processing product chunk of size: ${chunk.length}`);
        await prismaWithPool.$transaction(
          async (tx) => {
            for (const product of chunk) {
              try {
                // Try to scrape product page if handle exists
                let scrapedHtml = null;
                if (product.handle) {
                  const productUrl = await constructShopifyUrl(
                    website,
                    product.handle,
                    "products"
                  );
                  if (productUrl) {
                    console.log(
                      `Attempting to scrape product page: ${productUrl}`
                    );
                    try {
                      scrapedHtml = await scrapeUrl(productUrl);
                      if (scrapedHtml) {
                        console.log(
                          `Successfully stored scraped HTML for product: ${
                            product.title || product.handle
                          }`
                        );
                      } else {
                        console.warn(
                          `Failed to get content for product: ${
                            product.title || product.handle
                          }`
                        );
                      }
                    } catch (scrapeErr) {
                      console.error(
                        `Error scraping product ${product.handle}:`,
                        scrapeErr
                      );
                    }
                  }
                }

                // First upsert the product
                const upsertedProduct = await tx.shopifyProduct.upsert({
                  where: {
                    websiteId_shopifyId: {
                      websiteId: website.id,
                      shopifyId: BigInt(product.shopifyId),
                    },
                  },
                  create: {
                    websiteId: website.id,
                    shopifyId: BigInt(product.shopifyId),
                    title: product.title || "",
                    handle: product.handle || "",
                    vendor: product.vendor || "",
                    productType: product.productType || "",
                    description: product.description || "",
                    bodyHtml: product.bodyHtml || null,
                    scrapedHtml: scrapedHtml,
                    tags: product.tags || [],
                    publishedAt: product.publishedAt
                      ? new Date(product.publishedAt)
                      : null,
                    status: product.status || null,
                    seo: product.seo || null,
                    priceRange: product.priceRange || null,
                    totalInventory: product.totalInventory || null,
                    tracksInventory: product.tracksInventory || null,
                    hasOnlyDefaultVariant:
                      product.hasOnlyDefaultVariant || null,
                    hasOutOfStockVariants:
                      product.hasOutOfStockVariants || null,
                  },
                  update: {
                    title: product.title || undefined,
                    handle: product.handle || undefined,
                    vendor: product.vendor || undefined,
                    productType: product.productType || undefined,
                    description: product.description || undefined,
                    bodyHtml: product.bodyHtml || undefined,
                    scrapedHtml: scrapedHtml,
                    tags: product.tags || undefined,
                    publishedAt: product.publishedAt
                      ? new Date(product.publishedAt)
                      : undefined,
                    status: product.status || undefined,
                    seo: product.seo || undefined,
                    priceRange: product.priceRange || undefined,
                    totalInventory: product.totalInventory || undefined,
                    tracksInventory: product.tracksInventory || undefined,
                    hasOnlyDefaultVariant:
                      product.hasOnlyDefaultVariant || undefined,
                    hasOutOfStockVariants:
                      product.hasOutOfStockVariants || undefined,
                    trained: false,
                  },
                });

                // Then upsert variants
                if (product.variants && product.variants.length > 0) {
                  for (const variant of product.variants) {
                    await tx.shopifyProductVariant.upsert({
                      where: {
                        shopifyId: BigInt(variant.shopifyId),
                      },
                      create: {
                        shopifyId: BigInt(variant.shopifyId),
                        title: variant.title || "",
                        price: variant.price
                          ? parseFloat(variant.price.toString())
                          : 0,
                        sku: variant.sku || null,
                        inventory: variant.inventory || null,
                        compareAtPrice: variant.compareAtPrice || null,
                        inventoryPolicy: variant.inventoryPolicy || null,
                        inventoryTracking: variant.inventoryTracking || null,
                        weight: variant.weight || null,
                        weightUnit: variant.weightUnit || null,
                        productId: upsertedProduct.id,
                      },
                      update: {
                        title: variant.title || undefined,
                        price: variant.price
                          ? parseFloat(variant.price.toString())
                          : undefined,
                        sku: variant.sku || undefined,
                        inventory: variant.inventory || undefined,
                        compareAtPrice: variant.compareAtPrice || undefined,
                        inventoryPolicy: variant.inventoryPolicy || undefined,
                        inventoryTracking:
                          variant.inventoryTracking || undefined,
                        weight: variant.weight || undefined,
                        weightUnit: variant.weightUnit || undefined,
                      },
                    });
                  }
                }

                // Then upsert images
                if (product.images && product.images.length > 0) {
                  for (const image of product.images) {
                    await tx.shopifyMedia.upsert({
                      where: {
                        shopifyId: BigInt(image.shopifyId),
                      },
                      create: {
                        shopifyId: BigInt(image.shopifyId),
                        url: image.url || image.src || "",
                        altText: image.altText || image.alt || null,
                        productId: upsertedProduct.id,
                      },
                      update: {
                        url: image.url || image.src || undefined,
                        altText: image.altText || image.alt || undefined,
                      },
                    });
                  }
                }
              } catch (err: any) {
                if (
                  err instanceof Prisma.PrismaClientKnownRequestError &&
                  err.code === "P2002"
                ) {
                  console.warn(
                    "P2002 conflict on product",
                    product.shopifyId,
                    "– retrying update..."
                  );
                  // Handle unique constraint violation
                  await tx.shopifyProduct.updateMany({
                    where: {
                      websiteId: website.id,
                      shopifyId: BigInt(product.shopifyId),
                    },
                    data: {
                      title: product.title || undefined,
                      handle: product.handle || undefined,
                      vendor: product.vendor || undefined,
                      productType: product.productType || undefined,
                      description: product.description || undefined,
                      bodyHtml: product.bodyHtml || undefined,
                      tags: product.tags || undefined,
                      publishedAt: product.publishedAt
                        ? new Date(product.publishedAt)
                        : undefined,
                      status: product.status || undefined,
                      seo: product.seo || undefined,
                      priceRange: product.priceRange || undefined,
                      totalInventory: product.totalInventory || undefined,
                      tracksInventory: product.tracksInventory || undefined,
                      hasOnlyDefaultVariant:
                        product.hasOnlyDefaultVariant || undefined,
                      hasOutOfStockVariants:
                        product.hasOutOfStockVariants || undefined,
                    },
                  });
                } else {
                  throw err;
                }
              }
            }
          },
          { timeout: 30000 }
        );
      }
    } else {
      console.log("No products to upsert.");
    }

    //----------------------------------------------------------------------
    // (B) Upsert PAGES
    //----------------------------------------------------------------------
    if (activePages.length > 0) {
      console.log(`Processing ${activePages.length} active page(s)`);

      // First, try to scrape the home page
      console.log("Attempting to scrape home page...");
      let homePageHtml = null;
      try {
        const homeUrl = website.url.startsWith("http")
          ? website.url
          : `https://${website.url}`;
        console.log(`Scraping home page from: ${homeUrl}`);
        homePageHtml = await scrapeUrl(homeUrl);
        if (homePageHtml) {
          console.log("Successfully scraped home page content");
        } else {
          console.warn("Failed to get content for home page");
        }
      } catch (scrapeErr) {
        console.error("Error scraping home page:", scrapeErr);
      }

      // Create home page entry if we got content
      if (homePageHtml) {
        try {
          // Extract text content from HTML
          const $ = cheerio.load(homePageHtml);
          const textContent = $("body").text().trim();

          // Generate a random ID for home page instead of using 0
          const randomHomePageId = generateRandomShopifyId();

          // Check if we already have a home page record
          const existingHomePage = await prismaWithPool.shopifyPage.findFirst({
            where: {
              websiteId: website.id,
              shopifyId: BigInt(0),
            },
          });

          if (existingHomePage) {
            // Update existing home page with new ID and content
            await prismaWithPool.shopifyPage.update({
              where: {
                id: existingHomePage.id,
              },
              data: {
                shopifyId: randomHomePageId,
                title: "Home",
                handle: "/",
                content: textContent,
                scrapedHtml: homePageHtml,
                publishedAt: null,
                isPublished: true,
                templateSuffix: null,
                trained: false,
              },
            });
            console.log(
              `Successfully updated home page with new ID: ${randomHomePageId}`
            );
          } else {
            // Create new home page with random ID
            await prismaWithPool.shopifyPage.create({
              data: {
                websiteId: website.id,
                shopifyId: randomHomePageId,
                title: "Home",
                handle: "/",
                content: textContent,
                scrapedHtml: homePageHtml,
                publishedAt: null,
                isPublished: true,
                templateSuffix: null,
              },
            });
            console.log(
              `Successfully created home page with ID: ${randomHomePageId}`
            );
          }
        } catch (err) {
          console.error("Error upserting home page:", err);
        }
      }

      // Now process regular pages
      await prismaWithPool.$transaction(
        async (tx) => {
          for (const page of activePages) {
            try {
              // Check if this is a page with shopifyId 0 and generate a random ID if needed
              if (page.shopifyId === 0 || page.shopifyId?.toString() === "0") {
                page.shopifyId = Number(generateRandomShopifyId());
                console.log(
                  `Generated new random ID ${page.shopifyId} for page "${
                    page.title || page.handle
                  }"`
                );
              }

              // Add logging for bodySummary length
              if (page.bodySummary) {
                console.log(
                  `Page "${page.title || page.handle}" bodySummary length: ${
                    page.bodySummary.length
                  }`
                );
                if (page.bodySummary.length > 65000) {
                  console.warn(
                    `WARNING: Page "${
                      page.title || page.handle
                    }" has a very long bodySummary (${
                      page.bodySummary.length
                    } chars)`
                  );
                }
              }

              // Try to scrape page content if handle exists
              let scrapedHtml = null;
              if (page.handle) {
                const pageUrl = await constructShopifyUrl(
                  website,
                  page.handle,
                  "pages"
                );
                if (pageUrl) {
                  console.log(`Attempting to scrape page: ${pageUrl}`);
                  try {
                    scrapedHtml = await scrapeUrl(pageUrl);
                    if (scrapedHtml) {
                      console.log(
                        `Successfully stored scraped HTML for page: ${
                          page.title || page.handle
                        }`
                      );
                    } else {
                      console.warn(
                        `Failed to get content for page: ${
                          page.title || page.handle
                        }`
                      );
                    }
                  } catch (scrapeErr) {
                    console.error(
                      `Error scraping page ${page.handle}:`,
                      scrapeErr
                    );
                  }
                }
              }

              const upsertedPage = await tx.shopifyPage.upsert({
                where: {
                  websiteId_shopifyId: {
                    websiteId: website.id,
                    shopifyId: page.shopifyId,
                  },
                },
                create: {
                  websiteId: website.id,
                  shopifyId: page.shopifyId,
                  title: page.title || "",
                  handle: page.handle || "",
                  content: page.content || "",
                  bodySummary: page.bodySummary || null,
                  scrapedHtml: scrapedHtml,
                  publishedAt: page.publishedAt
                    ? new Date(page.publishedAt)
                    : null,
                  isPublished: page.isPublished || null,
                  templateSuffix: page.templateSuffix || null,
                },
                update: {
                  title: page.title || undefined,
                  handle: page.handle || undefined,
                  content: page.content || undefined,
                  bodySummary: page.bodySummary || undefined,
                  scrapedHtml: scrapedHtml,
                  publishedAt: page.publishedAt
                    ? new Date(page.publishedAt)
                    : undefined,
                  isPublished: page.isPublished || undefined,
                  templateSuffix: page.templateSuffix || undefined,
                  trained: false,
                },
              });

              // Upsert metafields
              if (page.metafields && page.metafields.length > 0) {
                for (const metafield of page.metafields) {
                  await tx.shopifyMetafield.upsert({
                    where: {
                      websiteId_shopifyId: {
                        websiteId: website.id,
                        shopifyId: metafield.id,
                      },
                    },
                    create: {
                      websiteId: website.id,
                      shopifyId: metafield.id,
                      namespace: metafield.namespace,
                      key: metafield.key,
                      value: metafield.value,
                      pageId: upsertedPage.id,
                    },
                    update: {
                      namespace: metafield.namespace,
                      key: metafield.key,
                      value: metafield.value,
                    },
                  });
                }
              }
            } catch (err: any) {
              if (
                err instanceof Prisma.PrismaClientKnownRequestError &&
                err.code === "P2002"
              ) {
                console.warn(
                  "P2002 conflict on page",
                  page.shopifyId,
                  "– retrying update..."
                );
                await tx.shopifyPage.updateMany({
                  where: {
                    websiteId: website.id,
                    shopifyId: page.shopifyId,
                  },
                  data: {
                    title: page.title || undefined,
                    handle: page.handle || undefined,
                    content: page.content || undefined,
                    bodySummary: page.bodySummary || undefined,
                    publishedAt: page.publishedAt
                      ? new Date(page.publishedAt)
                      : undefined,
                    isPublished: page.isPublished || undefined,
                    templateSuffix: page.templateSuffix || undefined,
                    trained: false,
                  },
                });
              } else {
                throw err;
              }
            }
          }
        },
        { timeout: 30000 }
      );
    } else {
      console.log("No pages to upsert.");
    }

    //----------------------------------------------------------------------
    // (C) Upsert BLOGS and POSTS
    //----------------------------------------------------------------------
    if (activeBlogs.length > 0) {
      console.log(`Processing ${activeBlogs.length} active blog(s)`);
      await prismaWithPool.$transaction(
        async (tx) => {
          for (const blog of activeBlogs) {
            try {
              const upsertedBlog = await tx.shopifyBlog.upsert({
                where: {
                  websiteId_shopifyId: {
                    websiteId: website.id,
                    shopifyId: blog.shopifyId,
                  },
                },
                create: {
                  websiteId: website.id,
                  shopifyId: blog.shopifyId,
                  title: blog.title || "",
                  handle: blog.handle || "",
                  articlesCount: blog.articlesCount || null,
                  commentPolicy: blog.commentPolicy || null,
                  feed: blog.feed || null,
                  tags: blog.tags || [],
                  templateSuffix: blog.templateSuffix || null,
                },
                update: {
                  title: blog.title || undefined,
                  handle: blog.handle || undefined,
                  articlesCount: blog.articlesCount || undefined,
                  commentPolicy: blog.commentPolicy || undefined,
                  feed: blog.feed || undefined,
                  tags: blog.tags || undefined,
                  templateSuffix: blog.templateSuffix || undefined,
                },
              });

              // Upsert metafields
              if (blog.metafields && blog.metafields.length > 0) {
                for (const metafield of blog.metafields) {
                  await tx.shopifyMetafield.upsert({
                    where: {
                      websiteId_shopifyId: {
                        websiteId: website.id,
                        shopifyId: metafield.id,
                      },
                    },
                    create: {
                      websiteId: website.id,
                      shopifyId: metafield.id,
                      namespace: metafield.namespace,
                      key: metafield.key,
                      value: metafield.value,
                      blogId: upsertedBlog.id,
                    },
                    update: {
                      namespace: metafield.namespace,
                      key: metafield.key,
                      value: metafield.value,
                    },
                  });
                }
              }

              // Upsert posts
              if (blog.posts && blog.posts.length > 0) {
                // Filter posts before upserting
                const postsToUpsert = blog.posts.filter(
                  (post) =>
                    post.isPublished === true &&
                    post.publishedAt &&
                    new Date(post.publishedAt) <= new Date()
                );

                for (const post of postsToUpsert) {
                  try {
                    // Check if this is a post with shopifyId 0 and generate a random ID if needed
                    if (
                      post.shopifyId === 0 ||
                      post.shopifyId?.toString() === "0"
                    ) {
                      post.shopifyId = Number(generateRandomShopifyId());
                      console.log(
                        `Generated new random ID ${
                          post.shopifyId
                        } for blog post "${post.title || post.handle}"`
                      );
                    }

                    // Try to scrape blog post content if handle exists
                    let scrapedHtml = null;
                    if (post.handle && blog.handle) {
                      // For blog posts, we need both the blog handle and post handle
                      const blogPostUrl = `${await constructShopifyUrl(
                        website,
                        blog.handle,
                        "blogs"
                      )}/${post.handle}`;
                      if (blogPostUrl) {
                        console.log(
                          `Attempting to scrape blog post: ${blogPostUrl}`
                        );
                        try {
                          scrapedHtml = await scrapeUrl(blogPostUrl);
                          if (scrapedHtml) {
                            console.log(
                              `Successfully stored scraped HTML for blog post: ${
                                post.title || post.handle
                              }`
                            );
                          } else {
                            console.warn(
                              `Failed to get content for blog post: ${
                                post.title || post.handle
                              }`
                            );
                          }
                        } catch (scrapeErr) {
                          console.error(
                            `Error scraping blog post ${post.handle}:`,
                            scrapeErr
                          );
                        }
                      }
                    }

                    const upsertedPost = await tx.shopifyBlogPost.upsert({
                      where: {
                        websiteId_shopifyId: {
                          websiteId: website.id,
                          shopifyId: post.shopifyId,
                        },
                      },
                      create: {
                        websiteId: website.id,
                        shopifyId: post.shopifyId,
                        title: post.title || "",
                        handle: post.handle || "",
                        content: post.content || "",
                        scrapedHtml: scrapedHtml,
                        author: post.author || "",
                        image: post.image?.src || null,
                        isPublished: post.isPublished || null,
                        publishedAt: post.publishedAt
                          ? new Date(post.publishedAt)
                          : null,
                        summary: post.summary || null,
                        tags: post.tags || [],
                        templateSuffix: post.templateSuffix || null,
                        blogId: upsertedBlog.id,
                      },
                      update: {
                        title: post.title || undefined,
                        handle: post.handle || undefined,
                        content: post.content || undefined,
                        scrapedHtml: scrapedHtml,
                        author: post.author || undefined,
                        image: post.image?.src || undefined,
                        isPublished: post.isPublished || undefined,
                        publishedAt: post.publishedAt
                          ? new Date(post.publishedAt)
                          : undefined,
                        summary: post.summary || undefined,
                        tags: post.tags || undefined,
                        templateSuffix: post.templateSuffix || undefined,
                        trained: false,
                      },
                    });

                    // Upsert post metafields
                    if (post.metafields && post.metafields.length > 0) {
                      for (const metafield of post.metafields) {
                        await tx.shopifyMetafield.upsert({
                          where: {
                            websiteId_shopifyId: {
                              websiteId: website.id,
                              shopifyId: metafield.id,
                            },
                          },
                          create: {
                            websiteId: website.id,
                            shopifyId: metafield.id,
                            namespace: metafield.namespace,
                            key: metafield.key,
                            value: metafield.value,
                            postId: upsertedPost.id,
                          },
                          update: {
                            namespace: metafield.namespace,
                            key: metafield.key,
                            value: metafield.value,
                          },
                        });
                      }
                    }
                  } catch (err: any) {
                    if (
                      err instanceof Prisma.PrismaClientKnownRequestError &&
                      err.code === "P2002"
                    ) {
                      console.warn(
                        "P2002 conflict on blog post",
                        post.shopifyId,
                        "– retrying update..."
                      );
                      await tx.shopifyBlogPost.updateMany({
                        where: {
                          websiteId: website.id,
                          shopifyId: post.shopifyId,
                        },
                        data: {
                          title: post.title || undefined,
                          handle: post.handle || undefined,
                          content: post.content || undefined,
                          author: post.author || undefined,
                          image: post.image?.src || undefined,
                          isPublished: post.isPublished || undefined,
                          publishedAt: post.publishedAt
                            ? new Date(post.publishedAt)
                            : undefined,
                          summary: post.summary || undefined,
                          tags: post.tags || undefined,
                          templateSuffix: post.templateSuffix || undefined,
                          trained: false,
                        },
                      });
                    } else {
                      throw err;
                    }
                  }
                }
              }
            } catch (err: any) {
              if (
                err instanceof Prisma.PrismaClientKnownRequestError &&
                err.code === "P2002"
              ) {
                console.warn(
                  "P2002 conflict on blog",
                  blog.shopifyId,
                  "– retrying update..."
                );
                await tx.shopifyBlog.updateMany({
                  where: {
                    websiteId: website.id,
                    shopifyId: blog.shopifyId,
                  },
                  data: {
                    title: blog.title || undefined,
                    handle: blog.handle || undefined,
                    articlesCount: blog.articlesCount || undefined,
                    commentPolicy: blog.commentPolicy || undefined,
                    feed: blog.feed || undefined,
                    tags: blog.tags || undefined,
                    templateSuffix: blog.templateSuffix || undefined,
                  },
                });
              } else {
                throw err;
              }
            }
          }
        },
        { timeout: 30000 }
      );
    } else {
      console.log("No blogs to upsert.");
    }

    //----------------------------------------------------------------------
    // (D) Upsert COLLECTIONS
    //----------------------------------------------------------------------
    if (activeCollections.length > 0) {
      console.log(
        `Processing ${activeCollections.length} active collection(s)`
      );
      await prismaWithPool.$transaction(
        async (tx) => {
          for (const collection of activeCollections) {
            try {
              // Check if this is a collection with shopifyId 0 and generate a random ID if needed
              if (
                collection.shopifyId === 0 ||
                collection.shopifyId?.toString() === "0"
              ) {
                collection.shopifyId = Number(generateRandomShopifyId());
                console.log(
                  `Generated new random ID ${
                    collection.shopifyId
                  } for collection "${collection.title || collection.handle}"`
                );
              }

              // Try to scrape collection content if handle exists
              let scrapedHtml = null;
              if (collection.handle) {
                const collectionUrl = await constructShopifyUrl(
                  website,
                  collection.handle,
                  "collections"
                );
                if (collectionUrl) {
                  console.log(
                    `Attempting to scrape collection: ${collectionUrl}`
                  );
                  try {
                    scrapedHtml = await scrapeUrl(collectionUrl);
                    if (scrapedHtml) {
                      console.log(
                        `Successfully stored scraped HTML for collection: ${
                          collection.title || collection.handle
                        }`
                      );
                    } else {
                      console.warn(
                        `Failed to get content for collection: ${
                          collection.title || collection.handle
                        }`
                      );
                    }
                  } catch (scrapeErr) {
                    console.error(
                      `Error scraping collection ${collection.handle}:`,
                      scrapeErr
                    );
                  }
                }
              }

              // Find product IDs before upserting to improve performance
              let productIds: string[] = [];
              if (collection.products && collection.products.length > 0) {
                console.log(
                  `Finding ${collection.products.length} products for collection "${collection.title}"`
                );

                // Get all products in one query
                const shopifyIds = collection.products.map((p) =>
                  BigInt(p.shopifyId)
                );
                const existingProducts = await tx.shopifyProduct.findMany({
                  where: {
                    websiteId: website.id,
                    shopifyId: { in: shopifyIds },
                  },
                  select: { id: true },
                });

                productIds = existingProducts.map((p) => p.id);
                console.log(
                  `Found ${productIds.length} matching products in database`
                );
              }

              const upsertedCollection = await tx.shopifyCollection.upsert({
                where: {
                  websiteId_shopifyId: {
                    websiteId: website.id,
                    shopifyId: collection.shopifyId,
                  },
                },
                create: {
                  websiteId: website.id,
                  shopifyId: collection.shopifyId,
                  title: collection.title || "",
                  handle: collection.handle || "",
                  description: collection.description || null,
                  scrapedHtml: scrapedHtml,
                  image: collection.image || undefined,
                  ruleSet: collection.ruleSet || undefined,
                  sortOrder: collection.sortOrder || null,
                  updatedAt: collection.updatedAt
                    ? new Date(collection.updatedAt)
                    : null,
                  products:
                    productIds.length > 0
                      ? {
                          connect: productIds.map((id) => ({ id })),
                        }
                      : undefined,
                },
                update: {
                  title: collection.title || undefined,
                  handle: collection.handle || undefined,
                  description: collection.description || undefined,
                  scrapedHtml: scrapedHtml,
                  image: collection.image || undefined,
                  ruleSet: collection.ruleSet || undefined,
                  sortOrder: collection.sortOrder || undefined,
                  updatedAt: collection.updatedAt
                    ? new Date(collection.updatedAt)
                    : undefined,
                  products: {
                    set: productIds.map((id) => ({ id })),
                  },
                  trained: false,
                },
              });
            } catch (err: any) {
              if (
                err instanceof Prisma.PrismaClientKnownRequestError &&
                err.code === "P2002"
              ) {
                console.warn(
                  "P2002 conflict on collection",
                  collection.shopifyId,
                  "– retrying update..."
                );
                await tx.shopifyCollection.updateMany({
                  where: {
                    websiteId: website.id,
                    shopifyId: collection.shopifyId,
                  },
                  data: {
                    title: collection.title || undefined,
                    handle: collection.handle || undefined,
                    description: collection.description || undefined,
                    image: collection.image || undefined,
                    ruleSet: collection.ruleSet || undefined,
                    sortOrder: collection.sortOrder || undefined,
                    updatedAt: collection.updatedAt
                      ? new Date(collection.updatedAt)
                      : undefined,
                    trained: false,
                  },
                });

                // In case of conflict, handle the product connections separately
                if (collection.products && collection.products.length > 0) {
                  const foundCollection = await tx.shopifyCollection.findFirst({
                    where: {
                      websiteId: website.id,
                      shopifyId: collection.shopifyId,
                    },
                    select: { id: true },
                  });

                  if (foundCollection) {
                    // Get all products in one query
                    const shopifyIds = collection.products.map((p) =>
                      BigInt(p.shopifyId)
                    );
                    const existingProducts = await tx.shopifyProduct.findMany({
                      where: {
                        websiteId: website.id,
                        shopifyId: { in: shopifyIds },
                      },
                      select: { id: true },
                    });

                    const productIds = existingProducts.map((p) => p.id);

                    await tx.shopifyCollection.update({
                      where: { id: foundCollection.id },
                      data: {
                        products: {
                          set: productIds.map((id) => ({ id })),
                        },
                      },
                    });
                  }
                }
              } else {
                throw err;
              }
            }
          }
        },
        { timeout: 30000 }
      );
    } else {
      console.log("No collections to upsert.");
    }

    //----------------------------------------------------------------------
    // (E) Upsert DISCOUNTS
    //----------------------------------------------------------------------
    const codeDiscounts = activeDiscounts.codeDiscounts;
    const automaticDiscounts = activeDiscounts.automaticDiscounts;

    if (codeDiscounts.length > 0 || automaticDiscounts.length > 0) {
      console.log("=== DISCOUNTS PROCESSING ===");
      console.log(
        `Processing ${codeDiscounts.length} code discount(s) and ${automaticDiscounts.length} automatic discount(s)`
      );

      // Helper function to delay execution
      const delay = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));

      // Process code discounts with delay between each operation
      console.log("=== Processing code discounts sequentially with delay ===");
      let codeSuccessCount = 0;
      let codeErrorCount = 0;
      for (const discount of codeDiscounts) {
        try {
          // Check if this is a discount with shopifyId 0 and generate a random ID if needed
          if (
            discount.shopifyId === 0 ||
            discount.shopifyId?.toString() === "0"
          ) {
            discount.shopifyId = Number(generateRandomShopifyId());
            console.log(
              `Generated new random ID ${discount.shopifyId} for code discount "${discount.title}"`
            );
          }

          console.log(
            `Processing code discount ID: ${discount.shopifyId}, Title: "${discount.title}", Type: ${discount.type}`
          );

          // Try direct upsert with websiteId_shopifyId
          try {
            await prismaWithPool.$executeRaw`
              DELETE FROM \`ShopifyDiscount\` 
              WHERE websiteId = ${website.id} AND shopifyId = ${BigInt(
              discount.shopifyId
            )};
            `;
            console.log(
              `Removed any existing discount with ID ${discount.shopifyId}`
            );
          } catch (deleteErr: any) {
            console.log(
              `No record to delete for ID ${discount.shopifyId} or error: ${deleteErr.message}`
            );
          }

          // Create fresh discount record
          const created = await prismaWithPool.shopifyDiscount.create({
            data: {
              shopifyId: discount.shopifyId,
              title: discount.title,
              code: discount.code || null,
              type: discount.type,
              value: discount.value || "",
              appliesTo: discount.appliesTo || null,
              startsAt: new Date(discount.startsAt),
              endsAt: discount.endsAt ? new Date(discount.endsAt) : null,
              status: discount.status || "ACTIVE",
              websiteId: website.id,
              trained: false,
            },
          });

          console.log(
            `SUCCESS: Created/updated code discount: ${discount.shopifyId}, DB ID: ${created.id}`
          );
          codeSuccessCount++;

          // Add delay between operations to avoid race conditions
          await delay(500);
        } catch (err: any) {
          console.error(
            `ERROR: Processing code discount ${discount.shopifyId}:`,
            err.message
          );
          if (err.code) console.error(`Error code: ${err.code}`);
          if (err.meta) console.error(`Error metadata:`, err.meta);
          codeErrorCount++;
          // Continue with the next discount
          await delay(1000); // Longer delay after error
        }
      }
      console.log(
        `=== Code discount processing complete: ${codeSuccessCount} succeeded, ${codeErrorCount} failed ===`
      );

      // Process automatic discounts with delay between each operation
      console.log(
        "=== Processing automatic discounts sequentially with delay ==="
      );
      let autoSuccessCount = 0;
      let autoErrorCount = 0;
      for (const discount of automaticDiscounts) {
        try {
          // Check if this is a discount with shopifyId 0 and generate a random ID if needed
          if (
            discount.shopifyId === 0 ||
            discount.shopifyId?.toString() === "0"
          ) {
            discount.shopifyId = Number(generateRandomShopifyId());
            console.log(
              `Generated new random ID ${discount.shopifyId} for automatic discount "${discount.title}"`
            );
          }

          console.log(
            `Processing automatic discount ID: ${discount.shopifyId}, Title: "${discount.title}", Type: ${discount.type}`
          );

          // Try direct upsert with websiteId_shopifyId
          try {
            await prismaWithPool.$executeRaw`
              DELETE FROM \`ShopifyDiscount\` 
              WHERE websiteId = ${website.id} AND shopifyId = ${BigInt(
              discount.shopifyId
            )};
            `;
            console.log(
              `Removed any existing discount with ID ${discount.shopifyId}`
            );
          } catch (deleteErr: any) {
            console.log(
              `No record to delete for ID ${discount.shopifyId} or error: ${deleteErr.message}`
            );
          }

          // Create fresh discount record
          const created = await prismaWithPool.shopifyDiscount.create({
            data: {
              shopifyId: discount.shopifyId,
              title: discount.title,
              type: discount.type,
              value: discount.value || "",
              appliesTo: discount.appliesTo || null,
              startsAt: new Date(discount.startsAt),
              endsAt: discount.endsAt ? new Date(discount.endsAt) : null,
              status: discount.status || "ACTIVE",
              websiteId: website.id,
              trained: false,
            },
          });

          console.log(
            `SUCCESS: Created/updated automatic discount: ${discount.shopifyId}, DB ID: ${created.id}`
          );
          autoSuccessCount++;

          // Add delay between operations to avoid race conditions
          await delay(500);
        } catch (err: any) {
          console.error(
            `ERROR: Processing automatic discount ${discount.shopifyId}:`,
            err.message
          );
          if (err.code) console.error(`Error code: ${err.code}`);
          if (err.meta) console.error(`Error metadata:`, err.meta);
          autoErrorCount++;
          // Continue with the next discount
          await delay(1000); // Longer delay after error
        }
      }
      console.log(
        `=== Automatic discount processing complete: ${autoSuccessCount} succeeded, ${autoErrorCount} failed ===`
      );
      console.log("=== DISCOUNTS PROCESSING COMPLETE ===");
    } else {
      console.log("No discounts to upsert.");
    }

    //----------------------------------------------------------------------
    // (F) Update lastSyncedAt
    //----------------------------------------------------------------------
    console.log("Updating lastSyncedAt for website:", website.id);
    await prismaWithPool.$transaction(
      async (tx) => {
        await tx.website.update({
          where: { id: website.id },
          data: { lastSyncedAt: new Date() },
        });
      },
      { timeout: 30000 }
    );

    console.log("=== Shopify Sync Complete ===");
    return cors(
      request,
      NextResponse.json({
        success: true,
        message: "Content synced successfully",
      })
    );
  } catch (error: any) {
    console.error("Sync error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
    });
    return cors(
      request,
      NextResponse.json(
        {
          error: "Failed to sync content",
        },
        { status: 500 }
      )
    );
  } finally {
    await prismaWithPool.$disconnect();
  }
}
