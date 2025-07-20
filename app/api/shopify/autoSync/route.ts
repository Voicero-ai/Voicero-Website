import { NextRequest, NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";
import { cors } from "../../../../lib/cors";
import { PrismaClient, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const prismaWithPool = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: ["query", "error", "warn"],
});

interface AutoSyncData {
  autoSync: true;
  data: {
    shop: {
      id: string;
      name: string;
      email: string;
      primaryDomain: { url: string };
      currencyCode: string;
      timezoneAbbreviation: string;
    };
    products: Array<{
      shopifyId: string | number;
      title: string;
      handle: string;
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
      images?: Array<{
        shopifyId: string | number;
        url?: string;
        src?: string;
        altText?: string;
        alt?: string;
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
      collections?: Array<{
        title: string;
        handle: string;
        description?: string;
        ruleSet?: { rules: Array<{ title: string }> };
        sortOrder?: string;
        updatedAt?: string;
      }>;
    }>;
    pages: Array<{
      shopifyId: string | number;
      title: string;
      handle: string;
      content?: string;
      bodySummary?: string;
      createdAt?: string;
      updatedAt?: string;
      publishedAt?: string;
      isPublished?: boolean;
      templateSuffix?: string;
      metafields?: Array<{
        id: string;
        namespace: string;
        key: string;
        value: string;
      }>;
      isPolicy?: boolean;
      policyType?: string;
    }>;
    blogs: Array<{
      shopifyId: string | number;
      title: string;
      handle: string;
      articlesCount?: number;
      commentPolicy?: string;
      posts: Array<{
        shopifyId: string | number;
        title: string;
        handle: string;
        content?: string;
        author?: string;
        tags?: string[];
        createdAt?: string;
        updatedAt?: string;
        publishedAt?: string;
        isPublished?: boolean;
        summary?: string;
        image?: { src?: string };
        templateSuffix?: string;
        metafields?: Array<{
          id: string;
          namespace: string;
          key: string;
          value: string;
        }>;
      }>;
    }>;
    collections: Array<{
      shopifyId: string | number;
      title: string;
      handle: string;
      description?: string;
      image?: any;
      products?: Array<{
        shopifyId: string | number;
        title?: string;
        handle?: string;
      }>;
      ruleSet?: { rules: Array<{ title: string }> };
      sortOrder?: string;
      updatedAt?: string;
    }>;
    discounts: {
      codeDiscounts: Array<{
        shopifyId: string | number;
        title: string;
        code?: string;
        value: string;
        type: string;
        appliesTo?: string;
        startsAt: string;
        endsAt?: string;
        status?: string;
      }>;
      automaticDiscounts: Array<{
        shopifyId: string | number;
        title: string;
        value: string;
        type: string;
        appliesTo?: string;
        startsAt: string;
        endsAt?: string;
        status?: string;
      }>;
    };
  };
  websiteId: string;
}

function generateRandomShopifyId(): bigint {
  const randomNum = Math.floor(Math.random() * 900000000000) + 100000000000;
  return BigInt(randomNum);
}

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    console.log("=== Starting Shopify AutoSync ===");

    await prismaWithPool.$connect();
    console.log("Database connection established");

    let body: AutoSyncData;
    try {
      const rawBody = await request.text();
      console.log("Raw request body received");
      body = JSON.parse(rawBody) as AutoSyncData;
    } catch (err) {
      return cors(
        request,
        NextResponse.json(
          { error: "Invalid JSON in request body" },
          { status: 400 }
        )
      );
    }

    if (!body.autoSync || !body.data || !body.websiteId) {
      return cors(
        request,
        NextResponse.json(
          { error: "Invalid autoSync request format" },
          { status: 400 }
        )
      );
    }

    // Find website by ID
    const website = await prismaWithPool.website.findUnique({
      where: { id: body.websiteId },
    });

    if (!website) {
      return cors(
        request,
        NextResponse.json({ error: "Website not found" }, { status: 404 })
      );
    }

    console.log("Website found =>", website.id, website.name, website.url);

    const {
      products = [],
      pages = [],
      blogs = [],
      collections = [],
      discounts = { automaticDiscounts: [], codeDiscounts: [] },
    } = body.data;

    let changedItems = {
      products: [] as string[],
      pages: [] as string[],
      blogs: [] as string[],
      collections: [] as string[],
      discounts: [] as string[],
    };

    // Process Products
    if (products.length > 0) {
      console.log(`Processing ${products.length} product(s) for changes`);

      for (const product of products) {
        const existingProduct = await prismaWithPool.shopifyProduct.findFirst({
          where: {
            websiteId: website.id,
            shopifyId: BigInt(product.shopifyId),
          },
        });

        const needsUpdate =
          !existingProduct ||
          existingProduct.title !== (product.title || "") ||
          existingProduct.handle !== (product.handle || "") ||
          existingProduct.vendor !== (product.vendor || "") ||
          existingProduct.productType !== (product.productType || "") ||
          existingProduct.description !== (product.description || "") ||
          existingProduct.bodyHtml !== (product.bodyHtml || null) ||
          JSON.stringify(existingProduct.tags) !==
            JSON.stringify(product.tags || []) ||
          existingProduct.status !== (product.status || null);

        if (needsUpdate) {
          await prismaWithPool.shopifyProduct.upsert({
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
              tags: product.tags || [],
              publishedAt: product.publishedAt
                ? new Date(product.publishedAt)
                : null,
              status: product.status || null,
              seo: product.seo || null,
              priceRange: product.priceRange || null,
              totalInventory: product.totalInventory || null,
              trained: false,
            },
            update: {
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
              trained: false,
            },
          });

          changedItems.products.push(`${product.title} (${product.handle})`);
          console.log(`Updated product: ${product.title} (${product.handle})`);
        }
      }
    }

    // Process Pages
    if (pages.length > 0) {
      console.log(`Processing ${pages.length} page(s) for changes`);

      // Track which pages we've processed by handle to avoid duplicates
      const processedHandles = new Map<string, boolean>();

      for (const page of pages) {
        try {
          let pageShopifyId = page.shopifyId;
          if (pageShopifyId === 0 || pageShopifyId?.toString() === "0") {
            pageShopifyId = Number(generateRandomShopifyId());
          }

          // FIRST: Try to find the page by shopifyId (primary identifier)
          const existingPageById = await prismaWithPool.shopifyPage.findFirst({
            where: {
              websiteId: website.id,
              shopifyId: BigInt(pageShopifyId),
            },
          });

          // SECOND: If not found by ID, try to find by handle (for potential duplicates)
          const originalHandle = page.handle || "";
          let existingPageByHandle = null;

          if (!existingPageById && originalHandle) {
            existingPageByHandle = await prismaWithPool.shopifyPage.findFirst({
              where: {
                websiteId: website.id,
                handle: originalHandle,
              },
            });
          }

          // Determine the final handle to use
          let finalHandle = originalHandle;

          // If we found a page with the same handle but different ID, we need to make a decision
          if (!existingPageById && existingPageByHandle) {
            console.log(
              `Found existing page with handle "${originalHandle}" but different ID. Using existing page.`
            );
            // Skip this page as we already have one with this handle
            console.log(
              `Skipping duplicate page: ${page.title} (${originalHandle})`
            );
            continue;
          }

          // If we already processed a page with this handle in this batch, skip it
          if (!existingPageById && processedHandles.has(originalHandle)) {
            console.log(
              `Already processed a page with handle "${originalHandle}" in this batch. Skipping duplicate.`
            );
            continue;
          }

          // Mark this handle as processed
          processedHandles.set(originalHandle, true);

          // If we have an existing page by ID, use its current handle to avoid conflicts
          if (existingPageById) {
            finalHandle = existingPageById.handle || originalHandle;
          }

          const needsUpdate =
            existingPageById &&
            (existingPageById.title !== (page.title || "") ||
              existingPageById.content !== (page.content || "") ||
              existingPageById.bodySummary !== (page.bodySummary || null) ||
              existingPageById.isPublished !== (page.isPublished || null) ||
              existingPageById.templateSuffix !==
                (page.templateSuffix || null));

          // Only create if we don't have an existing page by ID or handle
          const shouldCreate = !existingPageById && !existingPageByHandle;

          if (shouldCreate || needsUpdate) {
            if (shouldCreate) {
              console.log(`Creating new page: ${page.title} (${finalHandle})`);
            } else {
              console.log(
                `Updating existing page: ${page.title} (${finalHandle})`
              );
            }

            await prismaWithPool.shopifyPage.upsert({
              where: {
                websiteId_shopifyId: {
                  websiteId: website.id,
                  shopifyId: BigInt(pageShopifyId),
                },
              },
              create: {
                websiteId: website.id,
                shopifyId: BigInt(pageShopifyId),
                title: page.title || "",
                handle: finalHandle,
                content: page.content || "",
                bodySummary: page.bodySummary || null,
                publishedAt: page.publishedAt
                  ? new Date(page.publishedAt)
                  : null,
                isPublished: page.isPublished || null,
                templateSuffix: page.templateSuffix || null,
                trained: false,
              },
              update: {
                title: page.title || undefined,
                // Don't update handle for existing pages to avoid conflicts
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

            changedItems.pages.push(`${page.title} (${finalHandle})`);
          } else {
            console.log(
              `No changes needed for page: ${page.title} (${finalHandle})`
            );
          }
        } catch (error: any) {
          console.error(`Error processing page ${page.title || "unknown"}:`, {
            message: error.message,
            code: error.code,
          });

          // Skip this page on error instead of trying to create with a random handle
          console.error(
            `Skipping page due to error: ${page.title || "unknown"}`
          );
        }
      }
    }

    // Process Blogs and Posts
    if (blogs.length > 0) {
      console.log(`Processing ${blogs.length} blog(s) for changes`);

      for (const blog of blogs) {
        const existingBlog = await prismaWithPool.shopifyBlog.findFirst({
          where: {
            websiteId: website.id,
            shopifyId: BigInt(blog.shopifyId),
          },
        });

        const needsBlogUpdate =
          !existingBlog ||
          existingBlog.title !== (blog.title || "") ||
          existingBlog.handle !== (blog.handle || "") ||
          existingBlog.articlesCount !== (blog.articlesCount || null) ||
          existingBlog.commentPolicy !== (blog.commentPolicy || null);

        if (needsBlogUpdate) {
          const upsertedBlog = await prismaWithPool.shopifyBlog.upsert({
            where: {
              websiteId_shopifyId: {
                websiteId: website.id,
                shopifyId: BigInt(blog.shopifyId),
              },
            },
            create: {
              websiteId: website.id,
              shopifyId: BigInt(blog.shopifyId),
              title: blog.title || "",
              handle: blog.handle || "",
              articlesCount: blog.articlesCount || null,
              commentPolicy: blog.commentPolicy || null,
              tags: [],
            },
            update: {
              title: blog.title || undefined,
              handle: blog.handle || undefined,
              articlesCount: blog.articlesCount || undefined,
              commentPolicy: blog.commentPolicy || undefined,
            },
          });

          changedItems.blogs.push(`${blog.title} (${blog.handle})`);
          console.log(`Updated blog: ${blog.title} (${blog.handle})`);
        }

        // Process blog posts
        if (blog.posts && blog.posts.length > 0) {
          for (const post of blog.posts) {
            let postShopifyId = post.shopifyId;
            if (postShopifyId === 0 || postShopifyId?.toString() === "0") {
              postShopifyId = Number(generateRandomShopifyId());
            }

            const existingPost = await prismaWithPool.shopifyBlogPost.findFirst(
              {
                where: {
                  websiteId: website.id,
                  shopifyId: BigInt(postShopifyId),
                },
              }
            );

            const needsPostUpdate =
              !existingPost ||
              existingPost.title !== (post.title || "") ||
              existingPost.handle !== (post.handle || "") ||
              existingPost.content !== (post.content || "") ||
              existingPost.author !== (post.author || "") ||
              existingPost.summary !== (post.summary || null) ||
              existingPost.isPublished !== (post.isPublished || null) ||
              JSON.stringify(existingPost.tags) !==
                JSON.stringify(post.tags || []);

            if (needsPostUpdate) {
              const blogRecord = await prismaWithPool.shopifyBlog.findFirst({
                where: {
                  websiteId: website.id,
                  shopifyId: BigInt(blog.shopifyId),
                },
              });

              if (blogRecord) {
                await prismaWithPool.shopifyBlogPost.upsert({
                  where: {
                    websiteId_shopifyId: {
                      websiteId: website.id,
                      shopifyId: BigInt(postShopifyId),
                    },
                  },
                  create: {
                    websiteId: website.id,
                    shopifyId: BigInt(postShopifyId),
                    title: post.title || "",
                    handle: post.handle || "",
                    content: post.content || "",
                    author: post.author || "",
                    image: post.image?.src || null,
                    isPublished: post.isPublished || null,
                    publishedAt: post.publishedAt
                      ? new Date(post.publishedAt)
                      : null,
                    summary: post.summary || null,
                    tags: post.tags || [],
                    templateSuffix: post.templateSuffix || null,
                    blogId: blogRecord.id,
                    trained: false,
                  },
                  update: {
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

                changedItems.blogs.push(`Post: ${post.title} (${post.handle})`);
                console.log(
                  `Updated blog post: ${post.title} (${post.handle})`
                );
              }
            }
          }
        }
      }
    }

    // Process Collections
    if (collections.length > 0) {
      console.log(`Processing ${collections.length} collection(s) for changes`);

      for (const collection of collections) {
        let collectionShopifyId = collection.shopifyId;
        if (
          collectionShopifyId === 0 ||
          collectionShopifyId?.toString() === "0"
        ) {
          collectionShopifyId = Number(generateRandomShopifyId());
        }

        const existingCollection =
          await prismaWithPool.shopifyCollection.findFirst({
            where: {
              websiteId: website.id,
              shopifyId: BigInt(collectionShopifyId),
            },
          });

        const needsUpdate =
          !existingCollection ||
          existingCollection.title !== (collection.title || "") ||
          existingCollection.handle !== (collection.handle || "") ||
          existingCollection.description !== (collection.description || null) ||
          existingCollection.sortOrder !== (collection.sortOrder || null) ||
          JSON.stringify(existingCollection.ruleSet) !==
            JSON.stringify(collection.ruleSet || null);

        if (needsUpdate) {
          await prismaWithPool.shopifyCollection.upsert({
            where: {
              websiteId_shopifyId: {
                websiteId: website.id,
                shopifyId: BigInt(collectionShopifyId),
              },
            },
            create: {
              websiteId: website.id,
              shopifyId: BigInt(collectionShopifyId),
              title: collection.title || "",
              handle: collection.handle || "",
              description: collection.description || null,
              image: collection.image || undefined,
              ruleSet: collection.ruleSet || undefined,
              sortOrder: collection.sortOrder || null,
              updatedAt: collection.updatedAt
                ? new Date(collection.updatedAt)
                : null,
              trained: false,
            },
            update: {
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

          changedItems.collections.push(
            `${collection.title} (${collection.handle})`
          );
          console.log(
            `Updated collection: ${collection.title} (${collection.handle})`
          );
        }
      }
    }

    // Process Discounts
    const allDiscounts = [
      ...(discounts.codeDiscounts || []),
      ...(discounts.automaticDiscounts || []),
    ];

    if (allDiscounts.length > 0) {
      console.log(`Processing ${allDiscounts.length} discount(s) for changes`);

      for (const discount of allDiscounts) {
        let discountShopifyId = discount.shopifyId;
        if (discountShopifyId === 0 || discountShopifyId?.toString() === "0") {
          discountShopifyId = Number(generateRandomShopifyId());
        }

        const existingDiscount = await prismaWithPool.shopifyDiscount.findFirst(
          {
            where: {
              websiteId: website.id,
              shopifyId: BigInt(discountShopifyId),
            },
          }
        );

        // Check if this is a code discount (has code property)
        const isCodeDiscount = "code" in discount;

        const needsUpdate =
          !existingDiscount ||
          existingDiscount.title !== (discount.title || "") ||
          (isCodeDiscount &&
            existingDiscount.code !== (discount.code || null)) ||
          existingDiscount.type !== (discount.type || "") ||
          existingDiscount.value !== (discount.value || "") ||
          existingDiscount.appliesTo !== (discount.appliesTo || null) ||
          existingDiscount.status !== (discount.status || "ACTIVE");

        if (needsUpdate) {
          await prismaWithPool.shopifyDiscount.upsert({
            where: {
              websiteId_shopifyId: {
                websiteId: website.id,
                shopifyId: BigInt(discountShopifyId),
              },
            },
            create: {
              websiteId: website.id,
              shopifyId: BigInt(discountShopifyId),
              title: discount.title || "",
              code: isCodeDiscount ? (discount as any).code || null : null,
              type: discount.type || "",
              value: discount.value || "",
              appliesTo: discount.appliesTo || null,
              startsAt: new Date(discount.startsAt),
              endsAt: discount.endsAt ? new Date(discount.endsAt) : null,
              status: discount.status || "ACTIVE",
              trained: false,
            },
            update: {
              title: discount.title || undefined,
              code: isCodeDiscount
                ? (discount as any).code || undefined
                : undefined,
              type: discount.type || undefined,
              value: discount.value || undefined,
              appliesTo: discount.appliesTo || undefined,
              startsAt: new Date(discount.startsAt),
              endsAt: discount.endsAt ? new Date(discount.endsAt) : undefined,
              status: discount.status || undefined,
              trained: false,
            },
          });

          changedItems.discounts.push(`${discount.title} (${discount.type})`);
          console.log(`Updated discount: ${discount.title} (${discount.type})`);
        }
      }
    }

    // Update lastSyncedAt
    await prismaWithPool.website.update({
      where: { id: website.id },
      data: { lastSyncedAt: new Date() },
    });

    // Log what got edited
    console.log("=== AutoSync Changes Summary ===");
    console.log(`Products updated: ${changedItems.products.length}`);
    if (changedItems.products.length > 0) {
      changedItems.products.forEach((item) => console.log(`  - ${item}`));
    }

    console.log(`Pages updated: ${changedItems.pages.length}`);
    if (changedItems.pages.length > 0) {
      changedItems.pages.forEach((item) => console.log(`  - ${item}`));
    }

    console.log(`Blogs/Posts updated: ${changedItems.blogs.length}`);
    if (changedItems.blogs.length > 0) {
      changedItems.blogs.forEach((item) => console.log(`  - ${item}`));
    }

    console.log(`Collections updated: ${changedItems.collections.length}`);
    if (changedItems.collections.length > 0) {
      changedItems.collections.forEach((item) => console.log(`  - ${item}`));
    }

    console.log(`Discounts updated: ${changedItems.discounts.length}`);
    if (changedItems.discounts.length > 0) {
      changedItems.discounts.forEach((item) => console.log(`  - ${item}`));
    }

    // If there were any changes, trigger vectorization
    const totalChanges =
      changedItems.products.length +
      changedItems.pages.length +
      changedItems.blogs.length +
      changedItems.collections.length +
      changedItems.discounts.length;

    if (totalChanges > 0) {
      console.log("Changes detected, triggering vectorization...");

      // Get access key for the website
      const accessKey = await prismaWithPool.accessKey.findFirst({
        where: { websiteId: website.id },
        select: { key: true },
      });

      if (accessKey) {
        // Fire and forget - don't wait for response
        try {
          fetch(`https://train.voicero.ai/api/shopify/vectorize`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Authorization: `Bearer ${accessKey.key}`,
            },
            body: JSON.stringify({ websiteId: website.id }),
          }).catch((error) => {
            console.error("Vectorization request error:", error);
            // Continue with the process even if there's an error
          });

          console.log(
            "Vectorization request sent, continuing without waiting for response"
          );
        } catch (error) {
          console.error("Failed to send vectorization request:", error);
          // Continue regardless of errors
        }
      } else {
        console.log("No access key found for website, skipping vectorization");
      }
    }

    console.log("=== AutoSync Complete ===");

    return cors(
      request,
      NextResponse.json({
        success: true,
        message: "AutoSync completed successfully",
        changes: changedItems,
        totalChanges: totalChanges,
      })
    );
  } catch (error: any) {
    console.error("AutoSync error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
    });
    return cors(
      request,
      NextResponse.json(
        {
          error: "Failed to process autoSync",
          details: error.message,
        },
        { status: 500 }
      )
    );
  } finally {
    await prismaWithPool.$disconnect();
  }
}
