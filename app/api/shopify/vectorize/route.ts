import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Client } from "@opensearch-project/opensearch";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { cors } from "../../../../lib/cors";
import { RecordSparseValues } from "@pinecone-database/pinecone";

// Remove Edge Runtime directive
export const dynamic = "force-dynamic";

const prisma = new PrismaClient();
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: "text-embedding-3-large",
});

// Initialize OpenSearch client
console.log("OpenSearch Configuration:", {
  endpoint: process.env.OPENSEARCH_DOMAIN_ENDPOINT,
  username: process.env.OPENSEARCH_USERNAME,
  hasPassword: !!process.env.OPENSEARCH_PASSWORD,
});

const opensearch = new Client({
  nodes: [process.env.OPENSEARCH_DOMAIN_ENDPOINT!],
  auth: {
    username: process.env.OPENSEARCH_USERNAME!,
    password: process.env.OPENSEARCH_PASSWORD!,
  },
  ssl: {
    rejectUnauthorized: true,
  },
  headers: {
    "Content-Type": "application/json",
  },
  requestTimeout: 30000,
  pingTimeout: 3000,
  maxRetries: 3,
});

// Test OpenSearch connection
opensearch
  .ping()
  .then(() => console.log("✅ OpenSearch connection successful"))
  .catch((error: Error) =>
    console.error("❌ OpenSearch connection failed:", error)
  );

const index = pinecone.index("voicero-hybrid");

// Add test function to verify hybrid search functionality
async function testHybridIndex() {
  try {
    console.log("🔍 Testing connection to hybrid index...");

    // Test 1: Basic connection test
    const stats = await index.describeIndexStats();
    console.log("📊 Index stats:", {
      dimension: stats.dimension,
      namespaces: stats.namespaces,
      totalRecordCount: stats.totalRecordCount,
    });

    // Test 2: Try a hybrid search query
    const testText = "example product with some keywords";
    console.log("\n🔤 Generating test vectors for:", testText);

    // Generate sparse vectors
    const sparseVectors = await generateSparseVectors(testText);
    console.log("📈 Generated sparse vectors - COMPLETE INFO:", {
      nonZeroTerms: sparseVectors.values.length,
      indices: sparseVectors.indices,
      values: sparseVectors.values,
      valueDistribution: {
        min: Math.min(...sparseVectors.values),
        max: Math.max(...sparseVectors.values),
        avg:
          sparseVectors.values.reduce((a, b) => a + b, 0) /
          sparseVectors.values.length,
      },
    });

    // Generate dense vectors
    const embedding = await createEmbedding(testText);
    console.log("🧮 Generated dense embedding - COMPLETE INFO:", {
      length: embedding.length,
      values: embedding,
    });

    // Try hybrid query
    console.log("\n🔎 Testing hybrid search...");
    const searchResponse = await index.query({
      vector: embedding,
      sparseVector: sparseVectors,
      topK: 5,
      includeMetadata: true,
      includeValues: true,
    });

    console.log("✅ Hybrid search results - COMPLETE INFO:", {
      totalMatches: searchResponse.matches.length,
      matches: searchResponse.matches.map((match) => ({
        id: match.id,
        score: match.score,
        metadata: match.metadata,
        sparseValues: match.sparseValues,
        values: match.values,
      })),
    });

    return true;
  } catch (error) {
    console.error("❌ Hybrid index test failed:", error);
    throw error;
  }
}

// Run the test before starting vectorization
testHybridIndex()
  .then(() => console.log("✅ Hybrid index test completed"))
  .catch((error) => console.error("❌ Hybrid index test failed:", error));

// Helper function to clean null values
function cleanNullValues(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map((v) => cleanNullValues(v));
  } else if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v != null)
        .map(([k, v]) => [k, cleanNullValues(v)])
    );
  }
  return obj;
}

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

async function createEmbedding(text: string) {
  const [embedding] = await embeddings.embedDocuments([text]);
  return embedding;
}

async function deleteWebsiteVectors(websiteId: string) {
  try {
    // Get the website's VectorDbConfig
    const website = await prisma.website.findUnique({
      where: { id: websiteId },
      include: {
        VectorDbConfig: true,
      },
    });

    if (!website) {
      throw new Error("Website not found");
    }

    // Get the namespaces from VectorDbConfig or fallback to website ID
    const mainNamespace = website.VectorDbConfig?.MainNamespace || website.id;
    const qaNamespace =
      website.VectorDbConfig?.QANamespace || `${website.id}-qa`;

    // First check default namespace for legacy vectors
    const defaultQuery = await index.query({
      vector: Array(3072).fill(0),
      topK: 100,
      filter: { websiteId: { $eq: websiteId } },
      includeMetadata: true,
    });

    if (defaultQuery.matches.length > 0) {
      const vectorIds = defaultQuery.matches.map((match) => match.id);
      await index.deleteMany(vectorIds);
      console.log(
        `✅ Deleted ${vectorIds.length} legacy vectors for website ${websiteId}`
      );
    }

    // Then check main namespace
    const mainNamespaceQuery = await index.namespace(mainNamespace).query({
      vector: Array(3072).fill(0),
      topK: 1,
      includeMetadata: true,
    });

    if (mainNamespaceQuery.matches.length > 0) {
      await index.namespace(mainNamespace).deleteAll();
      console.log(`✅ Deleted vectors from main namespace ${mainNamespace}`);
    }

    // Finally check QA namespace
    const qaNamespaceQuery = await index.namespace(qaNamespace).query({
      vector: Array(3072).fill(0),
      topK: 1,
      includeMetadata: true,
    });

    if (qaNamespaceQuery.matches.length > 0) {
      await index.namespace(qaNamespace).deleteAll();
      console.log(`✅ Deleted vectors from QA namespace ${qaNamespace}`);
    }
  } catch (error) {
    console.error(`⚠️ Error during vector cleanup:`, error);
  }
}

function cleanContent(content: string): string {
  if (!content) return "";
  return content
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Add a new function to process data in chunks
async function processInChunks<T>(
  items: T[],
  chunkSize: number,
  processor: (item: T) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await Promise.all(chunk.map(processor));
  }
}

// Helper function to extract IDs from HTML
function extractIdsFromHtml(html: string): string[] {
  if (!html) return [];

  // Match both id="..." and id='...' attributes
  const idRegex = /id=["']([^"']+)["']/g;
  const matches = html.matchAll(idRegex);
  return Array.from(matches).map((match) => match[1]);
}

// Add this function before generateSparseVectors
function limitSparseVectorSize(
  sparseVectors: RecordSparseValues,
  maxSize: number = 1000
): RecordSparseValues {
  if (sparseVectors.indices.length <= maxSize) {
    return sparseVectors;
  }

  // Sort by values in descending order
  const sortedIndices = sparseVectors.indices
    .map((index, i) => ({ index, value: sparseVectors.values[i] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, maxSize);

  // Reconstruct the sparse vector with the top terms
  return {
    indices: sortedIndices.map((item) => item.index),
    values: sortedIndices.map((item) => item.value),
  };
}

// Modify the generateSparseVectors function to use the limit
async function generateSparseVectors(
  text: string
): Promise<RecordSparseValues> {
  const indexName = `temp-analysis-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 15)}`;

  console.log(
    "🔍 Generating sparse vectors for text:",
    text.substring(0, 100) + "..."
  );

  try {
    // Check if index exists first
    const indexExists = await opensearch.indices.exists({ index: indexName });
    if (indexExists.body) {
      console.log(`⚠️ Index ${indexName} already exists, deleting...`);
      await opensearch.indices.delete({ index: indexName });
    }

    console.log("📊 Creating temporary OpenSearch index:", indexName);
    // Create index with enhanced analyzer for better tokenization
    await opensearch.indices.create({
      index: indexName,
      body: {
        settings: {
          analysis: {
            analyzer: {
              custom_analyzer: {
                type: "custom",
                tokenizer: "standard",
                filter: [
                  "lowercase",
                  "stop",
                  "porter_stem",
                  "unique",
                  "word_delimiter_graph",
                  "ngram_filter",
                ],
              },
            },
            filter: {
              ngram_filter: {
                type: "ngram",
                min_gram: 3,
                max_gram: 4,
              },
            },
          },
          index: {
            similarity: {
              bm25: {
                type: "BM25",
                b: 0.75,
                k1: 1.2,
                discount_overlaps: true,
              },
            },
          },
        },
        mappings: {
          properties: {
            content: {
              type: "text",
              analyzer: "custom_analyzer",
              similarity: "bm25",
              term_vector: "with_positions_offsets_payloads",
              store: true,
            },
          },
        },
      },
    });

    // Index the document
    console.log("📝 Indexing document...");
    await opensearch.index({
      index: indexName,
      body: {
        content: text,
      },
      refresh: true,
    });

    // Get term vectors with enhanced statistics
    console.log("🔤 Getting term vectors...");
    const response = await opensearch.transport.request({
      method: "GET",
      path: `/${indexName}/_termvectors`,
      body: {
        doc: { content: text },
        fields: ["content"],
        term_statistics: true,
        field_statistics: true,
        positions: true,
        offsets: true,
        filter: {
          max_num_terms: 32000, // AWS recommended limit
          min_term_freq: 1, // Minimum frequency in current doc
          min_doc_freq: 1, // Minimum frequency across all docs
          max_doc_freq: 1000000, // Maximum frequency across all docs
          min_word_length: 2, // Minimum term length
        },
      },
    });

    // Add detailed logging of the response
    console.log("🔍 Term vectors response:", {
      hasTermVectors: !!response.body.term_vectors,
      contentField: !!response.body.term_vectors?.content,
      terms: response.body.term_vectors?.content?.terms
        ? Object.entries(response.body.term_vectors.content.terms)
            .slice(0, 5)
            .map(([term, stats]) => ({
              term,
              stats,
            }))
        : [],
    });

    // Extract terms and calculate BM25-inspired scores
    const terms = response.body.term_vectors?.content?.terms || {};
    const sparseValues: number[] = [];
    const sparseIndices: number[] = [];

    // First pass: calculate document statistics
    const docLength = Object.values(terms).reduce(
      (sum: number, stats: any) => sum + (stats.term_freq || 0),
      0
    );
    const avgDocLength = docLength; // Since we only have one document
    const totalDocs = 1;

    // Calculate BM25-inspired scores for each term
    const termStats = Object.entries(terms).map(([term, stats]) => {
      const tf = (stats as any).term_freq || 0;
      const docFreq = (stats as any).doc_freq || 1;

      // BM25-like scoring formula
      const idf = Math.log(1 + (totalDocs - docFreq + 0.5) / (docFreq + 0.5));
      const k1 = 1.2;
      const b = 0.75;
      const numerator = tf * (k1 + 1);
      const denominator = tf + k1 * (1 - b + b * (docLength / avgDocLength));
      const score = idf * (numerator / denominator);

      return { term, score };
    });

    // Sort by score and take top terms
    const nonZeroTerms = termStats
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 32000); // AWS recommended limit

    if (nonZeroTerms.length === 0) {
      console.warn("No non-zero terms found, using fallback scoring");
      Object.entries(terms)
        .slice(0, 10)
        .forEach(([_, __], idx) => {
          sparseIndices.push(idx);
          sparseValues.push(1.0);
        });
    } else {
      // Use the sorted terms to build sparse vectors
      nonZeroTerms.forEach(({ score }, idx) => {
        sparseIndices.push(idx);
        sparseValues.push(score);
      });

      // Normalize the values to [0, 1] range
      const maxScore = Math.max(...sparseValues);
      if (maxScore > 0) {
        for (let i = 0; i < sparseValues.length; i++) {
          sparseValues[i] = sparseValues[i] / maxScore;
        }
      }
    }

    // After generating the sparse vectors, limit their size
    const limitedSparseVectors = limitSparseVectorSize({
      indices: sparseIndices,
      values: sparseValues,
    });

    console.log("📈 Generated sparse vectors:", {
      totalTerms: Object.keys(terms).length,
      nonZeroTerms: limitedSparseVectors.values.length,
      sampleTerms: nonZeroTerms.slice(0, 5).map((t) => t.term),
      sampleIndices: limitedSparseVectors.indices.slice(0, 5),
      sampleValues: limitedSparseVectors.values.slice(0, 5),
      valueRange:
        limitedSparseVectors.values.length > 0
          ? {
              min: Math.min(...limitedSparseVectors.values),
              max: Math.max(...limitedSparseVectors.values),
              avg:
                limitedSparseVectors.values.reduce((a, b) => a + b, 0) /
                limitedSparseVectors.values.length,
            }
          : null,
    });

    return limitedSparseVectors;
  } catch (error: any) {
    console.error("❌ Error generating sparse vectors:", error);
    if (error.meta) {
      console.error("OpenSearch error details:", {
        statusCode: error.meta.statusCode,
        body: error.meta.body,
        headers: error.meta.headers,
      });
    }
    // Return a default sparse vector instead of empty one
    return {
      indices: [0],
      values: [1],
    };
  } finally {
    try {
      const indexExists = await opensearch.indices.exists({ index: indexName });
      if (indexExists.body) {
        console.log("🧹 Cleaning up temporary index:", indexName);
        await opensearch.indices.delete({ index: indexName });
      }
    } catch (cleanupError) {
      console.error(
        `Failed to clean up temporary index ${indexName}:`,
        cleanupError
      );
    }
  }
}

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
    // Delete old vectors first
    await deleteWebsiteVectors(websiteId);

    // Get all Shopify content for this website
    const products = await prisma.shopifyProduct.findMany({
      where: { websiteId },
      include: {
        variants: true,
        reviews: true,
        images: true,
      },
    });

    const pages = await prisma.shopifyPage.findMany({
      where: { websiteId },
    });

    const blogs = await prisma.shopifyBlog.findMany({
      where: { websiteId },
      include: {
        posts: {
          include: {
            comments: true,
          },
        },
      },
    });

    const discounts = await prisma.shopifyDiscount.findMany({
      where: { websiteId },
    });

    const collections = await prisma.shopifyCollection.findMany({
      where: { websiteId },
      include: {
        products: {
          select: {
            shopifyId: true,
            title: true,
            handle: true,
          },
        },
      },
    });

    console.log("=== COLLECTIONS ===");
    console.log(collections.slice(0, 3));
    console.log("\n=== DISCOUNTS ===");
    console.log(discounts.slice(0, 3));
    console.log("\n=== BLOGS ===");
    console.log(blogs.slice(0, 3));
    console.log("\n=== PAGES ===");
    console.log(pages.slice(0, 3));
    console.log("\n=== PRODUCTS ===");
    console.log(products.slice(0, 3));

    // Process products in chunks of 5 at a time (adjust as needed)
    const processProduct = async (product: any) => {
      try {
        // Skip if not active or not published
        if (product.status !== "ACTIVE" || !product.publishedAt) {
          return;
        }

        console.log(`\n🏷️ Processing product: ${product.title}`);

        const scrapedIds = extractIdsFromHtml(product.scrapedHtml || "");

        // Generate sparse vectors from all product fields except scrapedHtml
        const productText = [
          product.title,
          product.description,
          product.bodyHtml,
          product.vendor,
          "product",
          product.productType,
          product.handle,
          product.status,
          product.publishedAt?.toISOString(),
          product.seo?.title,
          product.seo?.description,
          ...(product.tags || []),
          // Add semantic product characteristics
          product.vendor ? `brand_${product.vendor.toLowerCase()}` : null,
          product.productType
            ? `type_${product.productType.toLowerCase()}`
            : null,
          // Add semantic price descriptions with more natural language
          ...(product.priceRange?.minVariantPrice?.amount
            ? [
                `price_${product.priceRange.minVariantPrice.amount}`,
                // Price ranges with natural language
                product.priceRange.minVariantPrice.amount < 50 ? "cheap" : null,
                product.priceRange.minVariantPrice.amount < 50
                  ? "inexpensive"
                  : null,
                product.priceRange.minVariantPrice.amount < 50
                  ? "budget_friendly"
                  : null,
                product.priceRange.minVariantPrice.amount < 50
                  ? "affordable"
                  : null,
                product.priceRange.minVariantPrice.amount < 100
                  ? "moderately_priced"
                  : null,
                product.priceRange.minVariantPrice.amount < 100
                  ? "reasonably_priced"
                  : null,
                product.priceRange.minVariantPrice.amount < 200
                  ? "mid_range"
                  : null,
                product.priceRange.minVariantPrice.amount < 200
                  ? "standard_price"
                  : null,
                product.priceRange.minVariantPrice.amount >= 200
                  ? "expensive"
                  : null,
                product.priceRange.minVariantPrice.amount >= 200
                  ? "premium"
                  : null,
                product.priceRange.minVariantPrice.amount >= 200
                  ? "luxury"
                  : null,
                // Price categories with natural language
                product.priceRange.minVariantPrice.amount < 50
                  ? "budget_option"
                  : null,
                product.priceRange.minVariantPrice.amount < 50
                  ? "cost_effective"
                  : null,
                product.priceRange.minVariantPrice.amount >= 200
                  ? "high_end"
                  : null,
                product.priceRange.minVariantPrice.amount >= 200
                  ? "premium_quality"
                  : null,
                // Price comparisons with natural language
                product.priceRange.minVariantPrice.amount < 50
                  ? "under_50"
                  : null,
                product.priceRange.minVariantPrice.amount < 50
                  ? "less_than_50"
                  : null,
                product.priceRange.minVariantPrice.amount < 100
                  ? "under_100"
                  : null,
                product.priceRange.minVariantPrice.amount < 100
                  ? "less_than_100"
                  : null,
                product.priceRange.minVariantPrice.amount < 200
                  ? "under_200"
                  : null,
                product.priceRange.minVariantPrice.amount < 200
                  ? "less_than_200"
                  : null,
                product.priceRange.minVariantPrice.amount >= 200
                  ? "over_200"
                  : null,
                product.priceRange.minVariantPrice.amount >= 200
                  ? "more_than_200"
                  : null,
              ]
            : []),
          // Add inventory status with natural language
          product.totalInventory > 0 ? "in_stock" : "out_of_stock",
          product.totalInventory > 0 ? "available_now" : null,
          product.totalInventory > 0 ? "ready_to_ship" : null,
          product.totalInventory > 10 ? "well_stocked" : null,
          product.totalInventory > 10 ? "plenty_available" : null,
          product.totalInventory > 20 ? "plenty_in_stock" : null,
          product.totalInventory > 20 ? "abundant_stock" : null,
          product.totalInventory === 0 ? "sold_out" : null,
          product.totalInventory === 0 ? "currently_unavailable" : null,
          product.totalInventory <= 5 ? "low_stock" : null,
          product.totalInventory <= 5 ? "limited_quantity" : null,
          product.totalInventory <= 5 ? "running_low" : null,
          // Add variant information with natural language
          product.hasOnlyDefaultVariant ? "single_option" : "multiple_options",
          product.hasOnlyDefaultVariant ? "one_size" : "multiple_sizes",
          product.hasOutOfStockVariants
            ? "some_options_out_of_stock"
            : "all_options_available",
          product.hasOutOfStockVariants
            ? "limited_availability"
            : "fully_available",
          // Add product availability with natural language
          product.status === "ACTIVE" ? "available" : null,
          product.status === "ACTIVE" ? "for_sale" : null,
          product.status === "ACTIVE" ? "purchase_available" : null,
          product.status === "ACTIVE" ? "ready_to_buy" : null,
          product.status === "ACTIVE" ? "can_be_purchased" : null,
          // Add product quality indicators with natural language
          ...((product.reviews || []).length > 0
            ? [
                "has_reviews",
                "customer_reviewed",
                ...(product.reviews || []).map((r: any) =>
                  r.rating >= 4 ? "highly_rated" : null
                ),
                ...(product.reviews || []).map((r: any) =>
                  r.rating >= 4 ? "well_reviewed" : null
                ),
                ...(product.reviews || []).map((r: any) =>
                  r.rating >= 4.5 ? "top_rated" : null
                ),
                ...(product.reviews || []).map((r: any) =>
                  r.rating >= 4.5 ? "excellent_rating" : null
                ),
                ...(product.reviews || []).map((r: any) =>
                  r.verified ? "verified_purchase" : null
                ),
                ...(product.reviews || []).map((r: any) =>
                  r.verified ? "authentic_review" : null
                ),
              ]
            : []),
          // Add product characteristics from description with natural language
          ...(product.description
            ? [
                product.description.toLowerCase().includes("new")
                  ? "new_arrival"
                  : null,
                product.description.toLowerCase().includes("new")
                  ? "just_released"
                  : null,
                product.description.toLowerCase().includes("limited")
                  ? "limited_edition"
                  : null,
                product.description.toLowerCase().includes("limited")
                  ? "exclusive_release"
                  : null,
                product.description.toLowerCase().includes("exclusive")
                  ? "exclusive"
                  : null,
                product.description.toLowerCase().includes("exclusive")
                  ? "hard_to_find"
                  : null,
                product.description.toLowerCase().includes("premium")
                  ? "premium"
                  : null,
                product.description.toLowerCase().includes("premium")
                  ? "high_quality"
                  : null,
                product.description.toLowerCase().includes("best")
                  ? "best_seller"
                  : null,
                product.description.toLowerCase().includes("best")
                  ? "top_seller"
                  : null,
                product.description.toLowerCase().includes("popular")
                  ? "popular"
                  : null,
                product.description.toLowerCase().includes("popular")
                  ? "in_demand"
                  : null,
                product.description.toLowerCase().includes("trending")
                  ? "trending"
                  : null,
                product.description.toLowerCase().includes("trending")
                  ? "hot_item"
                  : null,
              ]
            : []),
          // Add product features from variants
          ...(product.variants || []).map((v: any) => v.title).join(" "),
          ...(product.variants || []).map((v: any) => v.sku).join(" "),
          ...(product.variants || [])
            .map((v: any) => v.price?.toString())
            .join(" "),
          ...(product.variants || [])
            .map((v: any) => v.inventory?.toString())
            .join(" "),
          // Add raw data for exact matches
          product.priceRange?.minVariantPrice?.amount?.toString(),
          product.priceRange?.maxVariantPrice?.amount?.toString(),
          product.totalInventory?.toString(),
          product.tracksInventory?.toString(),
          product.hasOnlyDefaultVariant?.toString(),
          product.hasOutOfStockVariants?.toString(),
          // Add review content
          ...(product.reviews || []).map((r: any) => r.title),
          ...(product.reviews || []).map((r: any) => r.body),
          ...(product.reviews || []).map((r: any) => r.reviewer),
          ...(product.reviews || []).map((r: any) => r.rating?.toString()),
        ]
          .filter(Boolean)
          .join(" ");

        console.log("📝 Generated product text length:", productText.length);

        const sparseVectors = await generateSparseVectors(productText);
        console.log("✨ Generated sparse vectors for product:", {
          productId: product.shopifyId,
          sparseVectorsLength: sparseVectors.indices.length,
        });

        const productData = cleanNullValues({
          title: product.title || "",
          handle: product.handle || "",
          vendor: product.vendor || "",
          type: "product",
          productType: product.productType || "",
          description: product.description || "",
          bodyHtml: product.bodyHtml || "",
          tags: product.tags || [],
          publishedAt: product.publishedAt?.toISOString() || "",
          status: product.status || "",
          seoTitle: product.seo?.title || "",
          seoDescription: product.seo?.description || "",
          priceRangeMin: product.priceRange?.minVariantPrice?.amount || 0,
          priceRangeMax: product.priceRange?.maxVariantPrice?.amount || 0,
          totalInventory: product.totalInventory || 0,
          tracksInventory: product.tracksInventory || false,
          hasOnlyDefaultVariant: product.hasOnlyDefaultVariant || false,
          hasOutOfStockVariants: product.hasOutOfStockVariants || false,
          variantTitles: (product.variants || []).map(
            (v: any) => v.title || ""
          ),
          variantPrices: (product.variants || []).map((v: any) =>
            (v.price || 0).toString()
          ),
          variantSkus: (product.variants || []).map((v: any) => v.sku || ""),
          variantInventories: (product.variants || []).map((v: any) =>
            (v.inventory || 0).toString()
          ),
          scrapedIds,
        });

        const embedding = await createEmbedding(JSON.stringify(productData));
        console.log("🔤 Generated embedding length:", embedding.length);

        console.log("⬆️ Upserting to Pinecone...", {
          id: `product-${product.shopifyId}`,
          embeddingLength: embedding.length,
          sparseValuesLength: sparseVectors.values.length,
          sparseIndicesLength: sparseVectors.indices.length,
        });

        await index.namespace(websiteId).upsert([
          {
            id: `product-${product.shopifyId}`,
            values: embedding,
            sparseValues: sparseVectors,
            metadata: {
              ...productData,
              type: "product",
              productId: product.shopifyId.toString(),
            },
          },
        ]);

        console.log("✅ Successfully upserted product to Pinecone");

        stats.added++;
        stats.details.added.push(`product-${product.shopifyId}`);
      } catch (error: any) {
        console.error(
          `❌ Error vectorizing product ${product.shopifyId}:`,
          error
        );
        stats.errors++;
        stats.details.errors.push({
          id: `product-${product.shopifyId}`,
          error: error.message,
        });
      }
    };

    // Process in chunks
    await processInChunks(products, 5, processProduct);

    // Process reviews in chunks
    const allReviews = products.flatMap((product) =>
      (product.reviews || []).map((review) => ({ review, product }))
    );

    const processReview = async ({
      review,
      product,
    }: {
      review: any;
      product: any;
    }) => {
      try {
        const reviewData = {
          type: "review",
          title: review.title,
          body: review.body,
          rating: review.rating?.toString(),
          reviewer: review.reviewer,
          productId: product.shopifyId.toString(),
          productTitle: product.title,
          createdAt: review.createdAt?.toISOString(),
          updatedAt: review.updatedAt?.toISOString(),
        };

        // Generate sparse vectors for review
        const reviewText = [
          review.title,
          review.body,
          review.rating?.toString(),
          review.reviewer,
          review.productTitle,
        ]
          .filter(Boolean)
          .join(" ");
        const sparseVectors = await generateSparseVectors(reviewText);

        const embedding = await createEmbedding(JSON.stringify(reviewData));

        await index.namespace(websiteId).upsert([
          {
            id: `review-${review.shopifyId}`,
            values: embedding,
            sparseValues: sparseVectors,
            metadata: {
              ...reviewData,
              type: "review",
              websiteId,
              createdAt: review.createdAt?.toISOString() || "",
            },
          },
        ]);
        stats.added++;
        stats.details.added.push(`review-${review.shopifyId}`);
      } catch (error: any) {
        console.error(`Error vectorizing review ${review.shopifyId}:`, error);
        stats.errors++;
        stats.details.errors.push({
          id: `review-${review.shopifyId}`,
          error: error.message,
        });
      }
    };

    await processInChunks(allReviews, 10, processReview);

    // Process pages in chunks
    const processPage = async (page: any) => {
      try {
        // Add detailed logging of page data
        console.log(`\n🔍 Page Data for ${page.title}:`, {
          id: page.shopifyId,
          handle: page.handle,
          isPublished: page.isPublished,
          publishedAt: page.publishedAt,
          hasContent: !!page.content,
          contentLength: page.content?.length,
          hasScrapedHtml: !!page.scrapedHtml,
          scrapedHtmlLength: page.scrapedHtml?.length,
          templateSuffix: page.templateSuffix,
          metafields: page.metafields?.length || 0,
        });

        // Skip if not published, unless it's the Home page
        if (!page.publishedAt && page.handle !== "/") {
          console.log(
            `⏭️ Skipping unpublished page: ${page.title} (${page.handle})`
          );
          return;
        }

        const scrapedIds = extractIdsFromHtml(page.scrapedHtml || "");

        // Generate sparse vectors from all page fields with semantic terms
        const pageText = [
          page.title,
          page.handle,
          "page",
          page.content,
          page.bodySummary,
          page.publishedAt?.toISOString(),
          page.isPublished?.toString(),
          page.templateSuffix,
          // Add semantic page characteristics
          `page_${page.title.toLowerCase()}`,
          // Add page status indicators with natural language
          page.publishedAt ? "published" : "draft",
          page.publishedAt ? "live" : "unpublished",
          page.publishedAt ? "public" : "private",
          page.publishedAt ? "available" : "not_available",
          // Add page type indicators with natural language
          page.templateSuffix ? `template_${page.templateSuffix}` : null,
          page.templateSuffix ? `page_type_${page.templateSuffix}` : null,
          page.templateSuffix ? `layout_${page.templateSuffix}` : null,
          // Add content type indicators with natural language
          page.handle === "contact" ? "contact_page" : null,
          page.handle === "contact" ? "get_in_touch" : null,
          page.handle === "about" ? "about_page" : null,
          page.handle === "about" ? "about_us" : null,
          page.handle === "about" ? "our_story" : null,
          page.handle === "faq" ? "faq_page" : null,
          page.handle === "faq" ? "frequently_asked_questions" : null,
          page.handle === "faq" ? "help_center" : null,
          page.handle === "shipping" ? "shipping_info" : null,
          page.handle === "shipping" ? "delivery_information" : null,
          page.handle === "shipping" ? "shipping_policy" : null,
          page.handle === "returns" ? "returns_policy" : null,
          page.handle === "returns" ? "refund_policy" : null,
          page.handle === "returns" ? "return_information" : null,
          page.handle === "privacy" ? "privacy_policy" : null,
          page.handle === "privacy" ? "privacy_information" : null,
          page.handle === "privacy" ? "data_protection" : null,
          // Add content characteristics with natural language
          page.publishedAt ? "new_content" : null,
          page.publishedAt ? "fresh_content" : null,
          page.publishedAt ? "just_published" : null,
          page.updatedAt ? "recently_updated" : null,
          page.updatedAt ? "just_updated" : null,
          page.updatedAt ? "latest_version" : null,
          // Add page importance indicators with natural language
          page.handle === "index" ? "homepage" : null,
          page.handle === "index" ? "main_page" : null,
          page.handle === "index" ? "landing_page" : null,
          // Add content structure indicators with natural language
          page.content?.includes("##") ? "has_sections" : null,
          page.content?.includes("##") ? "well_organized" : null,
          page.content?.includes("##") ? "structured_content" : null,
          // Add content length indicators with natural language
          page.content?.length > 1000 ? "detailed_page" : null,
          page.content?.length > 1000 ? "comprehensive" : null,
          page.content?.length > 2000 ? "extensive_content" : null,
          page.content?.length > 2000 ? "in_depth" : null,
          page.content?.length < 500 ? "brief_page" : null,
          page.content?.length < 500 ? "concise" : null,
          // Add temporal indicators with natural language
          page.publishedAt ? "recent_page" : null,
          page.publishedAt ? "new_page" : null,
          page.publishedAt ? "latest_page" : null,
          page.publishedAt ? "fresh_page" : null,
          // Add page status indicators with natural language
          page.publishedAt ? "active_page" : null,
          page.publishedAt ? "publicly_available" : null,
          page.publishedAt ? "accessible" : null,
          // Add content type specific terms with natural language
          page.handle === "support" ? "support_page" : null,
          page.handle === "support" ? "help_page" : null,
          page.handle === "support" ? "customer_support" : null,
          page.handle === "support" ? "get_help" : null,
          // Add metafields with semantic context
          ...(page.metafields?.map(
            (metafield: { namespace: string; key: string }) =>
              `${metafield.namespace}_${metafield.key.toLowerCase()}`
          ) || []),
        ]
          .filter(Boolean)
          .join(" ");

        const sparseVectors = await generateSparseVectors(pageText);

        const pageData = cleanNullValues({
          title: page.title || "",
          handle: page.handle || "",
          content: cleanContent(page.content || ""),
          type: "page",
          bodySummary: page.bodySummary || "",
          publishedAt: page.publishedAt?.toISOString() || "",
          isPublished: page.isPublished || false,
          templateSuffix: page.templateSuffix || "",
          metafieldNamespaces: (page.metafields || []).map(
            (m: any) => m.namespace || ""
          ),
          metafieldKeys: (page.metafields || []).map((m: any) => m.key || ""),
          metafieldValues: (page.metafields || []).map(
            (m: any) => m.value || ""
          ),
          scrapedIds,
        });

        const embedding = await createEmbedding(JSON.stringify(pageData));

        await index.namespace(websiteId).upsert([
          {
            id: `page-${page.shopifyId}`,
            values: embedding,
            sparseValues: sparseVectors,
            metadata: {
              ...pageData,
              type: "page",
              pageId: page.shopifyId.toString(),
            },
          },
        ]);
        stats.added++;
        stats.details.added.push(`page-${page.shopifyId}`);
      } catch (error: any) {
        console.error(`Error vectorizing page ${page.shopifyId}:`, error);
        stats.errors++;
        stats.details.errors.push({
          id: `page-${page.shopifyId}`,
          error: error.message,
        });
      }
    };

    await processInChunks(pages, 5, processPage);

    // Process blog posts in chunks
    const allBlogPosts = blogs.flatMap((blog) =>
      (blog.posts || []).map((post) => ({ post, blog }))
    );

    const processBlogPost = async ({
      post,
      blog,
    }: {
      post: any;
      blog: any;
    }) => {
      try {
        // Skip if not published
        if (!post.isPublished) {
          return;
        }

        const scrapedIds = extractIdsFromHtml(post.scrapedHtml || "");

        // Generate sparse vectors from all blog post fields with semantic terms
        const postText = [
          blog.title,
          blog.handle,
          post.title,
          post.content,
          "post",
          post.author,
          post.image,
          post.isPublished?.toString(),
          post.handle,
          post.publishedAt?.toISOString(),
          post.summary,
          ...(post.tags || []),
          post.templateSuffix,
          // Add semantic blog characteristics
          `blog_${blog.title.toLowerCase()}`,
          `author_${post.author.toLowerCase()}`,
          // Add post status indicators with natural language
          post.publishedAt ? "published" : "draft",
          post.publishedAt ? "live" : "unpublished",
          post.publishedAt ? "public" : "private",
          post.publishedAt ? "available" : "not_available",
          // Add content type indicators with natural language
          post.content?.toLowerCase().includes("how to") ? "tutorial" : null,
          post.content?.toLowerCase().includes("how to")
            ? "how_to_guide"
            : null,
          post.content?.toLowerCase().includes("how to")
            ? "step_by_step"
            : null,
          post.content?.toLowerCase().includes("review")
            ? "product_review"
            : null,
          post.content?.toLowerCase().includes("review") ? "item_review" : null,
          post.content?.toLowerCase().includes("news") ? "news_article" : null,
          post.content?.toLowerCase().includes("news") ? "latest_news" : null,
          post.content?.toLowerCase().includes("interview")
            ? "interview"
            : null,
          post.content?.toLowerCase().includes("interview") ? "q_and_a" : null,
          post.content?.toLowerCase().includes("case study")
            ? "case_study"
            : null,
          post.content?.toLowerCase().includes("case study")
            ? "success_story"
            : null,
          post.content?.toLowerCase().includes("vs") ? "comparison" : null,
          post.content?.toLowerCase().includes("vs") ? "versus" : null,
          // Add content characteristics with natural language
          post.publishedAt ? "new_content" : null,
          post.publishedAt ? "fresh_content" : null,
          post.publishedAt ? "just_published" : null,
          post.updatedAt ? "recently_updated" : null,
          post.updatedAt ? "just_updated" : null,
          post.updatedAt ? "latest_version" : null,
          post.tags?.includes("featured") ? "featured_post" : null,
          post.tags?.includes("featured") ? "highlighted_post" : null,
          post.tags?.includes("featured") ? "spotlight_post" : null,
          // Add engagement indicators with natural language
          post.comments?.length ? "has_comments" : null,
          post.comments?.length ? "discussed" : null,
          post.comments?.length > 10 ? "highly_commented" : null,
          post.comments?.length > 10 ? "popular_discussion" : null,
          post.comments?.length > 50 ? "very_popular" : null,
          post.comments?.length > 50 ? "viral_post" : null,
          // Add content quality indicators with natural language
          post.content?.length > 1000 ? "long_form" : null,
          post.content?.length > 1000 ? "detailed_article" : null,
          post.content?.length > 2000 ? "in_depth" : null,
          post.content?.length > 2000 ? "comprehensive_guide" : null,
          post.content?.length < 500 ? "quick_read" : null,
          post.content?.length < 500 ? "brief_article" : null,
          // Add temporal indicators with natural language
          post.publishedAt ? "recent_post" : null,
          post.publishedAt ? "new_article" : null,
          post.publishedAt ? "latest_post" : null,
          post.publishedAt ? "fresh_content" : null,
          // Add content structure indicators with natural language
          post.content?.includes("##") ? "has_sections" : null,
          post.content?.includes("##") ? "well_organized" : null,
          post.content?.includes("##") ? "structured_content" : null,
          post.content?.includes("```") ? "has_code" : null,
          post.content?.includes("```") ? "code_examples" : null,
          post.content?.includes("```") ? "technical_content" : null,
          // Add media indicators with natural language
          post.image ? "has_image" : null,
          post.image ? "visual_content" : null,
          post.image ? "illustrated_post" : null,
          post.image ? "with_photos" : null,
          // Add topic indicators with natural language
          ...(post.tags?.map((tag: string) => `topic_${tag.toLowerCase()}`) ||
            []),
          ...(post.tags?.map((tag: string) => `about_${tag.toLowerCase()}`) ||
            []),
          ...(post.tags?.map(
            (tag: string) => `category_${tag.toLowerCase()}`
          ) || []),
          // Add metafields with semantic context
          ...(post.metafields?.map(
            (metafield: { namespace: string; key: string }) =>
              `${metafield.namespace}_${metafield.key.toLowerCase()}`
          ) || []),
          // Add all comments with semantic context
          ...(post.comments?.map(
            (comment: { author: string }) =>
              `comment_${comment.author.toLowerCase()}`
          ) || []),
        ]
          .filter(Boolean)
          .join(" ");

        const sparseVectors = await generateSparseVectors(postText);

        const postData = cleanNullValues({
          blogTitle: blog.title || "",
          blogHandle: blog.handle || "",
          type: "post",
          title: post.title || "",
          content: cleanContent(post.content || ""),
          author: post.author || "",
          image: post.image || "",
          isPublished: post.isPublished || false,
          handle: post.handle || "",
          publishedAt: post.publishedAt?.toISOString() || "",
          summary: post.summary || "",
          tags: post.tags || [],
          templateSuffix: post.templateSuffix || "",
          metafieldNamespaces: (post.metafields || []).map(
            (m: any) => m.namespace || ""
          ),
          metafieldKeys: (post.metafields || []).map((m: any) => m.key || ""),
          metafieldValues: (post.metafields || []).map(
            (m: any) => m.value || ""
          ),
          scrapedIds,
          // Include comments in both structured and flat format for consistency
          comments: (post.comments || []).map((c: any) => ({
            body: c.body || "",
            author: c.author || "",
          })),
          commentBodies: (post.comments || []).map((c: any) => c.body || ""),
          commentAuthors: (post.comments || []).map((c: any) => c.author || ""),
        });

        const embedding = await createEmbedding(JSON.stringify(postData));

        await index.namespace(websiteId).upsert([
          {
            id: `post-${post.shopifyId}`,
            values: embedding,
            sparseValues: sparseVectors,
            metadata: {
              ...postData,
              type: "post",
              postId: post.shopifyId.toString(),
              blogId: blog.shopifyId.toString(),
              commentIds: (post.comments || []).map((c: any) =>
                c.shopifyId.toString()
              ),
              commentAuthors: (post.comments || []).map(
                (c: any) => c.author || ""
              ),
              commentBodies: (post.comments || []).map(
                (c: any) => c.body || ""
              ),
            },
          },
        ]);
        stats.added++;
        stats.details.added.push(`post-${post.shopifyId}`);
      } catch (error: any) {
        console.error(`Error vectorizing post ${post.shopifyId}:`, error);
        stats.errors++;
        stats.details.errors.push({
          id: `post-${post.shopifyId}`,
          error: error.message,
        });
      }
    };

    await processInChunks(allBlogPosts, 5, processBlogPost);

    // Process collections in chunks
    const processCollection = async (collection: any) => {
      try {
        const scrapedIds = extractIdsFromHtml(collection.scrapedHtml || "");

        // Safely stringify ruleSet and handle any potential circular references
        let ruleSetString = "";
        try {
          ruleSetString = collection.ruleSet
            ? JSON.stringify(collection.ruleSet)
            : "";
        } catch (e) {
          console.warn(
            `Failed to stringify ruleSet for collection ${collection.shopifyId}:`,
            e
          );
        }

        // Generate sparse vectors from all collection fields
        const collectionText = [
          collection.title,
          collection.handle,
          "collection",
          collection.description,
          collection.image?.url,
          collection.image?.alt,
          ruleSetString,
          collection.sortOrder,
          collection.updatedAt?.toISOString(),
          // Add semantic collection characteristics
          collection.title
            ? `collection_${collection.title.toLowerCase()}`
            : null,
          // Add collection type indicators with natural language
          collection.description?.toLowerCase().includes("new")
            ? "new_collection"
            : null,
          collection.description?.toLowerCase().includes("new")
            ? "just_released"
            : null,
          collection.description?.toLowerCase().includes("new")
            ? "latest_collection"
            : null,
          collection.description?.toLowerCase().includes("featured")
            ? "featured_collection"
            : null,
          collection.description?.toLowerCase().includes("featured")
            ? "highlighted_collection"
            : null,
          collection.description?.toLowerCase().includes("featured")
            ? "showcased_collection"
            : null,
          collection.description?.toLowerCase().includes("popular")
            ? "popular_collection"
            : null,
          collection.description?.toLowerCase().includes("popular")
            ? "in_demand_collection"
            : null,
          collection.description?.toLowerCase().includes("popular")
            ? "well_loved_collection"
            : null,
          collection.description?.toLowerCase().includes("trending")
            ? "trending_collection"
            : null,
          collection.description?.toLowerCase().includes("trending")
            ? "hot_collection"
            : null,
          collection.description?.toLowerCase().includes("trending")
            ? "current_trend"
            : null,
          // Add collection size indicators with natural language
          ...((collection.products || []).length > 0
            ? [
                "has_products",
                "contains_items",
                "includes_products",
                (collection.products || []).length > 10
                  ? "large_collection"
                  : null,
                (collection.products || []).length > 10
                  ? "extensive_collection"
                  : null,
                (collection.products || []).length > 10
                  ? "comprehensive_collection"
                  : null,
                (collection.products || []).length > 20
                  ? "extensive_collection"
                  : null,
                (collection.products || []).length > 20
                  ? "vast_collection"
                  : null,
                (collection.products || []).length > 20
                  ? "wide_selection"
                  : null,
              ]
            : []),
          // Add collection characteristics with natural language
          collection.description?.toLowerCase().includes("seasonal")
            ? "seasonal_collection"
            : null,
          collection.description?.toLowerCase().includes("seasonal")
            ? "time_of_year"
            : null,
          collection.description?.toLowerCase().includes("limited")
            ? "limited_collection"
            : null,
          collection.description?.toLowerCase().includes("limited")
            ? "exclusive_collection"
            : null,
          collection.description?.toLowerCase().includes("exclusive")
            ? "exclusive_collection"
            : null,
          collection.description?.toLowerCase().includes("exclusive")
            ? "special_collection"
            : null,
          // Add collection purpose indicators
          collection.description?.toLowerCase().includes("gift")
            ? "gift_collection"
            : null,
          collection.description?.toLowerCase().includes("gift")
            ? "gift_ideas"
            : null,
          collection.description?.toLowerCase().includes("sale")
            ? "sale_collection"
            : null,
          collection.description?.toLowerCase().includes("sale")
            ? "discounted_items"
            : null,
          collection.description?.toLowerCase().includes("clearance")
            ? "clearance_collection"
            : null,
          collection.description?.toLowerCase().includes("clearance")
            ? "final_sale"
            : null,
          // Add product titles and handles
          ...(collection.products || []).map((p: any) => p.title),
          ...(collection.products || []).map((p: any) => p.handle),
        ]
          .filter(Boolean)
          .join(" ");

        const sparseVectors = await generateSparseVectors(collectionText);

        const collectionData = cleanNullValues({
          title: collection.title || "",
          type: "collection",
          handle: collection.handle || "",
          description: collection.description || "",
          imageUrl: collection.image?.url || "",
          imageAlt: collection.image?.alt || "",
          ruleSet: ruleSetString,
          sortOrder: collection.sortOrder || "",
          updatedAt: collection.updatedAt?.toISOString() || "",
          productTitles: (collection.products || []).map(
            (p: any) => p.title || ""
          ),
          productHandles: (collection.products || []).map(
            (p: any) => p.handle || ""
          ),
          scrapedIds,
        });

        const embedding = await createEmbedding(JSON.stringify(collectionData));

        await index.namespace(websiteId).upsert([
          {
            id: `collection-${collection.shopifyId}`,
            values: embedding,
            sparseValues: sparseVectors,
            metadata: {
              ...collectionData,
              type: "collection",
              collectionId: collection.shopifyId.toString(),
              productIds: (collection.products || []).map((p: any) =>
                p.shopifyId.toString()
              ),
            },
          },
        ]);
        stats.added++;
        stats.details.added.push(`collection-${collection.shopifyId}`);
      } catch (error: any) {
        console.error(
          `Error vectorizing collection ${collection.shopifyId}:`,
          error
        );
        stats.errors++;
        stats.details.errors.push({
          id: `collection-${collection.shopifyId}`,
          error: error.message,
        });
      }
    };

    await processInChunks(collections, 5, processCollection);

    // Process discounts in chunks
    const processDiscount = async (discount: any) => {
      try {
        // Skip if expired
        if (discount.status === "EXPIRED") {
          return;
        }

        // Generate sparse vectors from all discount fields
        const discountText = [
          discount.title,
          discount.code,
          discount.value,
          discount.appliesTo,
          discount.startsAt?.toISOString(),
          discount.endsAt?.toISOString(),
          discount.status,
          "discount",
          // Add semantic discount characteristics
          discount.status === "ACTIVE" ? "active_discount" : null,
          discount.status === "ACTIVE" ? "current_discount" : null,
          discount.status === "ACTIVE" ? "valid_discount" : null,
          discount.status === "EXPIRED" ? "expired_discount" : null,
          discount.status === "EXPIRED" ? "ended_discount" : null,
          discount.status === "EXPIRED" ? "past_discount" : null,
          discount.status === "SCHEDULED" ? "upcoming_discount" : null,
          discount.status === "SCHEDULED" ? "future_discount" : null,
          discount.status === "SCHEDULED" ? "scheduled_discount" : null,
          // Add discount type indicators with natural language
          discount.value?.includes("%") ? "percentage_off" : "fixed_amount_off",
          discount.value?.includes("%")
            ? "percentage_discount"
            : "fixed_discount",
          discount.value?.includes("%")
            ? "percent_reduction"
            : "fixed_reduction",
          discount.value?.includes("%")
            ? "percentage_savings"
            : "fixed_savings",
          // Add timing indicators with natural language
          discount.startsAt ? "limited_time" : null,
          discount.startsAt ? "time_limited" : null,
          discount.startsAt ? "temporary_offer" : null,
          discount.startsAt ? "special_period" : null,
          discount.endsAt ? "expires_soon" : null,
          discount.endsAt ? "limited_availability" : null,
          discount.endsAt ? "ending_soon" : null,
          discount.endsAt ? "final_chance" : null,
          // Add value-based indicators with natural language
          discount.value?.includes("%") ? `save_${discount.value}` : null,
          discount.value?.includes("%") ? `discount_${discount.value}` : null,
          discount.value?.includes("%") ? `reduction_${discount.value}` : null,
          discount.value?.includes("%") ? `savings_${discount.value}` : null,
          // Add status descriptions with natural language
          discount.status === "ACTIVE" ? "currently_active" : null,
          discount.status === "ACTIVE" ? "valid_now" : null,
          discount.status === "ACTIVE" ? "can_be_used" : null,
          discount.status === "ACTIVE" ? "ready_to_use" : null,
          discount.status === "ACTIVE" ? "available_now" : null,
          // Add promotional terms with natural language
          "promotion",
          "special_offer",
          "deal",
          "savings",
          "discount_code",
          "money_off",
          "price_reduction",
          "special_price",
          "bargain",
          "special_deal",
          // Add urgency indicators with natural language
          discount.endsAt ? "expires_soon" : null,
          discount.endsAt ? "limited_availability" : null,
          discount.endsAt ? "ending_soon" : null,
          discount.endsAt ? "final_chance" : null,
          discount.endsAt ? "last_chance" : null,
          discount.endsAt ? "don't_miss_out" : null,
          // Add scope indicators with natural language
          discount.appliesTo
            ? `applies_to_${discount.appliesTo.toLowerCase()}`
            : null,
          discount.appliesTo
            ? `valid_for_${discount.appliesTo.toLowerCase()}`
            : null,
          discount.appliesTo
            ? `discount_on_${discount.appliesTo.toLowerCase()}`
            : null,
          discount.appliesTo
            ? `savings_on_${discount.appliesTo.toLowerCase()}`
            : null,
          // Add seasonal indicators
          discount.title?.toLowerCase().includes("summer")
            ? "summer_sale"
            : null,
          discount.title?.toLowerCase().includes("winter")
            ? "winter_sale"
            : null,
          discount.title?.toLowerCase().includes("spring")
            ? "spring_sale"
            : null,
          discount.title?.toLowerCase().includes("fall") ? "fall_sale" : null,
          discount.title?.toLowerCase().includes("holiday")
            ? "holiday_sale"
            : null,
          discount.title?.toLowerCase().includes("black_friday")
            ? "black_friday"
            : null,
          discount.title?.toLowerCase().includes("cyber_monday")
            ? "cyber_monday"
            : null,
        ]
          .filter(Boolean)
          .join(" ");

        const sparseVectors = await generateSparseVectors(discountText);

        const discountData = cleanNullValues({
          title: discount.title || "",
          code: discount.code || "",
          value: discount.value || "",
          type: "discount",
          appliesTo: discount.appliesTo || "",
          startsAt: discount.startsAt?.toISOString() || "",
          endsAt: discount.endsAt?.toISOString() || "",
          status: discount.status || "",
        });

        const embedding = await createEmbedding(JSON.stringify(discountData));

        await index.namespace(websiteId).upsert([
          {
            id: `discount-${discount.shopifyId}`,
            values: embedding,
            sparseValues: sparseVectors,
            metadata: {
              ...discountData,
              type: "discount",
              discountId: discount.shopifyId.toString(),
            },
          },
        ]);
        stats.added++;
        stats.details.added.push(`discount-${discount.shopifyId}`);
      } catch (error: any) {
        console.error(
          `Error vectorizing discount ${discount.shopifyId}:`,
          error
        );
        stats.errors++;
        stats.details.errors.push({
          id: `discount-${discount.shopifyId}`,
          error: error.message,
        });
      }
    };

    await processInChunks(discounts, 5, processDiscount);

    console.log(`✅ Added ${stats.added} vectors for website ${websiteId}`);
    if (stats.errors > 0) {
      console.log(`⚠️ Encountered ${stats.errors} errors during vectorization`);
    }

    // Update VectorDbConfig
    await prisma.website.update({
      where: { id: websiteId },
      data: {
        VectorDbConfig: {
          upsert: {
            create: {
              MainNamespace: websiteId,
              QANamespace: `${websiteId}-qa`,
            },
            update: {
              MainNamespace: websiteId,
              QANamespace: `${websiteId}-qa`,
            },
          },
        },
      },
    });

    return stats;
  } catch (error) {
    console.error("Error vectorizing website content:", error);
    throw error;
  }
}

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  let response;

  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      response = NextResponse.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    } else {
      const accessKey = authHeader.split(" ")[1];
      if (!accessKey) {
        response = NextResponse.json(
          { error: "No access key provided" },
          { status: 401 }
        );
      } else {
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
          response = NextResponse.json(
            { error: "Invalid access key" },
            { status: 401 }
          );
        } else {
          const stats = await addToVectorStore(website.id);
          response = NextResponse.json({
            success: true,
            message: "Shopify content vectorized",
            stats,
            timestamp: new Date(),
          });
        }
      }
    }
  } catch (error: any) {
    response = NextResponse.json(
      { error: "Vectorization failed", details: error.message },
      { status: 500 }
    );
  }

  // Apply CORS headers to the response
  return cors(request, response);
}
