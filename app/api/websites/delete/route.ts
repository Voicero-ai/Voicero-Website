import { NextRequest, NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { query } from "@/lib/db";
import { verifyToken, getWebsiteIdFromToken } from "@/lib/token-verifier";

export const dynamic = "force-dynamic";

// Initialize Pinecone
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!, // Make sure this is defined
});

// Initialize embeddings
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY!, // Make sure this is defined
  modelName: "text-embedding-3-large",
});

// Get reference to your Pinecone index
const index = pinecone.index(process.env.PINECONE_INDEX!);

/**
 * A helper interface for tracking your stats
 */
interface VectorizeStats {
  added: number;
  errors: number;
  details: {
    added: string[];
    errors: Array<{
      id: string;
      error: string;
    }>;
  };
}

/**
 * Utility to create a single embedding
 */
async function createEmbedding(text: string) {
  // `embedDocuments` returns an array, so we destructure `[embedding]`
  const [embedding] = await embeddings.embedDocuments([text]);
  return embedding;
}

/**
 * Delete all vectors related to the given websiteId:
 *  1. In the default/legacy namespace (if any).
 *  2. In the website-specific namespace.
 */
async function deleteWebsiteVectors(websiteId: string) {
  try {
    // First check if there's any vector config for this website
    const rows = (await query(
      `SELECT websiteId FROM VectorDbConfig WHERE websiteId = ? LIMIT 1`,
      [websiteId]
    )) as { websiteId: string }[];
    const vectorConfig = rows.length > 0 ? rows[0] : null;

    if (!vectorConfig) {
      console.log(
        `No vector configuration found for website ${websiteId}, skipping vector cleanup`
      );
      return;
    }

    // 1. Check the default namespace for any legacy vectors
    const defaultQuery = await index.query({
      vector: Array(3072).fill(0), // "dummy" zero vector
      topK: 100,
      filter: { websiteId: { $eq: websiteId } },
      includeMetadata: true,
    });

    if (defaultQuery.matches.length > 0) {
      // Gather IDs to remove
      const vectorIds = defaultQuery.matches.map((match) => match.id);

      // Official Pinecone delete call:
      // Instead of index.deleteMany(vectorIds), do:
      await index.deleteMany(vectorIds);

      console.log(
        `✅ Deleted ${vectorIds.length} legacy vectors from default namespace for website ${websiteId}`
      );
    }

    // 2. Check the website-specific namespace
    const namespaceQuery = await index.namespace(websiteId).query({
      vector: Array(3072).fill(0),
      topK: 1,
      includeMetadata: true,
    });

    if (namespaceQuery.matches.length > 0) {
      // Delete everything in that namespace
      // Instead of index.namespace(websiteId).deleteAll(), do:
      await index.namespace(websiteId).deleteAll();

      console.log(`✅ Deleted vectors from website namespace ${websiteId}`);
    }

    console.log(`✅ Vector cleanup completed for website ${websiteId}`);
  } catch (error) {
    console.error(`⚠️ Error during vector cleanup:`, error);
    throw error;
  }
}

/**
 * Rebuild vector embeddings for an entire website's WordPress content.
 * 1. Deletes old vectors (via deleteWebsiteVectors).
 * 2. Fetches WP content from Prisma.
 * 3. Embeds & upserts them to Pinecone.
 * 4. Updates your VectorDbConfig.
 */
async function addToVectorStore(websiteId: string): Promise<VectorizeStats> {
  const stats: VectorizeStats = {
    added: 0,
    errors: 0,
    details: {
      added: [],
      errors: [],
    },
  };

  try {
    // First, remove old vectors
    await deleteWebsiteVectors(websiteId);

    // 1. Pull WordPress Posts
    const posts = (await query(
      `SELECT p.*, a.name as authorName
       FROM WordpressPost p
       LEFT JOIN WordpressAuthor a ON a.wpId = p.authorId
       WHERE p.websiteId = ?`,
      [websiteId]
    )) as any[];

    // 2. Pull WordPress Pages
    const pages = (await query(
      `SELECT * FROM WordpressPage WHERE websiteId = ?`,
      [websiteId]
    )) as any[];

    // 3. Pull WordPress Products
    const products = (await query(
      `SELECT * FROM WordpressProduct WHERE websiteId = ?`,
      [websiteId]
    )) as any[];
    const productIds = products.map((p) => p.id);
    const reviewsByProduct: Record<string, any[]> = {};
    const categoriesByProduct: Record<string, any[]> = {};
    if (productIds.length > 0) {
      const revs = (await query(
        `SELECT * FROM WordpressReview WHERE productId IN (
           SELECT wpId FROM WordpressProduct WHERE id IN (${Array(
             productIds.length
           )
             .fill("?")
             .join(",")})
        `,
        productIds
      )) as any[];
      for (const r of revs) {
        const key = String(r.productId);
        (reviewsByProduct[key] ||= []).push(r);
      }
      const cats = (await query(
        `SELECT wc.* , link.A as productId
         FROM _WordpressProductToWordpressProductCategory link
         JOIN WordpressProductCategory wc ON wc.id = link.B
         WHERE link.A IN (${Array(productIds.length).fill("?").join(",")})`,
        productIds
      )) as any[];
      for (const c of cats) {
        const key = String(c.productId);
        (categoriesByProduct[key] ||= []).push(c);
      }
    }

    // ------------------------------
    //  Vectorize each post
    // ------------------------------
    for (const post of posts) {
      try {
        const embedding = await createEmbedding(
          `${post.title}\n${post.content}`
        );
        await index.namespace(websiteId).upsert([
          {
            id: `post-${post.wpId}`,
            values: embedding,
            metadata: {
              type: "post",
              title: post.title,
              url: post.link,
              websiteId,
              dbId: post.id,
              ...(post.excerpt && { excerpt: post.excerpt }),
              ...(post.authorId && { authorId: post.authorId }),
            },
          },
        ]);
        stats.added++;
        stats.details.added.push(`post-${post.wpId}`);
      } catch (error) {
        console.error(`Error vectorizing post ${post.wpId}:`, error);
        stats.errors++;
        stats.details.errors.push({
          id: `post-${post.wpId}`,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // ------------------------------
    //  Vectorize each comment
    // ------------------------------
    for (const post of posts) {
      const comments = (await query(
        `SELECT * FROM WordpressComment WHERE postId = ?`,
        [post.wpId]
      )) as any[];
      for (const comment of comments) {
        try {
          const embedding = await createEmbedding(
            `Comment on post "${post.title}": ${comment.content}`
          );
          await index.namespace(websiteId).upsert([
            {
              id: `comment-${comment.wpId}`,
              values: embedding,
              metadata: {
                type: "comment",
                content: comment.content,
                authorName: comment.authorName,
                postTitle: post.title,
                postUrl: post.link,
                websiteId,
                postId: post.wpId,
                date: comment.date.toISOString(),
              },
            },
          ]);
          stats.added++;
          stats.details.added.push(`comment-${comment.wpId}`);
        } catch (error) {
          console.error(`Error vectorizing comment ${comment.wpId}:`, error);
          stats.errors++;
          stats.details.errors.push({
            id: `comment-${comment.wpId}`,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // ------------------------------
    //  Vectorize each page
    // ------------------------------
    for (const page of pages) {
      try {
        const embedding = await createEmbedding(
          `${page.title}\n${page.content}`
        );
        await index.namespace(websiteId).upsert([
          {
            id: `page-${page.wpId}`,
            values: embedding,
            metadata: {
              type: "page",
              title: page.title,
              url: page.link,
              websiteId,
              dbId: page.id,
            },
          },
        ]);
        stats.added++;
        stats.details.added.push(`page-${page.wpId}`);
      } catch (error) {
        console.error(`Error vectorizing page ${page.wpId}:`, error);
        stats.errors++;
        stats.details.errors.push({
          id: `page-${page.wpId}`,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // ------------------------------
    //  Vectorize each product
    // ------------------------------
    for (const product of products) {
      try {
        const embedding = await createEmbedding(
          `${product.name}\n${product.description}\n${
            product.shortDescription || ""
          }`
        );
        await index.namespace(websiteId).upsert([
          {
            id: `product-${product.wpId}`,
            values: embedding,
            metadata: {
              type: "product",
              name: product.name,
              url: product.permalink,
              websiteId,
              price: product.price,
              dbId: product.id,
              reviewIds: (reviewsByProduct[String(product.wpId)] || []).map(
                (r: any) => `review-${r.wpId}`
              ),
              categoryIds: (categoriesByProduct[String(product.id)] || []).map(
                (c: any) => `category-${c.wpId}`
              ),
              ...(product.shortDescription && {
                shortDescription: product.shortDescription,
              }),
              ...(product.regularPrice && {
                regularPrice: product.regularPrice,
              }),
              ...(product.salePrice && { salePrice: product.salePrice }),
              ...(product.stockQuantity && {
                stockQuantity: product.stockQuantity,
              }),
            },
          },
        ]);
        stats.added++;
        stats.details.added.push(`product-${product.wpId}`);
      } catch (error) {
        console.error(`Error vectorizing product ${product.wpId}:`, error);
        stats.errors++;
        stats.details.errors.push({
          id: `product-${product.wpId}`,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // ------------------------------
    //  Vectorize each product's reviews
    // ------------------------------
    for (const product of products) {
      const reviews = (await query(
        `SELECT * FROM WordpressReview WHERE productId = ?`,
        [product.wpId]
      )) as any[];
      for (const review of reviews) {
        try {
          const embedding = await createEmbedding(
            `Review of product "${product.name}": ${review.review}`
          );
          await index.namespace(websiteId).upsert([
            {
              id: `review-${review.wpId}`,
              values: embedding,
              metadata: {
                type: "review",
                content: review.review,
                rating: review.rating,
                reviewer: review.reviewer,
                productName: product.name,
                productUrl: product.permalink,
                websiteId,
                productId: product.wpId,
                verified: review.verified,
                date: review.date.toISOString(),
              },
            },
          ]);
          stats.added++;
          stats.details.added.push(`review-${review.wpId}`);
        } catch (error) {
          console.error(`Error vectorizing review ${review.wpId}:`, error);
          stats.errors++;
          stats.details.errors.push({
            id: `review-${review.wpId}`,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // Finally, update (or create) the VectorDbConfig row for this website
    await query(
      `INSERT INTO VectorDbConfig (id, websiteId, MainNamespace, QANamespace)
       VALUES (UUID(), ?, ?, ?)
       ON DUPLICATE KEY UPDATE MainNamespace = VALUES(MainNamespace), QANamespace = VALUES(QANamespace)`,
      [websiteId, websiteId, `${websiteId}-qa`]
    );

    return stats;
  } catch (error) {
    console.error("Error vectorizing website content:", error);
    throw error;
  }
}

/**
 * POST /api/your-route
 *
 * Example usage:
 *   fetch("/api/your-route", {
 *     method: "POST",
 *     headers: {
 *       "Content-Type": "application/json",
 *       "Authorization": "Bearer <ACCESS_KEY>"
 *     }
 *   })
 */
export async function POST(request: Request) {
  try {
    // Verify the Bearer token
    const authHeader = request.headers.get("authorization");
    const isTokenValid = await verifyToken(authHeader);

    if (!isTokenValid) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid token" },
        { status: 401 }
      );
    }

    // Get the website ID from the verified token
    const websiteId = await getWebsiteIdFromToken(authHeader);

    if (!websiteId) {
      return NextResponse.json(
        { error: "Could not determine website ID from token" },
        { status: 400 }
      );
    }

    // Find the website using the website ID
    const websiteRows = (await query(
      `SELECT w.* FROM Website w WHERE w.id = ? LIMIT 1`,
      [websiteId]
    )) as any[];
    const website = websiteRows[0];

    if (!website) {
      return NextResponse.json(
        { error: "Website not found" },
        { status: 404 }
      );
    }

    // Rebuild embeddings for that website
    const stats = await addToVectorStore(website.id);

    return NextResponse.json({
      success: true,
      message: "WordPress content vectorized",
      stats,
      timestamp: new Date(),
    });
  } catch (error: any) {
    console.error("Vectorization error:", error);
    return NextResponse.json(
      { error: "Vectorization failed", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/your-route
 *
 * Example usage:
 *   fetch("/api/your-route", {
 *     method: "DELETE",
 *     headers: { "Content-Type": "application/json" },
 *     body: JSON.stringify({ id: "<website_id>" })
 *   })
 */
export async function DELETE(request: Request) {
  try {
    let body: any;
    try {
      body = await request.json();
    } catch (parseErr) {
      console.log("Failed to parse request body:", parseErr);
      return Response.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    if (!body?.id) {
      console.log("Missing website ID in request:", body);
      return Response.json(
        { error: "Missing website 'id' in request body" },
        { status: 400 }
      );
    }

    const { id } = body;
    console.log("Attempting to delete website:", id);

    try {
      // Delete vectors first
      await deleteWebsiteVectors(id);
      console.log("Successfully deleted vectors for website:", id);

      // Delete WordPress data and website
      // Delete comments by joining posts
      await query(
        `DELETE wc FROM WordpressComment wc
         JOIN WordpressPost wp ON wp.wpId = wc.postId
         WHERE wp.websiteId = ?`,
        [id]
      );
      console.log("Deleted WordPress comments");

      // Delete reviews by joining products
      await query(
        `DELETE wr FROM WordpressReview wr
         JOIN WordpressProduct wp ON wp.wpId = wr.productId
         WHERE wp.websiteId = ?`,
        [id]
      );
      console.log("Deleted WordPress reviews");

      // Delete custom fields
      await query(`DELETE FROM WordpressCustomField WHERE websiteId = ?`, [id]);
      console.log("Deleted WordPress custom fields");

      // Finally delete the website (CASCADE removes related rows as defined)
      await query(`DELETE FROM Website WHERE id = ?`, [id]);
      console.log("Successfully deleted website from database");

      return Response.json({ success: true });
    } catch (deleteError) {
      console.error("Error during deletion process:", deleteError);
      return Response.json(
        {
          error: "Failed to delete website",
          details:
            deleteError instanceof Error
              ? deleteError.message
              : String(deleteError),
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Unexpected error in DELETE handler:", error);
    return Response.json(
      {
        error: "Unexpected error occurred",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
