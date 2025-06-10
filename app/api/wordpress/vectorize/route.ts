import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Client } from "@opensearch-project/opensearch";
import { RecordSparseValues } from "@pinecone-database/pinecone";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: "text-embedding-3-large",
});

// Initialize OpenAI for content enhancement
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize OpenSearch client for sparse vectors
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

const index = pinecone.index(process.env.PINECONE_INDEX!);

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
    const testText = "example wordpress content with some keywords";
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

// Function to limit sparse vector size
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

// Function to generate sparse vectors using OpenSearch
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
 * Recursively removes null and undefined values from an object
 * to prevent Pinecone errors with null metadata values
 */
function sanitizeMetadata(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};

  Object.entries(obj).forEach(([key, value]) => {
    // Skip null and undefined values
    if (value === null || value === undefined) {
      return;
    }

    // Recursively clean nested objects
    if (typeof value === "object" && !Array.isArray(value)) {
      result[key] = sanitizeMetadata(value);
    } else {
      // For arrays and primitives, just copy the value
      result[key] = value;
    }
  });

  return result;
}

async function createEmbedding(text: string) {
  // Make sure text is not empty/null - provide a default value if needed
  const safeText = text || "empty content";
  const [embedding] = await embeddings.embedDocuments([safeText]);
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
      console.error(`⚠️ Website ${websiteId} not found`);
      return;
    }

    // Get the QA namespace from VectorDbConfig or fallback to website ID
    const qaNamespace =
      website.VectorDbConfig?.QANamespace || `${websiteId}-qa`;
    // Get the main namespace from VectorDbConfig or fallback to website ID
    const mainNamespace = website.VectorDbConfig?.MainNamespace || websiteId;

    console.log(`Using namespaces for deletion: 
    - Main namespace: ${mainNamespace}
    - QA namespace: ${qaNamespace}`);

    // First check default namespace for legacy vectors
    const defaultQuery = await index.query({
      vector: Array(3072).fill(0),
      topK: 100,
      filter: { websiteId: { $eq: websiteId } },
      includeMetadata: true,
    });

    // Delete legacy vectors by ID if found
    if (defaultQuery.matches.length > 0) {
      const vectorIds = defaultQuery.matches.map((match) => match.id);
      await index.deleteMany(vectorIds);
      console.log(
        `✅ Deleted ${vectorIds.length} legacy vectors from default namespace for website ${websiteId}`
      );
    }

    // Delete vectors from the main namespace
    await index.namespace(mainNamespace).deleteAll();
    console.log(`✅ Deleted vectors from main namespace ${mainNamespace}`);

    // Delete vectors from the QA namespace
    await index.namespace(qaNamespace).deleteAll();
    console.log(`✅ Deleted vectors from QA namespace ${qaNamespace}`);

    console.log(`✅ Vector cleanup completed for website ${websiteId}`);
  } catch (error) {
    console.error(`⚠️ Error during vector cleanup:`, error);
  }
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

// Enhanced function to generate AI content description for all pages
async function generateContentDescription(
  title: string,
  url: string,
  type: string,
  contentText: string | null
): Promise<any | null> {
  try {
    const cleanedContentText = contentText || "";
    // Check if this is a minimal content page
    const isMinimalContent = Boolean(
      !cleanedContentText ||
        cleanedContentText.trim().length < 50 ||
        cleanedContentText.match(/^\[.*\]$/)
    );

    console.log(
      `Generating metadata for page: ${url}, minimal content: ${isMinimalContent}, type: ${type}`
    );

    // Make sure input fields are valid - replace null/undefined with empty strings
    const safeTitle = title || "";
    const safeUrl = url || "";
    const safeType = type || "page";
    const safeContent = cleanedContentText || "Empty content";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an AI that creates metadata and classifications for e-commerce pages.
          Your task is to analyze the page title, URL, and type to generate:
          
          1. Classification data with these fields EXACTLY (JSON format):
             - "main_category": "string - main category name",
             - "sub_categories": ["array of 3-5 specific sub-categories"],
             - "product_types": ["array of 5-10 specific likely product types"],
             - "search_intents": ["array of 4-6 likely search intents"]
             
          2. Enhanced keywords with these fields EXACTLY (JSON format):
             - "commercial_terms": ["array of 5-8 commercial intent keywords like buy, shop, etc."],
             - "product_terms": ["array of 10-15 specific product-related keywords"],
             - "attribute_terms": ["array of 5-8 likely product attributes like premium, etc."]
             
          3. Sample queries with this field EXACTLY (JSON format):
             - "queries": ["array of 5-7 example search queries that should lead to this page"]
          
          Return ONLY a JSON object with these 3 top-level keys: classification, keywords, queries
          Do not include any explanations or additional text.
          The properties must match EXACTLY as described above.`,
        },
        {
          role: "user",
          content: `Generate metadata for:
          
          Title: ${safeTitle}
          URL: ${safeUrl}
          Type: ${safeType}
          Available content: ${safeContent}
          
          Please return ONLY a valid JSON object with the requested fields.`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 750,
    });

    const responseContent = completion.choices[0].message.content;
    if (responseContent) {
      try {
        const result = JSON.parse(responseContent);
        // Add a flag indicating if this was for minimal content
        result.isMinimalContent = isMinimalContent;
        return result;
      } catch (jsonError) {
        console.error("Error parsing AI response as JSON:", jsonError);
        // Return a default structured response
        return {
          classification: {
            main_category: safeType,
            sub_categories: [safeType],
            product_types: [],
            search_intents: [safeType],
          },
          keywords: {
            commercial_terms: [],
            product_terms: [],
            attribute_terms: [],
          },
          queries: [`${safeTitle} ${safeType}`],
          isMinimalContent: isMinimalContent,
        };
      }
    }
    return null;
  } catch (error) {
    console.error("Error generating metadata:", error);
    // Return a fallback structure rather than null
    return {
      classification: {
        main_category: type || "page",
        sub_categories: [type || "page"],
        product_types: [],
        search_intents: [type || "page"],
      },
      keywords: {
        commercial_terms: [],
        product_terms: [],
        attribute_terms: [],
      },
      queries: [`${title || ""} ${type || "page"}`],
      isMinimalContent: true,
    };
  }
}

// Add this function to sanitize metadata and ensure no null values for Pinecone
function sanitizeAndStringifyArray(arr: any[]): string {
  if (!arr || !Array.isArray(arr)) return JSON.stringify([]);

  try {
    // Filter out any null or undefined values, then stringify
    return JSON.stringify(
      arr.filter((item) => item !== null && item !== undefined)
    );
  } catch (error) {
    console.error("Error stringifying array:", error);
    return JSON.stringify([]);
  }
}

// Create a safe stringify function to handle null/undefined data
function safeStringify(data: any): string {
  if (!data) return JSON.stringify({});
  try {
    return JSON.stringify(data);
  } catch (error) {
    console.error("Error stringifying data:", error);
    return JSON.stringify({});
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

    // Get all WordPress content for this website
    const posts = await prisma.wordpressPost.findMany({
      where: { websiteId },
      include: {
        author: true,
        comments: true, // Include comments
      },
    });

    const pages = await prisma.wordpressPage.findMany({
      where: { websiteId },
    });

    const products = await prisma.wordpressProduct.findMany({
      where: { websiteId },
      include: {
        reviews: true,
        categories: true,
      },
    });

    // Add posts to vector store
    for (const post of posts) {
      // Sanitize the post title for the ID to ensure ASCII-only characters
      const sanitizedTitle = (post.title || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      try {
        const cleanedTitle = cleanContent(post.title);
        const cleanedContent = cleanContent(post.content);

        // Create a combined content string for the embedding
        let combinedContent = `${cleanedTitle}\n\n${cleanedContent}`;

        // Add comments to the content if available (improves search results)
        if (post.comments.length > 0) {
          const cleanedComments = post.comments
            .map(
              (c) => `Comment by ${c.authorName}: ${cleanContent(c.content)}`
            )
            .join("\n");
          combinedContent += `\n\nComments:\n${cleanedComments}`;
        }

        // Create enhanced text with semantic terms for better search
        const enhancedText = [
          cleanedTitle,
          cleanedContent,
          "post",
          "blog post",
          "article",
          post.link,
          // Add post characteristic indicators with natural language
          combinedContent.toLowerCase().includes("how to") ? "how_to" : null,
          combinedContent.toLowerCase().includes("how to") ? "tutorial" : null,
          combinedContent.toLowerCase().includes("how to") ? "guide" : null,
          combinedContent.toLowerCase().includes("review") ? "review" : null,
          combinedContent.toLowerCase().includes("review")
            ? "product_review"
            : null,
          combinedContent.toLowerCase().includes("review") ? "opinion" : null,
          combinedContent.toLowerCase().includes("top") ? "list" : null,
          combinedContent.toLowerCase().includes("top") ? "top_list" : null,
          combinedContent.toLowerCase().includes("best")
            ? "recommendations"
            : null,
          combinedContent.toLowerCase().includes("best") ? "best_of" : null,
          combinedContent.toLowerCase().includes("vs") ? "comparison" : null,
          combinedContent.toLowerCase().includes("vs") ? "versus" : null,
          // Add content indicators
          combinedContent.toLowerCase().includes("new") ? "new" : null,
          combinedContent.toLowerCase().includes("new") ? "latest" : null,
          combinedContent.toLowerCase().includes("update") ? "update" : null,
          combinedContent.toLowerCase().includes("update") ? "updated" : null,
          combinedContent.toLowerCase().includes("breaking")
            ? "breaking"
            : null,
          combinedContent.toLowerCase().includes("breaking") ? "news" : null,
          combinedContent.toLowerCase().includes("exclusive")
            ? "exclusive"
            : null,
          combinedContent.toLowerCase().includes("exclusive")
            ? "only_here"
            : null,
          combinedContent.toLowerCase().includes("first") ? "first_look" : null,
          combinedContent.toLowerCase().includes("first") ? "preview" : null,
          // Add comment-related indicators
          post.comments.length > 0 ? "has_comments" : null,
          post.comments.length > 0 ? "discussion" : null,
          post.comments.length > 5 ? "active_discussion" : null,
          post.comments.length > 10 ? "popular_post" : null,
          post.comments.length > 20 ? "highly_engaging" : null,
          // Add author information if available
          post.authorId ? "authored" : null,
          post.authorId ? "written_by" : null,
          // Add content length indicators
          combinedContent.length > 5000 ? "long_form" : null,
          combinedContent.length > 5000 ? "detailed" : null,
          combinedContent.length > 10000 ? "comprehensive" : null,
          combinedContent.length < 2000 ? "short" : null,
          combinedContent.length < 2000 ? "brief" : null,
          combinedContent.length < 1000 ? "quick_read" : null,
          // Add comment content for semantic search
          ...post.comments.map((c) => c.authorName),
          ...post.comments.map(
            (c) => `comment: ${cleanContent(c.content).substring(0, 100)}`
          ),
        ]
          .filter(Boolean)
          .join(" ");

        // Generate the embedding
        const embedding = await createEmbedding(combinedContent);

        // Generate sparse vectors
        const sparseVectors = await generateSparseVectors(enhancedText);

        console.log(`📊 Upserting post ${post.wpId} with hybrid vectors:`, {
          embeddingLength: embedding.length,
          sparseVectorsLength: sparseVectors.indices.length,
        });

        await index.namespace(websiteId).upsert([
          {
            id: `post-${sanitizedTitle}-${post.wpId}`,
            values: embedding,
            sparseValues: sparseVectors,
            metadata: sanitizeMetadata({
              type: "post",
              title: cleanedTitle,
              content: combinedContent,
              url: post.link,
              ...(post.authorId && { authorId: post.authorId }),
              commentCount: post.comments.length,
              ...(post.comments.length > 0 && {
                commentIds: post.comments.map((c) => String(c.wpId)),
                commentContents: post.comments.map((c) =>
                  cleanContent(c.content)
                ),
                commentAuthors: post.comments.map((c) => c.authorName),
              }),
            }),
          },
        ]);
        stats.added++;
        stats.details.added.push(`post-${sanitizedTitle}-${post.wpId}`);
      } catch (error) {
        console.error(`Error vectorizing post ${post.wpId}:`, error);
        stats.errors++;
        stats.details.errors.push({
          id: `post-${sanitizedTitle}-${post.wpId}`,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Add pages to vector store
    for (const page of pages) {
      // Sanitize the page title for the ID to ensure ASCII-only characters
      const sanitizedPageTitle = (page.title || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      try {
        const cleanedTitle = cleanContent(page.title);
        const cleanedContent = cleanContent(page.content);

        // Check if this is an empty/minimal content page (like a shortcode page)
        const hasMinimalContent = Boolean(
          !cleanedContent ||
            cleanedContent.trim().length < 50 ||
            cleanedContent.match(/^\[.*\]$/)
        );

        // Determine page type for better enhancement
        const pageType = (page.slug || "").toLowerCase();
        const isShopPage =
          pageType.includes("shop") ||
          pageType.includes("store") ||
          pageType.includes("product");
        const isContactPage =
          pageType.includes("contact") ||
          pageType.includes("reach") ||
          pageType === "get-in-touch";
        const isAboutPage =
          pageType.includes("about") ||
          pageType === "who-we-are" ||
          pageType === "our-story";
        const specifcPageType = isShopPage
          ? "shop"
          : isContactPage
          ? "contact"
          : isAboutPage
          ? "about"
          : "page";

        console.log(
          `Processing page: ${page.slug}, title: "${cleanedTitle}", minimal content: ${hasMinimalContent}, type: ${specifcPageType}`
        );
        console.log(
          `Content length: ${
            (cleanedContent || "").length
          }, is shortcode: ${Boolean(
            cleanedContent && cleanedContent.match(/^\[.*\]$/)
          )}`
        );

        // Create enhanced text with semantic terms for better search
        let enhancedText = [
          cleanedTitle,
          cleanedContent,
          "page",
          "website page",
          page.link,
          // Add page characteristic indicators with natural language
          isAboutPage ? "about" : null,
          isAboutPage ? "about_us" : null,
          isAboutPage ? "company" : null,
          isContactPage ? "contact" : null,
          isContactPage ? "get_in_touch" : null,
          isContactPage ? "reach_out" : null,
          page.slug === "faq" ? "faq" : null,
          page.slug === "faq" ? "frequently_asked_questions" : null,
          page.slug === "faq" ? "help" : null,
          page.slug === "privacy-policy" ? "privacy" : null,
          page.slug === "privacy-policy" ? "privacy_policy" : null,
          page.slug === "privacy-policy" ? "data_policy" : null,
          page.slug === "terms" ? "terms" : null,
          page.slug === "terms" ? "terms_of_service" : null,
          page.slug === "terms" ? "terms_and_conditions" : null,
          // Add content indicators
          cleanedContent.toLowerCase().includes("new") ? "new" : null,
          cleanedContent.toLowerCase().includes("new") ? "latest" : null,
          cleanedContent.toLowerCase().includes("update") ? "updated" : null,
          cleanedContent.toLowerCase().includes("update") ? "revised" : null,
          cleanedContent.toLowerCase().includes("contact")
            ? "contact_info"
            : null,
          cleanedContent.toLowerCase().includes("contact")
            ? "contact_details"
            : null,
          cleanedContent.toLowerCase().includes("email") ? "email_us" : null,
          cleanedContent.toLowerCase().includes("form") ? "form" : null,
          cleanedContent.toLowerCase().includes("form") ? "fill_out" : null,
          // Add content length indicators
          cleanedContent.length > 5000 ? "detailed" : null,
          cleanedContent.length > 5000 ? "comprehensive" : null,
          cleanedContent.length > 10000 ? "full_information" : null,
          cleanedContent.length < 2000 ? "brief" : null,
          cleanedContent.length < 2000 ? "short" : null,
          cleanedContent.length < 1000 ? "quick_info" : null,
        ]
          .filter(Boolean)
          .join(" ");

        // Get AI-generated metadata - but don't replace content
        let aiEnhancement = null;
        let aiMetadata: Record<string, string> = {};

        // Always call the AI to get metadata
        aiEnhancement = await generateContentDescription(
          cleanedTitle,
          page.link || "",
          specifcPageType,
          cleanedContent || ""
        );

        if (aiEnhancement) {
          console.log(
            `✅ Successfully generated AI enhancement for page: ${page.slug} (${specifcPageType})`
          );

          // Extract AI-generated information to enhance metadata and search
          if (aiEnhancement.classification) {
            aiMetadata = {
              ai_main_category:
                aiEnhancement.classification.main_category || "",
              ai_sub_categories: sanitizeAndStringifyArray(
                aiEnhancement.classification.sub_categories || []
              ),
              ai_search_intents: sanitizeAndStringifyArray(
                aiEnhancement.classification.search_intents || []
              ),
              // Add empty product types by default
              ai_product_types: "[]",
            };

            // Only populate product types for shop pages
            if (isShopPage) {
              aiMetadata.ai_product_types = sanitizeAndStringifyArray(
                aiEnhancement.classification.product_types || []
              );
            }
          }

          // Add keywords to enhancedText for all pages
          if (aiEnhancement.keywords) {
            if (typeof aiEnhancement.keywords === "string") {
              enhancedText += " " + aiEnhancement.keywords;
            } else if (Array.isArray(aiEnhancement.keywords)) {
              enhancedText += " " + aiEnhancement.keywords.join(" ");
            } else if (typeof aiEnhancement.keywords === "object") {
              // Handle the case where keywords is an object with different categories
              const allKeywords = [
                ...(aiEnhancement.keywords.commercial_terms || []),
                ...(aiEnhancement.keywords.product_terms || []),
                ...(aiEnhancement.keywords.attribute_terms || []),
              ].filter(Boolean);
              enhancedText += " " + allKeywords.join(" ");
            }
          }

          // Add example queries as additional search terms
          if (aiEnhancement.queries && Array.isArray(aiEnhancement.queries)) {
            enhancedText += " " + aiEnhancement.queries.join(" ");
          }
        }

        // For ALL pages, create an AI-generated short description
        let shortDescription = "";

        if (aiEnhancement) {
          // Create a rich description from AI data
          const enhancedContentParts = [];

          // Add page type specific intro
          if (isShopPage) {
            enhancedContentParts.push(
              `This is our online shop page where you can browse and purchase products.`
            );
          } else if (isContactPage) {
            enhancedContentParts.push(
              `This is our contact page where you can reach out to us.`
            );
          } else if (isAboutPage) {
            enhancedContentParts.push(
              `This page provides information about our company and what we do.`
            );
          } else {
            enhancedContentParts.push(
              `This page contains information about ${cleanedTitle}.`
            );
          }

          // Add main category as a description
          if (aiEnhancement.classification?.main_category) {
            enhancedContentParts.push(
              `Category: ${aiEnhancement.classification.main_category}`
            );
          }

          // Add subcategories if available
          if (
            aiEnhancement.classification?.sub_categories &&
            Array.isArray(aiEnhancement.classification.sub_categories)
          ) {
            enhancedContentParts.push(
              `Related to: ${aiEnhancement.classification.sub_categories.join(
                ", "
              )}`
            );
          }

          // Add product types ONLY if this is a shop page
          if (
            isShopPage &&
            aiEnhancement.classification?.product_types &&
            Array.isArray(aiEnhancement.classification.product_types)
          ) {
            enhancedContentParts.push(
              `Products available: ${aiEnhancement.classification.product_types.join(
                ", "
              )}`
            );
          }

          // Add search intents in a user-friendly way
          if (
            aiEnhancement.classification?.search_intents &&
            Array.isArray(aiEnhancement.classification.search_intents)
          ) {
            enhancedContentParts.push(
              `Common reasons to visit: ${aiEnhancement.classification.search_intents.join(
                ", "
              )}`
            );
          }

          // Add sample queries as "You might be looking for..."
          if (aiEnhancement.queries && Array.isArray(aiEnhancement.queries)) {
            enhancedContentParts.push(
              `Common searches: ${aiEnhancement.queries.join(", ")}`
            );
          }

          // Combine into a short description for all pages
          shortDescription = enhancedContentParts.join("\n\n");
        }

        // Use the original content from the database - don't replace it
        let contentToStore = cleanedContent || ""; // Make sure it's not null

        // Generate both dense and sparse vectors
        const embedding = await createEmbedding(contentToStore);
        const sparseVectors = await generateSparseVectors(
          enhancedText || "empty"
        );

        console.log(`📊 Upserting page ${page.wpId} with hybrid vectors:`, {
          embeddingLength: embedding.length,
          sparseVectorsLength: sparseVectors.indices.length,
          hasAiEnhancement: !!aiEnhancement,
          isMinimalContent: hasMinimalContent,
        });

        await index.namespace(websiteId).upsert([
          {
            id: `page-${sanitizedPageTitle}-${page.wpId}`,
            values: embedding,
            sparseValues: sparseVectors,
            metadata: sanitizeMetadata({
              type: "page",
              title: cleanedTitle,
              content: contentToStore || "",
              shortDescription,
              url: page.link,
              hasAiEnhancement: !!aiEnhancement,
              isMinimalContent: hasMinimalContent,
              // Include AI-generated metadata if available
              ...aiMetadata,
            }),
          },
        ]);
        stats.added++;
        stats.details.added.push(`page-${sanitizedPageTitle}-${page.wpId}`);
      } catch (error) {
        console.error(`Error vectorizing page ${page.wpId}:`, error);
        stats.errors++;
        stats.details.errors.push({
          id: `page-${sanitizedPageTitle}-${page.wpId}`,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Add products to vector store (combined with their reviews and categories)
    for (const product of products) {
      // Sanitize the product name for the ID to ensure ASCII-only characters
      const sanitizedProductName = (product.name || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      try {
        const cleanedName = cleanContent(product.name);
        const cleanedDescription = cleanContent(product.description);
        const cleanedShortDescription = cleanContent(
          product.shortDescription || ""
        );

        // Combine product content
        let combinedContent = `${cleanedName}\n${cleanedDescription}\n${cleanedShortDescription}`;

        // Add categories if they exist
        if (product.categories && product.categories.length > 0) {
          const categoriesText = product.categories
            .map((category) => category.name)
            .join(", ");

          combinedContent += `\n\nCategories: ${categoriesText}`;
        }

        // Add reviews if they exist
        if (product.reviews && product.reviews.length > 0) {
          const reviewsContent = product.reviews
            .map(
              (review) =>
                `Review by ${review.reviewer} (${
                  review.rating
                }/5): ${cleanContent(review.review)}`
            )
            .join("\n");

          combinedContent += `\n\nReviews:\n${reviewsContent}`;
        }

        // Create enhanced text with semantic terms for better search
        const enhancedText = [
          cleanedName,
          cleanedDescription,
          cleanedShortDescription,
          "product",
          "item",
          "for sale",
          product.permalink,
          // Add price indicators
          product.price ? `price_${product.price}` : null,
          product.price < 50 ? "affordable" : null,
          product.price < 50 ? "budget" : null,
          product.price < 50 ? "inexpensive" : null,
          product.price < 100 ? "mid_range" : null,
          product.price < 100 ? "moderate_price" : null,
          product.price >= 100 ? "premium" : null,
          product.price >= 100 ? "high_end" : null,
          product.price >= 200 ? "luxury" : null,
          product.price >= 200 ? "expensive" : null,
          // Add sale indicators
          product.salePrice ? "on_sale" : null,
          product.salePrice ? "discounted" : null,
          product.salePrice ? "special_offer" : null,
          product.salePrice &&
          product.regularPrice &&
          product.salePrice < product.regularPrice * 0.8
            ? "big_discount"
            : null,
          product.salePrice &&
          product.regularPrice &&
          product.salePrice < product.regularPrice * 0.8
            ? "major_savings"
            : null,
          // Add inventory indicators
          product.stockQuantity === 0 ? "out_of_stock" : null,
          product.stockQuantity === 0 ? "sold_out" : null,
          product.stockQuantity === 0 ? "unavailable" : null,
          product.stockQuantity && product.stockQuantity > 0
            ? "in_stock"
            : null,
          product.stockQuantity && product.stockQuantity > 0
            ? "available"
            : null,
          product.stockQuantity && product.stockQuantity < 5
            ? "low_stock"
            : null,
          product.stockQuantity && product.stockQuantity < 5
            ? "limited_availability"
            : null,
          product.stockQuantity && product.stockQuantity < 5
            ? "selling_fast"
            : null,
          product.stockQuantity && product.stockQuantity >= 5
            ? "well_stocked"
            : null,
          // Add product characteristics from description with natural language
          combinedContent.toLowerCase().includes("new") ? "new_arrival" : null,
          combinedContent.toLowerCase().includes("new")
            ? "just_released"
            : null,
          combinedContent.toLowerCase().includes("limited")
            ? "limited_edition"
            : null,
          combinedContent.toLowerCase().includes("limited")
            ? "exclusive_release"
            : null,
          combinedContent.toLowerCase().includes("exclusive")
            ? "exclusive"
            : null,
          combinedContent.toLowerCase().includes("exclusive")
            ? "hard_to_find"
            : null,
          combinedContent.toLowerCase().includes("premium") ? "premium" : null,
          combinedContent.toLowerCase().includes("premium")
            ? "high_quality"
            : null,
          combinedContent.toLowerCase().includes("best") ? "best_seller" : null,
          combinedContent.toLowerCase().includes("best") ? "top_seller" : null,
          combinedContent.toLowerCase().includes("popular") ? "popular" : null,
          combinedContent.toLowerCase().includes("popular")
            ? "in_demand"
            : null,
          combinedContent.toLowerCase().includes("trending")
            ? "trending"
            : null,
          combinedContent.toLowerCase().includes("trending")
            ? "hot_item"
            : null,
          // Add review indicators
          product.reviews.length > 0 ? "reviewed" : null,
          product.reviews.length > 0 ? "has_reviews" : null,
          product.reviews.length > 5 ? "well_reviewed" : null,
          product.reviews.length > 10 ? "highly_reviewed" : null,
          // Add average rating
          product.reviews.length > 0
            ? `rating_${Math.round(
                product.reviews.reduce((sum, r) => sum + r.rating, 0) /
                  product.reviews.length
              )}`
            : null,
          // Add category names for direct matching
          ...(product.categories || []).map((c) => c.name),
          // Add review content for semantic search
          ...(product.reviews || []).map(
            (r) => `review: ${cleanContent(r.review).substring(0, 100)}`
          ),
        ]
          .filter(Boolean)
          .join(" ");

        // Generate both dense and sparse vectors
        const embedding = await createEmbedding(combinedContent);
        const sparseVectors = await generateSparseVectors(enhancedText);

        console.log(
          `📊 Upserting product ${product.wpId} with hybrid vectors:`,
          {
            embeddingLength: embedding.length,
            sparseVectorsLength: sparseVectors.indices.length,
          }
        );

        await index.namespace(websiteId).upsert([
          {
            id: `product-${sanitizedProductName}-${product.wpId}`,
            values: embedding,
            sparseValues: sparseVectors,
            metadata: sanitizeMetadata({
              type: "product",
              name: cleanedName,
              description: combinedContent,
              url: product.permalink,
              price: product.price,
              ...(product.regularPrice && {
                regularPrice: product.regularPrice,
              }),
              ...(product.salePrice && { salePrice: product.salePrice }),
              ...(product.stockQuantity && {
                stockQuantity: product.stockQuantity,
              }),
              reviewCount: product.reviews.length,
              categoryCount: product.categories.length,
              ...(product.categories.length > 0 && {
                categoryNames: product.categories
                  .map((c) => c.name)
                  .filter(Boolean),
              }),
              ...(product.reviews.length > 0 && {
                reviewIds: product.reviews.map((r) => String(r.wpId)),
                reviewContents: product.reviews.map((r) =>
                  cleanContent(r.review)
                ),
                reviewAuthors: product.reviews.map((r) => r.reviewer),
                reviewRatings: product.reviews.map((r) => String(r.rating)),
              }),
            }),
          },
        ]);
        stats.added++;
        stats.details.added.push(
          `product-${sanitizedProductName}-${product.wpId}`
        );
      } catch (error) {
        console.error(`Error vectorizing product ${product.wpId}:`, error);
        stats.errors++;
        stats.details.errors.push({
          id: `product-${sanitizedProductName}-${product.wpId}`,
          error: error instanceof Error ? error.message : String(error),
        });
      }
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

    // Add content to vector store
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
