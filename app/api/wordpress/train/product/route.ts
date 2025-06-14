// 1) Importing everything
import { NextRequest, NextResponse } from "next/server";
import prisma from "../../../../../lib/prisma";
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Client } from "@opensearch-project/opensearch";
import { cors } from "../../../../../lib/cors";
import { RecordSparseValues } from "@pinecone-database/pinecone";
import OpenAI from "openai";
import crypto from "crypto";
import { Prisma } from "@prisma/client"; // Import Prisma namespace
import { createChatCompletionWithRetry } from "../../../../../lib/openai-utils";
export const dynamic = "force-dynamic";

// System message for the AI - Edit this to modify AI behavior
const SYSTEM_MESSAGE = `You are a helpful assistant that generates questions and answers for WordPress products. Make voice responses more conversational and natural sounding. Questions should be human like questions based on the product. and answers should be quick, 1-2 short sentences so it makes better sense for voice. Always include specific product details in your answers. You must return valid JSON.`;

// Update the QA interface for WordPress Product
interface QA {
  id: string;
  questionType: "text" | "voice";
  question: string;
  answer: string;
  webAction: string | null;
  url: string | null;
  product: {
    name: string; // Changed from title
    description: string;
    price: number;
    stockQuantity: number | null; // Changed from priceMin/Max/totalInventory
  };
}

// 2) Initialize client(s)
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

// Helper function to generate sparse vectors
async function generateSparseVectors(
  qaText: string,
  type: string,
  category: string,
  subcategory: string
): Promise<RecordSparseValues> {
  // Combine QA text with type, category, and subcategory for analysis
  // Repeating them multiple times to give them more weight
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
    // Index the combined text
    await opensearch.index({
      index: indexName,
      body: { content: text }, // Use the combined text here
      refresh: true,
    });

    // Request term vectors for the combined text
    const response = await opensearch.transport.request({
      method: "GET",
      path: `/${indexName}/_termvectors`,
      body: {
        doc: { content: text }, // And here
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
          sparseIndices.push(Number(idx));
          sparseValues.push(1.0);
        });
    } else {
      nonZeroTerms.forEach(({ score }, idx) => {
        sparseIndices.push(Number(idx));
        sparseValues.push(Number(score));
      });

      const maxScore = Math.max(...sparseValues);
      if (maxScore > 0) {
        for (let i = 0; i < sparseValues.length; i++) {
          sparseValues[i] = Number(sparseValues[i] / maxScore);
        }
      }
    }

    // Ensure all values are valid numbers
    const validatedIndices = sparseIndices.map((i) => Number(i));
    const validatedValues = sparseValues.map((v) => {
      const val = Number(v);
      return isNaN(val) ? 0 : val;
    });

    return {
      indices: validatedIndices,
      values: validatedValues,
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

// Split into 6 separate prompts for each main category
const DISCOVERY_QA_PROMPT = `Generate 10 discovery questions and answers for the following WordPress product:
\${productJson}

Generate QAs for these subcategories:

1. USE CASE (3 text, 3 voice):
   - General questions about finding the right type of product
   - Examples:
     Q: "I'm looking for a product for [specific use]"
     A: "For [specific use], the [product.name] could be a great fit. It offers [feature] and [benefit]."
     action: "redirect"
     url: "[product.permalink]" // Use permalink

2. EXPERIENCE LEVEL (2 text, 2 voice):
   - Questions about finding the right product for their skill level
   - Examples:
     Q: "What kind of product is good for [specific skill level]?"
     A: "For [specific skill level], the [product.name] is known for being [characteristic based on description]."

IMPORTANT RULES:
1. Make discovery questions GENERAL about finding the right type of product
2. Don't mention specific product details until the answer
3. Use ACTUAL product features and benefits from the description
4. Make discovery answers more like natural sales conversations
5. Use the EXACT product categories/tags if relevant from product.categories/tags
6. Discovery responses should build interest before mentioning price
7. Voice responses should be shorter and more conversational
8. Use [product.name] for the product title/name.
9. Use [product.permalink] for product URLs.

Format your response EXACTLY as follows:
{
  "qas": [
    {
      "id": "temp-1",
      "type": "text" | "voice",
      "category": "discovery",
      "subcategory": "use_case" | "experience_level",
      "question": "string",
      "answer": "string",
      "action": "redirect" | null, // Action might be null if just informational
      "url": "[product.permalink]" | null
    }
  ]
}`;

const ONPAGE_QA_PROMPT = `Generate 10 on-page questions and answers for the following WordPress product:
\${productJson}

Generate QAs for these subcategories:

1. DETAILS/SPECIFICATIONS (3 text, 3 voice): // Renamed from FIT/SIZING
   - Questions about product details found in description or attributes
   - Examples:
     Q: "What are the key features of the [product.name]?"
     A: "The [product.name] includes [feature 1], [feature 2], and its price is $[product.price]."
     action: null // No scrolling without standard div IDs
     url: null

2. QUALITY/MATERIALS (2 text, 2 voice): // Renamed from QUALITY/DURABILITY
   - Questions about product quality or materials used
   - Examples:
     Q: "What is the [product.name] made of?"
     A: "The [product.name] is made from [material description from product.description]."
     action: null
     url: null

3. AVAILABILITY/STOCK (1 text, 1 voice): // Renamed from FEATURE SPECIFIC
   - Questions about stock levels if available
   - Examples:
     Q: "Is the [product.name] in stock?"
     A: "Currently, the stock quantity for [product.name] is [product.stockQuantity]." // Use stockQuantity
     action: null
     url: null

IMPORTANT RULES:
1. ALWAYS use the EXACT product name ([product.name]).
2. Refer to price using [product.price].
3. Refer to stock using [product.stockQuantity].
4. Use information from [product.description], [product.shortDescription], categories, and tags.
5. Since standard div IDs aren't available, DO NOT use "scroll" actions or URLs with '#'. Provide the info directly in the answer.
6. NEVER use pronouns like "this" or "it" - always use the full product name.
7. Voice responses should be shorter and more conversational.
8. Cart actions are handled separately. Do not suggest adding to cart here unless it's a direct follow-up.

Format your response EXACTLY as follows:
{
  "qas": [
    {
      "id": "temp-1",
      "type": "text" | "voice",
      "category": "on-page",
      "subcategory": "details_specifications" | "quality_materials" | "availability_stock",
      "question": "string",
      "answer": "string",
      "action": null, // No scroll actions for WP unless specific structure is known
      "url": null
    }
  ]
}`;

const STATEMENT_QA_PROMPT = `Generate 10 statement responses for the following WordPress product:
\${productJson}

Generate QAs for these subcategories:

1. INTENT SIGNALS (2 text, 2 voice):
   - Positive statements about wanting to buy
   - Examples:
     Q: "I want the [product.name]"
     A: "Great choice! The [product.name] costs $[product.price] and offers [benefit from description]. Would you like to visit the product page?"
     action: "redirect" // Redirect to product page instead of scroll
     url: "[product.permalink]"

2. OBJECTIONS (2 text, 1 voice):
   - Negative statements about price or features
   - Examples:
     Q: "[product.name] seems expensive"
     A: "I understand. The [product.name] is priced at $[product.price] because [value proposition from description]. It's known for [quality aspect]."
     action: null
     url: null

3. CONCERNS/HESITATIONS (2 text, 1 voice):
   - Statements showing uncertainty
   - Examples:
     Q: "I'm not sure about the [product.name]"
     A: "Let me tell you more. The [product.name] has features like [feature] and costs $[product.price]. You can find all details here:"
     action: "redirect"
     url: "[product.permalink]"

IMPORTANT RULES:
1. ALWAYS use the EXACT product name ([product.name]) and price ([product.price]).
2. Redirect to the product page ([product.permalink]) to provide more info instead of scrolling.
3. Make responses helpful and conversational.
4. For positive statements without direct cart requests, offer a redirect to the product page.
5. For negative statements, acknowledge and explain value/benefits using product description.
6. NO automatic cart actions. Cart actions are handled separately.
7. Voice responses should be shorter and more conversational.

Format your response EXACTLY as follows:
{
  "qas": [
    {
      "id": "temp-1",
      "type": "text" | "voice",
      "category": "statement",
      "subcategory": "intent_signal" | "objection" | "concern_hesitation",
      "question": "string", // This is the user statement
      "answer": "string", // This is the AI response
      "action": "redirect" | null,
      "url": "[product.permalink]" | null
    }
  ]
}`;

const CLARIFYING_QA_PROMPT = `Generate 8 clarifying question responses for the following WordPress product context:
\${productJson} // Product context provided for reference, but questions should be general

Generate QAs for these subcategories:

1. UNCLEAR INTENT (2 text, 2 voice):
   - Responses to vague statements that need clarification
   - Examples:
     Q: "I need something good." // User statement
     A: "Could you tell me a bit more about what you're looking for? For example, what will you use it for?" // AI clarifying question
     action: null
     url: null

2. MISSING INFO (2 text, 2 voice):
   - Responses to incomplete questions
   - Examples:
     Q: "Is it durable?" // User statement
     A: "Which product are you asking about? Knowing the specific product, like the '[product.name]', helps me answer accurately." // AI clarifying question
     action: null
     url: null

IMPORTANT RULES:
1. Use the product name ([product.name]) ONLY if the user mentioned it or context implies it clearly. Otherwise, ask clarifying questions generally.
2. Make clarifying questions specific and helpful.
3. Focus on getting the information needed to provide better assistance.
4. Keep responses conversational and friendly.
5. Voice responses should be shorter and more conversational.
6. NEVER use redirects or cart actions in clarifying questions.
7. Keep responses focused on gathering information.

Format your response EXACTLY as follows:
{
  "qas": [
    {
      "id": "temp-1",
      "type": "text" | "voice",
      "category": "clarifying",
      "subcategory": "unclear_intent" | "missing_info",
      "question": "string", // This is the user statement/question
      "answer": "string", // This is the AI's clarifying question/response
      "action": null,
      "url": null
    }
  ]
}`;

const OBJECTION_HANDLING_QA_PROMPT = `Generate 8 objection handling responses for the following WordPress product:
\${productJson}

Generate QAs for these subcategories:

1. PRICE/VALUE (2 text, 2 voice):
   - Responses to price-related objections
   - Examples:
     Q: "[product.name] is kinda expensive." // User objection
     A: "I hear you. The $[product.price] reflects its [quality feature from description]. Many find it's worth it for [benefit]. You can see more details here:" // AI response
     action: "redirect"
     url: "[product.permalink]"

2. TRUST/QUALITY (2 text, 2 voice):
   - Responses to quality concerns (Vendor info might not be standard in WP schema, focus on product)
   - Examples:
     Q: "Is the [product.name] good quality?" // User concern
     A: "The [product.name] is described as [quality aspect from description]. It also has features like [feature]. Check out the full description:"
     action: "redirect"
     url: "[product.permalink]"

IMPORTANT RULES:
1. ALWAYS use the EXACT product name ([product.name]) and price ([product.price]).
2. Address objections directly but positively.
3. Focus on value and benefits drawn from the product description and features.
4. Redirect to the product page ([product.permalink]) for more details instead of scrolling.
5. Keep responses conversational and helpful.
6. Voice responses should be shorter and more conversational.
7. Focus on explaining value and building trust based on available product info.

Format your response EXACTLY as follows:
{
  "qas": [
    {
      "id": "temp-1",
      "type": "text" | "voice",
      "category": "objection_handling",
      "subcategory": "price_value" | "trust_quality",
      "question": "string", // User objection/statement
      "answer": "string", // AI response
      "action": "redirect" | null,
      "url": "[product.permalink]" | null
    }
  ]
}`;

// Define the type based on the query including relations
const wordpressProductWithRelations =
  Prisma.validator<Prisma.WordpressProductDefaultArgs>()({
    include: {
      website: {
        include: {
          VectorDbConfig: true,
        },
      },
      categories: true,
      tags: true,
    },
  });

type WordpressProductWithRelations = Prisma.WordpressProductGetPayload<
  typeof wordpressProductWithRelations
>;

// Function to process QAs and generate vectors - Adapted for WordPress
async function processQAs(
  qas: any[],
  productId: number, // Use the internal DB ID
  product: WordpressProductWithRelations, // Use the specific type with relations
  category: string
) {
  const sectionVectors = [];
  let processedCount = 0;

  // Create a sanitized product name for IDs
  const sanitizedName = (product.name || `product-${product.wpId}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  for (const qa of qas) {
    try {
      const qaText = `${qa.question} ${qa.answer}`;
      const type = "product"; // Hardcoded type
      const qaCategory = category || qa.category || "general";
      const qaSubcategory = qa.subcategory || "general";

      console.log(`Generating vectors for QA (WP Product: ${product.wpId}):`, {
        question: qa.question.substring(0, 50) + "...",
        category: qaCategory,
        subcategory: qaSubcategory,
      });

      const [denseVector, sparseVector] = await Promise.all([
        embeddings.embedQuery(qaText),
        generateSparseVectors(qaText, type, qaCategory, qaSubcategory),
      ]);

      // Base metadata with no nulls and arrays converted to strings
      const baseMetadata: Record<string, any> = {
        name: product.name || "",
        description: product.description || product.shortDescription || "",
        price: product.price || 0,
        productUrl: product.permalink || "",
        // Convert arrays to strings
        categories:
          product.categories?.map((c: any) => c.name).join(", ") || "",
        tags: product.tags?.map((t: any) => t.name).join(", ") || "",
        type: type,
        category: qaCategory,
        subcategory: qaSubcategory,
        questionType: qa.questionType || "text",
        question: qa.question || "",
        answer: qa.answer || "",
        webAction: qa.webAction || qa.action || "",
        url: qa.url || "",
      };

      // Conditionally add stockQuantity if it's not null
      if (product.stockQuantity !== null) {
        baseMetadata.stockQuantity = product.stockQuantity;
      }

      // Ensure no null values in metadata
      Object.keys(baseMetadata).forEach((key) => {
        if (baseMetadata[key] === null || baseMetadata[key] === undefined) {
          if (typeof baseMetadata[key] === "number") {
            baseMetadata[key] = 0;
          } else {
            baseMetadata[key] = "";
          }
        }
      });

      sectionVectors.push({
        // Use sanitized name and WP ID for uniqueness, plus random bytes
        id: `qa-wp-${sanitizedName}-${product.wpId}-${crypto
          .randomBytes(4)
          .toString("hex")}`,
        values: denseVector,
        sparseValues: sparseVector,
        metadata: baseMetadata,
      });
      processedCount++;
    } catch (error: any) {
      console.error(
        `Error processing QA for WP Product ${product.wpId}:`,
        error
      );
    }
  }
  return sectionVectors;
}

// Update the generateQAs function for WordPress
async function generateQAs(
  product: WordpressProductWithRelations,
  productId: number
) {
  try {
    console.log("Preparing WordPress product data for QA generation:", {
      fromDatabase: Boolean(product.websiteId),
      productId: productId, // Internal DB ID
      wpId: product.wpId, // WordPress specific ID
      websiteId: product.websiteId,
    });

    // Use WordPress database fields
    const productData = {
      wpId: product.wpId,
      name: product.name || "",
      description: product.description || "",
      shortDescription: product.shortDescription || "",
      permalink: product.permalink || "",
      price: product.price || 0,
      regularPrice: product.regularPrice,
      salePrice: product.salePrice,
      stockQuantity: product.stockQuantity,
      // Map categories and tags if they exist and are loaded
      categories:
        product.categories?.map((c: any) => ({
          name: c.name,
          slug: c.slug,
        })) || [],
      tags:
        product.tags?.map((t: any) => ({ name: t.name, slug: t.slug })) || [],
      // Add other fields as needed by prompts
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,

      handle: product.slug, // Use slug as handle substitute if needed by prompts
      productType: product.categories?.[0]?.name || "Product", // Use first category name as type?
      vendor: undefined, // No standard vendor in WP schema
      status: undefined, // No standard status field
      priceRange: undefined,
      variants: undefined,
      images: undefined, // WP schema has separate media model, not directly linked here
      totalInventory: product.stockQuantity, // Use stockQuantity
      hasOutOfStockVariants: undefined,
      tracksInventory: product.stockQuantity !== null, // Infer based on stock quantity
      divIds: undefined, // No scraped HTML or div IDs
      scrapedHtml: undefined,
      // Remove circular refs
      website: undefined,
      VectorDbConfig: undefined,
      reviews: undefined, // Reviews are separate relation
      customFields: undefined, // Custom fields are separate relation
    };

    console.log(
      "Generated WordPress product data for QAs:",
      JSON.stringify(productData, null, 2)
    );

    // Array to store all vectors
    const vectors = [];

    // Generate QAs for each category and process them in parallel
    // Note: Prompts need careful review and adjustment for WordPress data structure
    console.log("\nGenerating Discovery QAs (WordPress)...");
    const discoveryQAs = await generateQAsForPrompt(
      productData,
      productId, // Pass internal DB id
      DISCOVERY_QA_PROMPT
    );
    const discoveryVectorsPromise = processQAs(
      discoveryQAs,
      productId, // Pass internal DB id
      product,
      "discovery"
    );

    console.log("\nGenerating On-Page QAs (WordPress)...");
    const onPageQAs = await generateQAsForPrompt(
      productData,
      productId,
      ONPAGE_QA_PROMPT
    );
    const onPageVectorsPromise = processQAs(
      onPageQAs,
      productId,
      product,
      "on-page"
    );

    console.log("\nGenerating Statement QAs (WordPress)...");
    const statementQAs = await generateQAsForPrompt(
      productData,
      productId,
      STATEMENT_QA_PROMPT
    );
    const statementVectorsPromise = processQAs(
      statementQAs,
      productId,
      product,
      "statement"
    );

    console.log("\nGenerating Clarifying QAs (WordPress)...");
    const clarifyingQAs = await generateQAsForPrompt(
      productData,
      productId,
      CLARIFYING_QA_PROMPT
    );
    const clarifyingVectorsPromise = processQAs(
      clarifyingQAs,
      productId,
      product,
      "clarifying"
    );

    console.log("\nGenerating Objection Handling QAs (WordPress)...");
    const objectionHandlingQAs = await generateQAsForPrompt(
      productData,
      productId,
      OBJECTION_HANDLING_QA_PROMPT
    );
    const objectionHandlingVectorsPromise = processQAs(
      objectionHandlingQAs,
      productId,
      product,
      "objection_handling"
    );

    // Wait for all vector processing to complete
    const [
      discoveryVectors,
      onPageVectors,
      statementVectors,
      clarifyingVectors,
      objectionHandlingVectors,
    ] = await Promise.all([
      discoveryVectorsPromise,
      onPageVectorsPromise,
      statementVectorsPromise,
      clarifyingVectorsPromise,
      objectionHandlingVectorsPromise,
    ]);

    // Combine all vectors
    vectors.push(
      ...discoveryVectors,
      ...onPageVectors,
      ...statementVectors,
      ...clarifyingVectors,
      ...objectionHandlingVectors
    );

    // Combine all QAs for validation
    const allQAs = [
      ...discoveryQAs,
      ...onPageQAs,
      ...statementQAs,
      ...clarifyingQAs,
      ...objectionHandlingQAs,
    ];

    // Create a sanitized product name for IDs
    const sanitizedName = (product.name || `product-${product.wpId}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    // Make IDs unique and add product details to each QA object
    allQAs.forEach((qa, index) => {
      // Ensure unique ID using WP context
      qa.id = `qa-wp-${sanitizedName}-${product.wpId}-${crypto
        .randomBytes(4)
        .toString("hex")}-${index}`;
      qa.webAction = qa.action || null; // Use 'action' from prompt definition
      qa.url = qa.url || null; // Use 'url' from prompt definition
      qa.questionType = qa.type || "text"; // Use 'type' from prompt definition
      // Add WordPress specific product info
      qa.product = {
        name: product.name || "",
        description: product.description || product.shortDescription || "",
        price: product.price || 0,
        stockQuantity: product.stockQuantity,
      };
      // Map prompt fields to QA interface fields if names differ
      if (qa.action) qa.webAction = qa.action;
      if (qa.type) qa.questionType = qa.type;
    });

    // Validate each QA - check for required fields
    const validatedQAs = allQAs.filter((qa) => {
      const isValid =
        qa.id &&
        qa.questionType &&
        qa.question &&
        qa.answer &&
        qa.category &&
        qa.subcategory;

      if (!isValid) {
        console.warn("Filtered out invalid WP QA:", qa);
      }
      return isValid;
    });

    if (validatedQAs.length === 0) {
      throw new Error("No valid QAs generated for WordPress product");
    }

    // Log QA counts by type
    const typeCounts = validatedQAs.reduce((acc: any, qa) => {
      acc[qa.questionType] = (acc[qa.questionType] || 0) + 1;
      return acc;
    }, {});

    console.log("\nWordPress QA Statistics by Type:");
    Object.entries(typeCounts).forEach(([type, count]) => {
      console.log(`${type}: ${count} QAs`);
    });

    console.log(`\nGenerated ${validatedQAs.length} total WordPress QAs`);
    console.log("Sample WordPress QAs:", validatedQAs.slice(0, 2));

    return { validatedQAs, vectors };
  } catch (error) {
    console.error("Error in generateQAs (WordPress):", error);
    throw error;
  }
}

// Update the generateQAsForPrompt function
async function generateQAsForPrompt(
  productData: any,
  productId: number,
  prompt: string
) {
  try {
    // Replace placeholders in the prompt template
    let finalPrompt = prompt;
    const productJsonString = JSON.stringify(productData, null, 2);
    finalPrompt = finalPrompt.replace("${productJson}", productJsonString);

    // Replace specific product fields referenced in prompts like [product.name]
    finalPrompt = finalPrompt.replace(
      /\[product\.name\]/g,
      productData.name || "the product"
    );
    finalPrompt = finalPrompt.replace(
      /\[product\.permalink\]/g,
      productData.permalink || "/"
    );
    finalPrompt = finalPrompt.replace(
      /\[product\.price\]/g,
      (productData.price || 0).toString()
    );
    finalPrompt = finalPrompt.replace(
      /\[product\.stockQuantity\]/g,
      (productData.stockQuantity ?? "N/A").toString()
    );
    finalPrompt = finalPrompt.replace(
      /\[product\.wpId\]/g,
      (productData.wpId || 0).toString()
    );

    const completion = await createChatCompletionWithRetry(openai, {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: SYSTEM_MESSAGE,
        },
        {
          role: "user",
          content: finalPrompt,
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

    // Attempt to parse, log errors if invalid JSON
    let parsedContent;
    try {
      parsedContent = JSON.parse(content);
    } catch (parseError: any) {
      console.error("Failed to parse OpenAI response:", content);
      throw new Error(
        `Invalid JSON received from OpenAI: ${parseError.message}`
      );
    }

    if (!parsedContent.qas || !Array.isArray(parsedContent.qas)) {
      console.error("Invalid QA format in OpenAI response:", parsedContent);
      throw new Error(
        "Invalid QA format received from OpenAI (expected 'qas' array)"
      );
    }

    // Map prompt fields to QA structure, ensure product data consistency
    return parsedContent.qas.map((qa: any) => ({
      id: qa.id || `temp-${crypto.randomBytes(4).toString("hex")}`,
      questionType: qa.type || "text",
      question: qa.question || "",
      answer: qa.answer || "",
      webAction: qa.action || null,
      url: qa.url || null,
      category: qa.category || "general",
      subcategory: qa.subcategory || "general",
      product: {
        name: productData.name || "",
        description:
          productData.description || productData.shortDescription || "",
        price: productData.price || 0,
        stockQuantity: productData.stockQuantity,
      },
    }));
  } catch (error) {
    console.error("Error generating QAs for prompt (WordPress):", error);
    return [];
  }
}

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

// The "training" endpoint - Adapted for WordPress
export async function POST(request: NextRequest) {
  let productRecordId: number | undefined; // Use internal DB ID for updates
  let idFromRequest: number | undefined; // Keep track of requested internal ID
  let websiteIdFromRequest: string | undefined; // Keep track of requested websiteId

  try {
    // Expect id and websiteId - id is the internal database ID, not WordPress ID
    const { wpId: idRaw, websiteId } = await request.json();
    // Parse id to number if it's a string
    const id = typeof idRaw === "string" ? parseInt(idRaw, 10) : idRaw;

    idFromRequest = id;
    websiteIdFromRequest = websiteId;

    console.log("Received WordPress product training request with:", {
      id,
      websiteId,
    });

    // Basic input checks
    if (isNaN(id) || !websiteId) {
      const missingFields = [];
      if (isNaN(id)) missingFields.push("id (must be a valid number)");
      if (!websiteId) missingFields.push("websiteId");

      return cors(
        request,
        NextResponse.json(
          {
            error: "Missing or invalid required fields",
            missingFields,
          },
          { status: 400 }
        )
      );
    }

    // Find the product by internal ID, not wpId
    const product = await prisma.wordpressProduct.findFirst({
      where: {
        id: id,
        websiteId: websiteId,
      },
      include: {
        website: {
          include: {
            VectorDbConfig: true,
          },
        },
        // Include relations needed for productData generation
        categories: true,
        tags: true,
      },
    });

    if (!product) {
      console.log(
        `WordPress Product not found with internal ID: ${id} and websiteId: ${websiteId}`
      );
      return cors(
        request,
        NextResponse.json(
          { error: "WordPress Product not found in database" },
          { status: 404 }
        )
      );
    }

    // Store the internal database ID for updates (same as input in this case)
    productRecordId = product.id;

    // Set isTraining to true at the start using internal ID
    await prisma.wordpressProduct.update({
      where: { id: productRecordId },
      data: { isTraining: true },
    });

    console.log("Found WordPress product:", {
      id: product.id, // Internal DB ID
      wpId: product.wpId,
      name: product.name,
      websiteId: product.websiteId,
      qaNamespace: product.website.VectorDbConfig?.QANamespace,
      categoriesCount: product.categories?.length || 0,
      tagsCount: product.tags?.length || 0,
    });

    // Get the namespace from VectorDbConfig or fallback to website ID
    const qaNamespace =
      product.website.VectorDbConfig?.QANamespace || `${product.website.id}-qa`;
    console.log("Using QA namespace:", qaNamespace);

    // Initialize Pinecone index
    const index = pinecone.index("voicero-hybrid"); // Use your index name

    // Generate QAs using the WordPress product data and internal ID
    console.log("Generating QAs for WordPress product");
    let result;
    try {
      // Pass the full product object and its internal DB ID
      result = await generateQAs(product, productRecordId);
      console.log(
        `Successfully generated ${result.vectors.length} vectors for WP Product ${id}`
      );
    } catch (error: any) {
      console.error("Error generating QAs for WP product:", error);
      // Reset isTraining on error
      await prisma.wordpressProduct.update({
        where: { id: productRecordId },
        data: { isTraining: false },
      });
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
      `Upserting ${result.vectors.length} vectors to QA namespace: ${qaNamespace} for WP Product ${id}`
    );
    if (result.vectors.length > 0) {
      try {
        await index.namespace(qaNamespace).upsert(result.vectors);
        console.log("Successfully upserted vectors to Pinecone for WP Product");

        // Update the trained field to true using internal ID
        await prisma.wordpressProduct.update({
          where: { id: productRecordId },
          data: { trained: true, isTraining: false }, // Set trained true, isTraining false
        });
        console.log("Updated WP product trained status to true");
      } catch (error: any) {
        console.error(
          "Error upserting vectors to Pinecone for WP Product:",
          error
        );
        // Reset isTraining on error
        await prisma.wordpressProduct.update({
          where: { id: productRecordId },
          data: { isTraining: false },
        });
        return cors(
          request,
          NextResponse.json(
            { error: "Failed to upsert vectors", details: error.message },
            { status: 500 }
          )
        );
      }
    } else {
      console.warn(
        `No vectors generated for WP Product ${id}, skipping upsert.`
      );
      // Still need to mark training as finished (even if unsuccessful)
      await prisma.wordpressProduct.update({
        where: { id: productRecordId },
        data: { isTraining: false, trained: false }, // Mark as not trained if no vectors
      });
    }

    return cors(
      request,
      NextResponse.json({
        success: true,
        message: "Generated and stored QAs for WordPress product",
        count: result.vectors.length,
        wpProductId: id, // Return the id from the request
        processedQAs: result.validatedQAs.length,
        totalQAsGenerated: result.validatedQAs.length, // Reflect validated count
      })
    );
  } catch (error: any) {
    // Reset isTraining if there's an error and we have the ID
    if (productRecordId) {
      try {
        await prisma.wordpressProduct.update({
          where: { id: productRecordId },
          data: { isTraining: false },
        });
      } catch (updateError) {
        console.error("Failed to reset isTraining flag on error:", updateError);
      }
    } else {
      // If we didn't even find the product, try finding by id/websiteId again to reset
      if (idFromRequest && websiteIdFromRequest) {
        try {
          await prisma.wordpressProduct.updateMany({
            where: { id: idFromRequest, websiteId: websiteIdFromRequest },
            data: { isTraining: false },
          });
        } catch (updateManyError) {
          console.error(
            "Failed to reset isTraining flag via updateMany on error:",
            updateManyError
          );
        }
      }
    }

    console.error("Error in WordPress product training endpoint:", error);
    return cors(
      request,
      NextResponse.json(
        {
          error:
            "An error occurred while processing the WordPress product training request",
          details: error.message,
        },
        { status: 500 }
      )
    );
  }
}
