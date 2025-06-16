import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nodeFetch from "node-fetch";
import https from "https";

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

interface SyncStats {
  created: number;
  updated: number;
  errors: number;
  details: {
    categories?: Array<{ id: number; error: string }>;
    posts?: Array<{ id: number; error: string }>;
    pages?: Array<{ id: number; error: string }>;
    products?: Array<{ id: number; error: string }>;
    comments?: Array<{ id: number; error: string }>;
    reviews?: Array<{ id: number; error: string }>;
  };
}

function cleanContent(content: string): string {
  if (!content) return "";

  try {
    // Create a DOMParser-like environment in Node.js
    const { JSDOM } = require("jsdom");
    const dom = new JSDOM(content);
    const doc = dom.window.document;

    // Get all text content, removing scripts and styles
    const scripts = doc.getElementsByTagName("script");
    const styles = doc.getElementsByTagName("style");
    [...scripts, ...styles].forEach((el) => el.remove());

    // Get the cleaned text content
    const text = doc.body.textContent || doc.documentElement.textContent || "";

    // Clean up whitespace
    return text.replace(/\s+/g, " ").trim();
  } catch (error) {
    // Fallback if HTML parsing fails
    console.warn("HTML parsing failed, falling back to basic cleaning:", error);
    return content
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}

function parseAuthorId(authorId: any): number | null {
  if (!authorId) return null;
  const parsed = parseInt(authorId, 10);
  return isNaN(parsed) ? null : parsed;
}

async function fetchWordPressData(baseUrl: string) {
  const results: any = {};
  const errors: any = {};

  try {
    const response = await fetch(
      `${baseUrl}/wp-json/my-plugin/v1/all-content`,
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    results.posts = data.posts;
    results.pages = data.pages;
    results.products = data.products;
    results.categories = data.categories;
    results.tags = data.tags;
    results.media = data.media;
    results.productCategories = data.productCategories;
    results.productTags = data.productTags;

    Object.entries(data).forEach(([key, value]) => {
      console.log(
        `✅ Fetched ${key}: ${Array.isArray(value) ? value.length : 1} items`
      );
    });
  } catch (error: any) {
    console.error("❌ Error fetching WordPress data:", error);
    errors.all = error.message;
  }

  return { results, errors };
}

async function syncToDatabase(
  websiteId: string,
  websiteUrl: string,
  data: any
): Promise<SyncStats> {
  const stats: SyncStats = {
    created: 0,
    updated: 0,
    errors: 0,
    details: {},
  };

  const now = new Date();

  try {
    // Sync Posts
    if (data.posts) {
      for (const post of data.posts) {
        try {
          if (!post || !post.id) {
            console.warn("Skipping invalid post:", post);
            continue;
          }

          const cleanedContent = cleanContent(post.content);
          const cleanedTitle = cleanContent(post.title);

          const result = await prisma.wordpressPost.upsert({
            where: {
              wpId: post.id,
            },
            update: {
              title: cleanedTitle,
              content: cleanedContent,
              slug: post.slug || "",
              link: post.link || "",
              websiteId,
              authorId: parseAuthorId(post.author),
              updatedAt: now,
            },
            create: {
              wpId: post.id,
              title: cleanedTitle,
              content: cleanedContent,
              slug: post.slug || "",
              link: post.link || "",
              websiteId,
              authorId: parseAuthorId(post.author),
              createdAt: now,
              updatedAt: now,
            },
          });

          if (result) {
            stats.updated++;
          } else {
            stats.created++;
          }
        } catch (error) {
          console.error("Error syncing post:", {
            postId: post?.id,
            error: error instanceof Error ? error.message : String(error),
          });
          stats.errors++;
          if (!stats.details.posts) stats.details.posts = [];
          stats.details.posts.push({
            id: post?.id || 0,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // Sync Pages
    if (data.pages) {
      for (const page of data.pages) {
        try {
          if (!page || !page.id) {
            console.warn("Skipping invalid page:", page);
            continue;
          }

          let pageContent = page.content || "";
          const cleanedTitle = cleanContent(page.title);

          // Check if content is empty or starts with "["
          if (pageContent === "" || pageContent.startsWith("[")) {
            // Handle policy pages by replacing underscores with hyphens in URLs
            let fetchUrl = page.link;
            if (
              page.link &&
              (page.title.toLowerCase().includes("policy") ||
                page.link.toLowerCase().includes("policy"))
            ) {
              fetchUrl = page.link.replace(/_/g, "-");
              console.log(`Fixed policy URL: ${page.link} -> ${fetchUrl}`);
            }

            console.log(
              `Fetching content from URL for page: ${page.title} (${fetchUrl})`
            );
            try {
              if (fetchUrl) {
                // Create a custom HTTPS agent that ignores SSL certificate errors
                const httpsAgent = new https.Agent({
                  rejectUnauthorized: false,
                });

                const response = await nodeFetch(fetchUrl, {
                  agent: httpsAgent,
                });

                if (response.ok) {
                  const html = await response.text();

                  // Use JSDOM to extract text content from the page body
                  const { JSDOM } = require("jsdom");
                  const dom = new JSDOM(html);
                  const doc = dom.window.document;

                  // Remove scripts, styles, and other non-content elements
                  const scripts = doc.getElementsByTagName("script");
                  const styles = doc.getElementsByTagName("style");
                  const navs = doc.getElementsByTagName("nav");
                  const footers = doc.getElementsByTagName("footer");
                  const headers = doc.getElementsByTagName("header");

                  [
                    ...scripts,
                    ...styles,
                    ...navs,
                    ...footers,
                    ...headers,
                  ].forEach((el) => el.remove());

                  // Get content from the main/article element if available, otherwise use body
                  const mainContent =
                    doc.querySelector("main") ||
                    doc.querySelector("article") ||
                    doc.querySelector(".content") ||
                    doc.body;

                  if (mainContent) {
                    pageContent = mainContent.textContent || "";
                    pageContent = pageContent.replace(/\s+/g, " ").trim();
                    console.log(
                      `Successfully fetched and extracted content (${pageContent.length} chars)`
                    );
                  }
                } else {
                  console.warn(
                    `Failed to fetch page content: ${response.status} ${response.statusText}`
                  );
                }
              }
            } catch (fetchError) {
              console.error("Error fetching page content:", fetchError);
            }
          }

          const cleanedContent = cleanContent(pageContent);

          await prisma.wordpressPage.upsert({
            where: {
              wpId: page.id,
            },
            update: {
              title: cleanedTitle,
              content: cleanedContent,
              slug: page.slug || "",
              link: page.link || "",
              websiteId,
              updatedAt: now,
            },
            create: {
              wpId: page.id,
              title: cleanedTitle,
              content: cleanedContent,
              slug: page.slug || "",
              link: page.link || "",
              websiteId,
              createdAt: now,
              updatedAt: now,
            },
          });
          stats.created++;
        } catch (error) {
          console.error("Error syncing page:", error);
          stats.errors++;
        }
      }
    }

    // Sync Products
    if (data.products) {
      for (const product of data.products) {
        try {
          if (!product || !product.id) {
            console.warn("Skipping invalid product:", product);
            continue;
          }

          const cleanedName = cleanContent(product.name);
          const cleanedDescription = cleanContent(product.description);
          const cleanedShortDescription = cleanContent(
            product.short_description
          );

          await prisma.wordpressProduct.upsert({
            where: {
              wpId: product.id,
            },
            update: {
              name: cleanedName,
              slug: product.slug || "",
              permalink: product.link || "",
              description: cleanedDescription,
              shortDescription: cleanedShortDescription,
              price: parseFloat(product.price || "0"),
              regularPrice: product.regular_price
                ? parseFloat(product.regular_price)
                : null,
              salePrice: product.sale_price
                ? parseFloat(product.sale_price)
                : null,
              stockQuantity: product.stock_quantity || null,
              websiteId,
              updatedAt: now,
            },
            create: {
              wpId: product.id,
              name: cleanedName,
              slug: product.slug || "",
              permalink: product.link || "",
              description: cleanedDescription,
              shortDescription: cleanedShortDescription,
              price: parseFloat(product.price || "0"),
              regularPrice: product.regular_price
                ? parseFloat(product.regular_price)
                : null,
              salePrice: product.sale_price
                ? parseFloat(product.sale_price)
                : null,
              stockQuantity: product.stock_quantity || null,
              websiteId,
              createdAt: now,
              updatedAt: now,
            },
          });
          stats.created++;
        } catch (error) {
          console.error("Error syncing product:", error);
          stats.errors++;
        }
      }
    }

    // Sync Comments
    if (data.comments) {
      // First pass: Create all comments without parent relationships
      for (const comment of data.comments) {
        try {
          // Validate required fields
          if (
            !comment.id ||
            !comment.post_id ||
            !comment.author ||
            !comment.content
          ) {
            console.warn("Skipping invalid comment:", comment);
            continue;
          }

          await prisma.wordpressComment.upsert({
            where: {
              wpId: parseInt(String(comment.id), 10),
            },
            update: {
              postId: parseInt(String(comment.post_id), 10),
              authorName: comment.author,
              authorEmail: comment.author_email || "",
              content: comment.content,
              status: comment.status || "approved",
              // Don't update parentId in first pass
              date: new Date(comment.date || Date.now()),
            },
            create: {
              wpId: parseInt(String(comment.id), 10),
              postId: parseInt(String(comment.post_id), 10),
              authorName: comment.author,
              authorEmail: comment.author_email || "",
              content: comment.content,
              status: comment.status || "approved",
              // Don't set parentId in first pass
              date: new Date(comment.date || Date.now()),
            },
          });
          stats.created++;
        } catch (error) {
          console.error("Error syncing comment:", {
            commentId: comment?.id,
            error: error instanceof Error ? error.message : String(error),
          });
          if (!stats.details.comments) stats.details.comments = [];
          stats.details.comments.push({
            id: parseInt(String(comment?.id), 10) || 0,
            error: error instanceof Error ? error.message : String(error),
          });
          stats.errors++;
        }
      }

      // Second pass: Update parent relationships
      for (const comment of data.comments) {
        // Skip if parent_id is '0' or falsy (indicates top-level comment)
        if (comment.parent_id && comment.parent_id !== "0") {
          try {
            await prisma.wordpressComment.update({
              where: {
                wpId: parseInt(String(comment.id), 10),
              },
              data: {
                parentId: parseInt(String(comment.parent_id), 10),
              },
            });
          } catch (error) {
            console.error("Error updating comment parent relationship:", {
              commentId: comment?.id,
              parentId: comment?.parent_id,
              error: error instanceof Error ? error.message : String(error),
            });
            stats.errors++;
          }
        }
      }
    }

    // Sync Product Reviews
    if (data.reviews) {
      for (const review of data.reviews) {
        try {
          // Validate required fields
          if (
            !review.id ||
            !review.product_id ||
            !review.reviewer ||
            !review.review
          ) {
            console.warn("Skipping invalid review:", review);
            continue;
          }

          await prisma.wordpressReview.upsert({
            where: {
              wpId: parseInt(String(review.id), 10),
            },
            update: {
              productId: parseInt(String(review.product_id), 10),
              reviewer: review.reviewer,
              reviewerEmail: review.reviewer_email || "",
              review: review.review,
              rating: parseInt(String(review.rating), 10) || 0,
              verified: review.verified || false,
              date: new Date(review.date || Date.now()),
            },
            create: {
              wpId: parseInt(String(review.id), 10),
              productId: parseInt(String(review.product_id), 10),
              reviewer: review.reviewer,
              reviewerEmail: review.reviewer_email || "",
              review: review.review,
              rating: parseInt(String(review.rating), 10) || 0,
              verified: review.verified || false,
              date: new Date(review.date || Date.now()),
            },
          });
          stats.created++;
        } catch (error) {
          console.error("Error syncing review:", {
            reviewId: review?.id,
            error: error instanceof Error ? error.message : String(error),
          });
          if (!stats.details.reviews) stats.details.reviews = [];
          stats.details.reviews.push({
            id: parseInt(String(review?.id), 10) || 0,
            error: error instanceof Error ? error.message : String(error),
          });
          stats.errors++;
        }
      }
    }

    // Update last sync time
    await prisma.website.update({
      where: { id: websiteId },
      data: {
        lastSyncedAt: now,
      },
    });

    return stats;
  } catch (error: any) {
    console.error("Database sync error:", error);
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    // Extract the access key
    const accessKey = authHeader.split(" ")[1];
    if (!accessKey) {
      return NextResponse.json(
        { error: "No access key provided" },
        { status: 401 }
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
    });

    if (!website) {
      return NextResponse.json(
        { error: "Invalid access key" },
        { status: 401 }
      );
    }

    // Get the data directly from the request body
    const data = await request.json();

    // Log basic information
    console.log("Received data summary:", {
      dataTypes: Object.keys(data),
      productsCount: data.products?.length,
      pagesCount: data.pages?.length,
      postsCount: data.posts?.length,
      categoriesCount: data.categories?.length,
      tagsCount: data.tags?.length,
      commentsCount: data.comments?.length,
      reviewsCount: data.reviews?.length,
      authorsCount: data.authors?.length,
      mediaCount: data.media?.length,
    });

    // Log detailed sample information for each data type
    Object.entries(data).forEach(([key, value]) => {
      if (Array.isArray(value) && value.length > 0) {
        if (key === "pages") {
          // Special handling for pages - show only title and link
          console.log(`\n📄 Pages (${value.length}):`);
          value.forEach((page: any) => {
            console.log(`  - "${page.title}" → ${page.link}`);
          });
        } else {
          // Show a complete sample of the first item
          console.log(
            `\n📝 Sample ${key} item:`,
            JSON.stringify(value[0], null, 2)
          );

          // For larger objects, show just IDs for subsequent items (up to 5)
          if (value.length > 1) {
            const additionalIds = value
              .slice(1, Math.min(5, value.length))
              .map((item) => item.id || item.ID)
              .filter(Boolean);

            if (additionalIds.length > 0) {
              console.log(`📋 Additional ${key} IDs:`, additionalIds);
            }

            if (value.length > 5) {
              console.log(`... and ${value.length - 5} more ${key}`);
            }
          }
        }
      } else if (typeof value === "object" && value !== null) {
        console.log(`\n📝 ${key}:`, JSON.stringify(value, null, 2));
      }
    });

    // Sync to database
    const stats = await syncToDatabase(website.id, website.url, data);

    return NextResponse.json({
      success: true,
      message: "WordPress sync completed",
      stats,
      timestamp: new Date(),
    });
  } catch (error: any) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { error: "Sync failed", details: error.message },
      { status: 500 }
    );
  }
}
