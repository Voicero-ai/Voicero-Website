import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Client } from "@opensearch-project/opensearch";
import { RecordSparseValues } from "@pinecone-database/pinecone";
import OpenAI from "openai";

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

const index = pinecone.index(process.env.PINECONE_INDEX!);

interface PageData {
  url: string;
  title: string;
  content: string;
  htmlContent: string;
}

interface RequestBody {
  websiteId: string;
  pages: PageData[];
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
    });

    return limitedSparseVectors;
  } catch (error: any) {
    console.error("❌ Error generating sparse vectors:", error);
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

// Function to create embeddings
async function createEmbedding(text: string) {
  const [embedding] = await embeddings.embedDocuments([text]);
  return embedding;
}

// Recursively removes null and undefined values from an object to prevent Pinecone errors
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

// Function to clean content
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

// Function to generate content description using AI
async function generateContentDescription(
  title: string,
  url: string,
  contentText: string | null
): Promise<any | null> {
  try {
    const cleanedContentText = contentText || "";

    // Determine the page type based on URL patterns
    let pageType = "page";

    if (url.toLowerCase().includes("contact")) {
      pageType = "contact";
    } else if (url.toLowerCase().includes("about")) {
      pageType = "about";
    } else if (
      url.toLowerCase().includes("shop") ||
      url.toLowerCase().includes("store") ||
      url.toLowerCase().includes("product")
    ) {
      pageType = "shop";
    } else if (url.toLowerCase().includes("faq")) {
      pageType = "faq";
    } else if (
      url.toLowerCase().includes("blog") ||
      url.toLowerCase().includes("post")
    ) {
      pageType = "blog";
    } else if (url.toLowerCase().includes("service")) {
      pageType = "service";
    }

    // Check if this is a minimal content page
    const isMinimalContent = Boolean(
      !cleanedContentText ||
        cleanedContentText.trim().length < 50 ||
        cleanedContentText.match(/^\[.*\]$/)
    );

    console.log(
      `Generating metadata for page: ${url}, minimal content: ${isMinimalContent}, type: ${pageType}`
    );

    // Create different prompts based on page type
    let systemPrompt = "";

    if (pageType === "shop") {
      // For shop/product pages, include product-specific fields
      systemPrompt = `You are an AI that creates metadata and classifications for e-commerce pages.
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
      The properties must match EXACTLY as described above.`;
    } else {
      // For non-shop pages, use page-specific fields instead of product fields
      systemPrompt = `You are an AI that creates metadata and classifications for website pages.
      Your task is to analyze the page title, URL, and type to generate:
      
      1. Classification data with these fields EXACTLY (JSON format):
         - "main_category": "string - main category name",
         - "sub_categories": ["array of 3-5 specific sub-categories"],
         - "page_types": ["array of 5-10 specific likely page types or topics"],
         - "search_intents": ["array of 4-6 likely search intents"]
         
      2. Enhanced keywords with these fields EXACTLY (JSON format):
         - "page_terms": ["array of 10-15 specific content-related keywords"],
         - "attribute_terms": ["array of 5-8 likely page attributes like informational, official, etc."],
         - "related_concepts": ["array of 5-8 related concepts or ideas"]
         
      3. Sample queries with this field EXACTLY (JSON format):
         - "queries": ["array of 5-7 example search queries that should lead to this page"]
      
      Return ONLY a JSON object with these 3 top-level keys: classification, keywords, queries
      Do not include any explanations or additional text.
      The properties must match EXACTLY as described above.`;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: `Generate metadata for:
          
          Title: ${title}
          URL: ${url}
          Type: ${pageType}
          Available content: ${cleanedContentText || "None"}
          
          Please return ONLY a valid JSON object with the requested fields.`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 750,
    });

    const responseContent = completion.choices[0].message.content;
    if (responseContent) {
      const result = JSON.parse(responseContent);
      // Add a flag indicating if this was for minimal content
      result.isMinimalContent = isMinimalContent;
      result.pageType = pageType;
      return result;
    }
    return null;
  } catch (error) {
    console.error("Error generating metadata:", error);
    return null;
  }
}

// Helper function to sanitize and stringify arrays
function sanitizeAndStringifyArray(arr: any[]): string {
  if (!arr || !Array.isArray(arr)) return JSON.stringify([]);
  // Filter out any null or undefined values, then stringify
  return JSON.stringify(
    arr.filter((item) => item !== null && item !== undefined)
  );
}

// Function to delete existing vectors for a website
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

// Main function to train content
async function trainContent(
  websiteId: string,
  pages: PageData[]
): Promise<VectorizeStats> {
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

    // Process each page
    for (const page of pages) {
      try {
        const cleanedTitle = cleanContent(page.title);
        const cleanedContent = cleanContent(page.content);
        const cleanedHtmlContent = page.htmlContent || "";

        // Check if this is an empty/minimal content page
        const hasMinimalContent = Boolean(
          !cleanedContent || cleanedContent.trim().length < 50
        );

        console.log(
          `Processing page: ${page.url}, title: "${cleanedTitle}", minimal content: ${hasMinimalContent}`
        );

        // Get AI-generated metadata
        const aiEnhancement = await generateContentDescription(
          cleanedTitle,
          page.url,
          cleanedContent
        );

        let aiMetadata: Record<string, string> = {};
        let enhancedText = `${cleanedTitle} ${cleanedContent}`;
        let shortDescription = "";

        if (aiEnhancement) {
          console.log(
            `✅ Successfully generated AI enhancement for page: ${page.url} (${aiEnhancement.pageType})`
          );

          // Extract AI-generated information to enhance metadata and search
          if (aiEnhancement.classification) {
            // Base metadata that's common to all page types
            aiMetadata = {
              ai_main_category:
                aiEnhancement.classification.main_category || "",
              ai_sub_categories: sanitizeAndStringifyArray(
                aiEnhancement.classification.sub_categories || []
              ),
              ai_search_intents: sanitizeAndStringifyArray(
                aiEnhancement.classification.search_intents || []
              ),
            };

            // Add page type-specific metadata
            if (aiEnhancement.pageType === "shop") {
              // For shop pages, include product-specific fields
              aiMetadata.ai_product_types = sanitizeAndStringifyArray(
                aiEnhancement.classification.product_types || []
              );
            } else {
              // For non-shop pages, include page-specific fields
              aiMetadata.ai_page_types = sanitizeAndStringifyArray(
                aiEnhancement.classification.page_types || []
              );
            }
          }

          // Add keywords to enhancedText
          if (aiEnhancement.keywords) {
            if (typeof aiEnhancement.keywords === "object") {
              // Handle the case where keywords is an object with different categories
              let allKeywords = [];

              // Extract keywords based on page type
              if (aiEnhancement.pageType === "shop") {
                allKeywords = [
                  ...(aiEnhancement.keywords.commercial_terms || []),
                  ...(aiEnhancement.keywords.product_terms || []),
                  ...(aiEnhancement.keywords.attribute_terms || []),
                ];
              } else {
                allKeywords = [
                  ...(aiEnhancement.keywords.page_terms || []),
                  ...(aiEnhancement.keywords.attribute_terms || []),
                  ...(aiEnhancement.keywords.related_concepts || []),
                ];
              }

              // Add all keywords to enhanced text for search
              enhancedText += " " + allKeywords.filter(Boolean).join(" ");
            }
          }

          // Add example queries as additional search terms
          if (aiEnhancement.queries && Array.isArray(aiEnhancement.queries)) {
            enhancedText += " " + aiEnhancement.queries.join(" ");
          }

          // Create a rich description from AI data
          const enhancedContentParts = [];

          // Add page type specific intro
          if (aiEnhancement.pageType === "shop") {
            enhancedContentParts.push(
              `This is our online shop page where you can browse and purchase products.`
            );
          } else if (aiEnhancement.pageType === "contact") {
            enhancedContentParts.push(
              `This is our contact page where you can reach out to us.`
            );
          } else if (aiEnhancement.pageType === "about") {
            enhancedContentParts.push(
              `This page provides information about our company and what we do.`
            );
          } else if (aiEnhancement.pageType === "service") {
            enhancedContentParts.push(
              `This page details the services we offer.`
            );
          } else if (aiEnhancement.pageType === "blog") {
            enhancedContentParts.push(
              `This is a blog post with information and insights.`
            );
          } else if (aiEnhancement.pageType === "faq") {
            enhancedContentParts.push(
              `This page answers frequently asked questions.`
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

          // Add product types if this is a shop page
          if (
            aiEnhancement.pageType === "shop" &&
            aiEnhancement.classification?.product_types &&
            Array.isArray(aiEnhancement.classification.product_types)
          ) {
            enhancedContentParts.push(
              `Products available: ${aiEnhancement.classification.product_types.join(
                ", "
              )}`
            );
          }
          // Add page types for non-shop pages
          else if (
            aiEnhancement.pageType !== "shop" &&
            aiEnhancement.classification?.page_types &&
            Array.isArray(aiEnhancement.classification.page_types)
          ) {
            enhancedContentParts.push(
              `Page content: ${aiEnhancement.classification.page_types.join(
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

          // Combine into a short description
          shortDescription = enhancedContentParts.join("\n\n");
        }

        // Generate both dense and sparse vectors
        const embedding = await createEmbedding(cleanedContent);
        const sparseVectors = await generateSparseVectors(enhancedText);

        console.log(`📊 Upserting page with hybrid vectors:`, {
          url: page.url,
          embeddingLength: embedding.length,
          sparseVectorsLength: sparseVectors.indices.length,
          hasAiEnhancement: !!aiEnhancement,
          isMinimalContent: hasMinimalContent,
        });

        // Generate a unique ID for the page based on URL
        const pageId = `page-${Buffer.from(page.url)
          .toString("base64")
          .replace(/[+/=]/g, "")}`;

        await index.namespace(websiteId).upsert([
          {
            id: pageId,
            values: embedding,
            sparseValues: sparseVectors,
            metadata: sanitizeMetadata({
              type: "custom_page",
              title: cleanedTitle,
              content: cleanedContent,
              htmlContent: cleanedHtmlContent,
              shortDescription,
              url: page.url,
              hasAiEnhancement: !!aiEnhancement,
              isMinimalContent: hasMinimalContent,
              pageType: aiEnhancement?.pageType || "general",
              // Include AI-generated metadata if available
              ...aiMetadata,
            }),
          },
        ]);

        stats.added++;
        stats.details.added.push(pageId);
      } catch (error) {
        console.error(`Error vectorizing page ${page.url}:`, error);
        stats.errors++;
        stats.details.errors.push({
          id: page.url,
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
        lastSyncedAt: new Date(),
      },
    });

    return stats;
  } catch (error) {
    console.error("Error training website content:", error);
    throw error;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    const body: RequestBody = await req.json();

    if (
      !body.websiteId ||
      !Array.isArray(body.pages) ||
      body.pages.length === 0
    ) {
      return NextResponse.json(
        { error: "Invalid request. websiteId and pages array are required." },
        { status: 400 }
      );
    }

    // Verify the website exists and belongs to the user
    const website = await prisma.website.findUnique({
      where: {
        id: body.websiteId,
        user: {
          email: session.user.email,
        },
      },
    });

    if (!website) {
      return NextResponse.json(
        { error: "Website not found or does not belong to the user" },
        { status: 404 }
      );
    }

    console.log(
      `[TRAIN API] Starting training for website ID: ${website.id} with ${body.pages.length} pages`
    );

    // Process the pages and create vector embeddings
    const stats = await trainContent(website.id, body.pages);

    const responsePayload = {
      success: true,
      message: `Successfully trained ${stats.added} of ${body.pages.length} pages for website ${website.name}`,
      stats,
    };

    console.log("[TRAIN API] Training completed:", responsePayload);
    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error("[TRAIN API ERROR] Error in train-content API:", error);
    return NextResponse.json(
      { error: "Internal server error", details: (error as Error).message },
      { status: 500 }
    );
  }
}
