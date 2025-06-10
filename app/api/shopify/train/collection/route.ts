import { NextRequest, NextResponse } from "next/server";
import prisma from "../../../../../lib/prisma";
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Client } from "@opensearch-project/opensearch";
import { cors } from "../../../../../lib/cors";
import { RecordSparseValues } from "@pinecone-database/pinecone";
import OpenAI from "openai";
import crypto from "crypto";
export const dynamic = "force-dynamic";

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});
const embeddings = new OpenAIEmbeddings({
  modelName: "text-embedding-3-large",
});
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize OpenSearch client
const opensearch = new Client({
  nodes: [process.env.OPENSEARCH_DOMAIN_ENDPOINT!],
  auth: {
    username: process.env.OPENSEARCH_USERNAME!,
    password: process.env.OPENSEARCH_PASSWORD!,
  },
  ssl: {
    rejectUnauthorized: true,
  },
});

// Main prompts for collection QA generation
const DISCOVERY_QA_PROMPT = `Generate 10 discovery questions about collections:
\${collectionJson}

URL Format:
- Basic Collection: /collections/[handle]

Instructions:
- Focus on general collection discovery and navigation
- Always use "redirect" action to collection pages
- Make answers helpful for finding collections
- Keep text answers to 20-40 words
- Keep voice answers to 10-20 words

Generate 10 QAs (5 text, 5 voice) focused on GENERAL discovery:
- Questions about finding different types of collections
- Questions about browsing the store's collections
- Questions about seasonal or featured collections
- Questions about new arrivals or trending collections
- Make answers helpful for store navigation

Examples:
Q: "Do you have any summer collections?"
A: "Yes, we have several summer collections, including our beachwear and vacation essentials."
Action: "redirect" to collection page

Q: "Where can I find your latest collections?"
A: "Let me show you our newest collections featuring our latest arrivals."
Action: "redirect" to collections page

Format as:
{
  "qas": [
    {
      "id": "qa-discovery-1",
      "type": "text" | "voice",
      "category": "discovery",
      "question": "string",
      "answer": "string",
      "action": "redirect",
      "url": string (collection URL)
    }
  ]
}`;

const ON_PAGE_QA_PROMPT = `Generate 10 on-page questions about this collection's products:
\${collectionJson}

Instructions:
- Focus on specific products in the collection
- Include actual product names and details in answers
- Use "scroll" action only with valid div IDs
- Make answers informative about the actual products
- Keep text answers to 20-40 words
- Keep voice answers to 10-20 words

Generate 10 QAs (5 text, 5 voice) about the SPECIFIC products in this collection:
- Questions about what products are available
- Questions about product features and details
- Questions about specific product types
- Questions about product categories
- Use actual product names and details from the collection data

Examples using real product data:
Q: "What types of [product category] do you have in this collection?"
A: "In this collection, we have [list specific product names]. Our [product type] includes [specific features/details]."

Q: "Tell me about the [specific product name]"
A: "The [product name] is [describe using actual product details]. It's part of our [collection name] collection."

Available div IDs for scrolling:
\${divIds}

Format as:
{
  "qas": [
    {
      "id": "qa-on-page-1",
      "type": "text" | "voice",
      "category": "on_page",
      "question": "string",
      "answer": "string with specific product names and details",
      "action": "scroll" | null,
      "url": string (with div ID) | null
    }
  ]
}`;

const FILTER_SORT_QA_PROMPT = `Generate 10 filtering and sorting questions for this collection:
\${collectionJson}

URL Formats:
1. Sorting Options:
   - Featured: ?sort_by=featured
   - Best Selling: ?sort_by=best-selling
   - Alphabetically A-Z: ?sort_by=title-ascending
   - Alphabetically Z-A: ?sort_by=title-descending
   - Price Low to High: ?sort_by=price-ascending
   - Price High to Low: ?sort_by=price-descending
   - Date Old to New: ?sort_by=created-ascending
   - Date New to Old: ?sort_by=created-descending
2. Filtering Options:
   - Price Range: ?filter.v.price.gte=[min]&filter.v.price.lte=[max]
   - Availability: ?filter.v.availability=1

Instructions:
- Use "filter" action for price and availability
- Use "sort" action for sorting options
- Always include appropriate URL parameters
- Make answers clear about what will be shown
- Keep text answers to 20-40 words
- Keep voice answers to 10-20 words

Generate 10 QAs (5 text, 5 voice) focused on FILTERING and SORTING:
1. PRICE FILTERING (3 text, 3 voice):
   - Questions about specific price ranges
   - Questions about items under/over certain amounts
   Example: "Show me items under $50"
   Example: "What's available between $100 and $200?"

2. AVAILABILITY (2 text, 2 voice):
   - Questions about in-stock items
   - Questions about available products
   Example: "What's currently in stock?"

3. SORTING (2 text, 2 voice):
   - Questions about sorting by price
   - Questions about sorting by newest/oldest
   Example: "Show me the newest items first"
   Example: "Sort by price low to high"

Format as:
{
  "qas": [
    {
      "id": "qa-filter-sort-1",
      "type": "text" | "voice",
      "category": "filter_sort",
      "question": "string",
      "answer": "string",
      "action": "filter" | "sort",
      "url": string (with filter/sort parameters)
    }
  ]
}`;

// System message for the AI - Edit this to modify AI behavior
const SYSTEM_MESSAGE = `You are a helpful assistant that generates questions and answers for collections. Make voice responses more conversational and natural sounding. Questions should be human like questions based on the collection. and answers should be quick, 1-2 short sentences so it makes better sense for voice. Always include specific collection details in your answers. You must return valid JSON.`;
// ============================================================================

// Update the QA interface to match our standard format
interface QA {
  id: string;
  questionType: "text" | "voice";
  question: string;
  answer: string;
  webAction: string | null;
  url: string | null;
  collection: {
    title: string;
    description: string;
    collectionUrl: string;
    productsCount: number;
    sortOrder: string;
    image: {
      url: string;
      alt: string;
    };
  };
}

interface VectorMetadata extends Record<string, any> {
  type: string;
  category: string;
  subcategory: string;
  questionType: string;
  question: string;
  answer: string;
  webAction: string | null;
  url: string | null;
  collectionId: string;
  collectionTitle: string;
  collectionDescription: string;
  collectionUrl: string;
  productsCount: number;
  sortOrder: string;
  imageUrl: string | null;
  imageAlt: string | null;
}

// Helper function to generate sparse vectors
async function generateSparseVectors(
  qaText: string,
  type: string,
  category: string,
  subcategory: string
): Promise<RecordSparseValues> {
  // Combine QA text with type, category, and subcategory for analysis
  const text = `${qaText} ${type} ${type} ${type} ${category} ${category} ${category} ${subcategory} ${subcategory} ${subcategory}`;

  // Generate a more unique index name using timestamp, random string, and UUID
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 15);
  const uuid = crypto.randomUUID();
  const indexName = `temp-analysis-${timestamp}-${randomStr}-${uuid}`;

  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      // First try to delete the index if it exists
      try {
        await opensearch.indices.delete({ index: indexName });
        // Wait a moment to ensure the index is fully deleted
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        // Ignore errors if index doesn't exist
      }

      // Check if index exists before trying to create it
      try {
        const exists = await opensearch.indices.exists({ index: indexName });
        if (exists) {
          throw new Error("Index still exists after deletion attempt");
        }
      } catch (error) {
        // If we get here, the index doesn't exist, which is what we want
      }

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

      // If we get here, index creation was successful
      break;
    } catch (error: any) {
      retryCount++;
      if (retryCount === maxRetries) {
        console.error(
          `Failed to create index after ${maxRetries} attempts:`,
          error
        );
        throw error;
      }
      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount));
    }
  }

  try {
    await opensearch.index({
      index: indexName,
      body: { content: text },
      refresh: true,
    });

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
          max_num_terms: 32000,
          min_term_freq: 1,
          min_doc_freq: 1,
          max_doc_freq: 1000000,
          min_word_length: 2,
        },
      },
    });

    const terms = response.body.term_vectors?.content?.terms || {};
    const sparseValues: number[] = [];
    const sparseIndices: number[] = [];

    const docLength = Object.values(terms).reduce(
      (sum: number, stats: any) => sum + (stats.term_freq || 0),
      0
    );
    const avgDocLength = docLength;
    const totalDocs = 1;

    const termStats = Object.entries(terms).map(([term, stats]) => {
      const tf = (stats as any).term_freq || 0;
      const docFreq = (stats as any).doc_freq || 1;

      const idf = Math.log(1 + (totalDocs - docFreq + 0.5) / (docFreq + 0.5));
      const k1 = 1.2;
      const b = 0.75;
      const numerator = tf * (k1 + 1);
      const denominator = tf + k1 * (1 - b + b * (docLength / avgDocLength));
      const score = idf * (numerator / denominator);

      return { term, score };
    });

    const nonZeroTerms = termStats
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 32000);

    if (nonZeroTerms.length === 0) {
      Object.entries(terms)
        .slice(0, 10)
        .forEach(([_, __], idx) => {
          sparseIndices.push(idx);
          sparseValues.push(1.0);
        });
    } else {
      nonZeroTerms.forEach(({ score }, idx) => {
        sparseIndices.push(idx);
        sparseValues.push(score);
      });

      const maxScore = Math.max(...sparseValues);
      if (maxScore > 0) {
        for (let i = 0; i < sparseValues.length; i++) {
          sparseValues[i] = sparseValues[i] / maxScore;
        }
      }
    }

    return {
      indices: sparseIndices,
      values: sparseValues,
    };
  } catch (error) {
    console.error("Error generating sparse vectors:", error);
    return {
      indices: [0],
      values: [1],
    };
  } finally {
    try {
      await opensearch.indices.delete({ index: indexName });
    } catch (error) {
      console.error("Error cleaning up temporary index:", error);
    }
  }
}

// Function to process QAs and generate vectors
async function processQAs(
  qas: any[],
  vectorId: string,
  collection: any,
  category: string
) {
  const sectionVectors = [];
  let processedCount = 0;

  // Create a sanitized collection title for IDs
  const sanitizedTitle = collection.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  for (const qa of qas) {
    try {
      const qaText = `${qa.question} ${qa.answer}`;
      const type = "collection"; // Hardcoded type
      const qaCategory = category; // Use passed category
      const qaSubcategory = qa.subcategory || "general"; // Get subcategory from QA

      console.log(`Generating vectors for QA ${qa.id}:`, {
        question: qa.question.substring(0, 50) + "...",
        category: qaCategory,
        subcategory: qaSubcategory,
      });

      const [denseVector, sparseVector] = await Promise.all([
        embeddings.embedQuery(qaText),
        generateSparseVectors(qaText, type, qaCategory, qaSubcategory),
      ]);

      // Add collection metadata to each QA - ensure all values are strings or numbers
      const collectionMetadata = {
        collectionTitle: String(collection.title || ""),
        collectionDescription: String(collection.description || ""),
        collectionUrl: String(`/collections/${collection.handle}` || ""),
        productsCount: Number(collection.productsCount || 0),
        sortOrder: String(collection.sortOrder || ""),
        imageUrl: collection.image?.url ? String(collection.image.url) : "",
        imageAlt: collection.image?.alt ? String(collection.image.alt) : "",
      };

      // Ensure VectorMetadata interface includes all fields being added
      const metadata = {
        ...collectionMetadata,
        type: String(type),
        category: String(qaCategory),
        subcategory: String(qaSubcategory),
        questionType: String(qa.questionType || "text"),
        question: String(qa.question || ""),
        answer: String(qa.answer || ""),
        webAction: qa.webAction ? String(qa.webAction) : "",
        url: qa.url ? String(qa.url) : "",
        collectionId: String(vectorId),
      };

      sectionVectors.push({
        id: `qa-${sanitizedTitle}-${crypto.randomBytes(8).toString("hex")}`,
        values: denseVector,
        sparseValues: sparseVector,
        metadata: metadata,
      });
      processedCount++;
    } catch (error: any) {
      console.error(`Error processing QA ${qa.id}:`, error);
    }
  }
  return sectionVectors;
}

// Update the generateQAs function to handle multiple prompts
async function generateQAs(collection: any, vectorId: string) {
  try {
    console.log("Preparing collection data for QA generation:", {
      fromDatabase: Boolean(collection.websiteId),
      collectionId: collection.id,
      shopifyId: collection.shopifyId,
      vectorId: vectorId,
    });

    // Extract div IDs from scrapedHtml
    const divIds = [];
    if (collection.scrapedHtml) {
      const idRegex = /\sid=["']([^"']+)["']/g;
      let match;
      while ((match = idRegex.exec(collection.scrapedHtml)) !== null) {
        divIds.push(match[1]);
      }
    }

    // Use database fields with enhanced data
    const collectionData = {
      title: collection.title || "",
      description: collection.description || "",
      handle: collection.handle || "",
      productsCount: collection.products?.length || 0,
      ruleSet: collection.ruleSet || {},
      sortOrder: collection.sortOrder || "",
      image: collection.image || {},
      // Convert products array to simple string array of titles
      products: (collection.products || []).map((p: any) => p.title),
      divIds,

      // Remove any circular references or unnecessary fields
      website: undefined,
      VectorDbConfig: undefined,
    };

    console.log(
      "Generated collection data for QAs:",
      JSON.stringify(collectionData, null, 2)
    );

    // Array to store all vectors
    const vectors = [];

    // Generate QAs for each category and process them in parallel
    console.log("\nGenerating Discovery QAs...");
    const discoveryQAs = await generateQAsForPrompt(
      collectionData,
      vectorId,
      DISCOVERY_QA_PROMPT
    );
    const discoveryVectorsPromise = processQAs(
      discoveryQAs,
      vectorId,
      collection,
      "discovery"
    );

    console.log("\nGenerating On-Page QAs...");
    const onPageQAs = await generateQAsForPrompt(
      collectionData,
      vectorId,
      ON_PAGE_QA_PROMPT
    );
    const onPageVectorsPromise = processQAs(
      onPageQAs,
      vectorId,
      collection,
      "on_page"
    );

    console.log("\nGenerating Filter/Sort QAs...");
    const filterSortQAs = await generateQAsForPrompt(
      collectionData,
      vectorId,
      FILTER_SORT_QA_PROMPT
    );
    const filterSortVectorsPromise = processQAs(
      filterSortQAs,
      vectorId,
      collection,
      "filter_sort"
    );

    // Wait for all vector processing to complete
    const [discoveryVectors, onPageVectors, filterSortVectors] =
      await Promise.all([
        discoveryVectorsPromise,
        onPageVectorsPromise,
        filterSortVectorsPromise,
      ]);

    // Combine all vectors
    vectors.push(...discoveryVectors, ...onPageVectors, ...filterSortVectors);

    // Combine all QAs for validation
    const allQAs = [...discoveryQAs, ...onPageQAs, ...filterSortQAs];

    // Create a sanitized collection title for IDs
    const sanitizedTitle = collection.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    // Assign category/subcategory based on origin before validation
    const categorizedQAs = [
      ...discoveryQAs.map((qa: any) => ({ ...qa, category: "discovery" })),
      ...onPageQAs.map((qa: any) => ({ ...qa, category: "on_page" })),
      ...filterSortQAs.map((qa: any) => ({ ...qa, category: "filter_sort" })),
    ];

    // Make IDs unique, ensure fields and categories/subcategories
    categorizedQAs.forEach((qa, index) => {
      qa.id = `qa-${sanitizedTitle}-${crypto.randomBytes(8).toString("hex")}`;
      qa.webAction = qa.webAction || null;
      qa.url = qa.url || null;
      qa.questionType = qa.questionType || "text";
      qa.category = qa.category || "general";
      qa.subcategory = qa.subcategory || "general";
      qa.collection = {
        title: collection.title || "",
        description: collection.description || "",
        collectionUrl: `/collections/${collection.handle}` || "",
        productsCount: collection.productsCount || 0,
        sortOrder: collection.sortOrder || "",
        image: {
          url: collection.image?.url || "",
          alt: collection.image?.alt || "",
        },
      };
    });

    // Validate each QA - check required fields including category/subcategory
    const validatedQAs = categorizedQAs.filter((qa) => {
      const isValid =
        qa.id &&
        qa.questionType &&
        qa.question &&
        qa.answer &&
        qa.category &&
        qa.subcategory;

      if (!isValid) {
        console.warn("Filtered out invalid QA:", qa);
      }
      return isValid;
    });

    if (validatedQAs.length === 0) {
      throw new Error("No valid QAs generated");
    }

    // Log QA counts by type
    const typeCounts = validatedQAs.reduce((acc, qa) => {
      acc[qa.questionType] = (acc[qa.questionType] || 0) + 1;
      return acc;
    }, {});

    console.log("\nQA Statistics by Type:");
    Object.entries(typeCounts).forEach(([type, count]) => {
      console.log(`${type}: ${count} QAs`);
    });

    console.log(`\nGenerated ${validatedQAs.length} total QAs`);
    console.log("Sample QAs:", validatedQAs.slice(0, 2));

    return { validatedQAs, vectors };
  } catch (error) {
    console.error("Error in generateQAs:", error);
    throw error;
  }
}

// Helper function to generate QAs for a specific prompt
async function generateQAsForPrompt(
  collectionData: any,
  vectorId: string,
  prompt: string
) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: SYSTEM_MESSAGE,
        },
        {
          role: "user",
          content: prompt.replace(
            "${collectionJson}",
            JSON.stringify(collectionData, null, 2)
          ),
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 4000,
    });

    const content = completion.choices[0].message.content;
    if (!content) {
      throw new Error("No content received from OpenAI");
    }

    const parsedContent = JSON.parse(content);
    if (!parsedContent.qas || !Array.isArray(parsedContent.qas)) {
      throw new Error("Invalid QA format received from OpenAI");
    }

    // Convert null values to empty strings and ensure category and subcategory are set
    return parsedContent.qas.map((qa: any) => ({
      ...qa,
      action: qa.action || "",
      url: qa.url || "",
      // Ensure category and subcategory are set based on the prompt
      category: qa.category || getCategoryFromPrompt(prompt),
      subcategory: qa.subcategory || getSubcategoryFromPrompt(prompt),
    }));
  } catch (error) {
    console.error("Error generating QAs for prompt:", error);
    return [];
  }
}

// Helper function to get category from prompt
function getCategoryFromPrompt(prompt: string): string {
  if (prompt.includes("discovery")) return "discovery";
  if (prompt.includes("on-page")) return "on_page";
  if (prompt.includes("filter")) return "filter_sort";
  return "general";
}

// Helper function to get subcategory from prompt
function getSubcategoryFromPrompt(prompt: string): string {
  if (prompt.includes("search")) return "search";
  if (prompt.includes("products")) return "products";
  if (prompt.includes("price")) return "price";
  if (prompt.includes("availability")) return "availability";
  if (prompt.includes("sort")) return "sort";
  return "general";
}

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  let id: string | undefined;
  try {
    const { id: requestId, vectorId, shopifyId } = await request.json();
    id = requestId;
    console.log("Received request with:", { id, vectorId, shopifyId });

    // Basic input checks
    if (!id || !vectorId || !shopifyId) {
      const missingFields = [];
      if (!id) missingFields.push("id");
      if (!vectorId) missingFields.push("vectorId");
      if (!shopifyId) missingFields.push("shopifyId");

      return cors(
        request,
        NextResponse.json(
          {
            error: "Missing required fields",
            missingFields,
          },
          { status: 400 }
        )
      );
    }

    // Set isTraining to true at the start
    await prisma.shopifyCollection.update({
      where: { id },
      data: { isTraining: true },
    });

    // Get the website ID from the collection
    console.log("Looking up collection with ID:", id);
    const collection = await prisma.shopifyCollection.findFirst({
      where: { id },
      include: {
        website: {
          include: {
            VectorDbConfig: true,
          },
        },
        products: {
          select: {
            title: true,
            handle: true,
          },
        },
      },
    });

    if (!collection) {
      // Reset isTraining if collection not found
      await prisma.shopifyCollection.update({
        where: { id },
        data: { isTraining: false },
      });
      console.log("Collection not found in database with ID:", id);
      return cors(
        request,
        NextResponse.json(
          { error: "Collection not found in database" },
          { status: 404 }
        )
      );
    }

    console.log("Found collection:", {
      id: collection.id,
      websiteId: collection.websiteId,
      qaNamespace: collection.website.VectorDbConfig?.QANamespace,
    });

    // Get the namespace from VectorDbConfig or fallback to website ID
    const qaNamespace =
      collection.website.VectorDbConfig?.QANamespace ||
      `${collection.website.id}-qa`;
    console.log("Using QA namespace:", qaNamespace);

    // Initialize Pinecone index
    const index = pinecone.index("voicero-hybrid");

    // Generate QAs using the database data
    console.log("Generating QAs for collection");
    let result;
    try {
      result = await generateQAs(collection, vectorId);
      console.log(`Successfully generated ${result.vectors.length} vectors`);
    } catch (error: any) {
      console.error("Error generating QAs:", error);
      return cors(
        request,
        NextResponse.json(
          { error: "Failed to generate QAs", details: error.message },
          { status: 500 }
        )
      );
    }

    // Upsert vectors to Pinecone using the correct namespace
    console.log(
      `Upserting ${result.vectors.length} vectors to QA namespace: ${qaNamespace}`
    );
    if (result.vectors.length > 0) {
      try {
        await index.namespace(qaNamespace).upsert(result.vectors);
        console.log("Successfully upserted vectors to Pinecone");

        // Update the trained field to true
        await prisma.shopifyCollection.update({
          where: { id },
          data: { trained: true },
        });
        console.log("Updated collection trained status to true");
      } catch (error: any) {
        console.error("Error upserting vectors to Pinecone:", error);
        return cors(
          request,
          NextResponse.json(
            { error: "Failed to upsert vectors", details: error.message },
            { status: 500 }
          )
        );
      }
    } else {
      console.warn("No vectors to upsert - all QA processing failed");
    }

    // At the end, set isTraining to false and trained to true
    await prisma.shopifyCollection.update({
      where: { id },
      data: {
        isTraining: false,
        trained: true,
      },
    });

    return cors(
      request,
      NextResponse.json({
        success: true,
        message: "Generated and stored QAs for collection",
        count: result.vectors.length,
        collectionId: vectorId,
        processedQAs: result.validatedQAs.length,
        totalQAs: result.validatedQAs.length,
      })
    );
  } catch (error: any) {
    // Reset isTraining if there's an error
    if (id) {
      await prisma.shopifyCollection.update({
        where: { id },
        data: { isTraining: false },
      });
    }
    console.error("Error in training endpoint:", error);
    return cors(
      request,
      NextResponse.json(
        {
          error: "An error occurred while processing the request",
          details: error.message,
        },
        { status: 500 }
      )
    );
  }
}
