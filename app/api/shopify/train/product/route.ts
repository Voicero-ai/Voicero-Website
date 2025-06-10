// app/api/shopify/train/product/route.ts (for Next 13/15)

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
export const dynamic = "force-dynamic";

// System message for the AI - Edit this to modify AI behavior
const SYSTEM_MESSAGE = `You are a helpful assistant that generates questions and answers for products. Make voice responses more conversational and natural sounding. Questions should be human like questions based on the product. and answers should be quick, 1-2 short sentences so it makes better sense for voice. Always include specific product details in your answers. You must return valid JSON.`;

// Update the QA interface to match the test file
interface QA {
  id: string;
  questionType: "text" | "voice";
  question: string;
  answer: string;
  webAction: string | null;
  url: string | null;
  product: {
    title: string;
    description: string;
    price: number;
    priceMin: number;
    priceMax: number;
    totalInventory: number;
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

// Split into 6 separate prompts for each main category
const DISCOVERY_QA_PROMPT = `Generate 10 discovery questions and answers for the following product:
\${productJson}

Generate QAs for these subcategories:

1. USE CASE (3 text, 3 voice):
   - General questions about finding the right type of product
   - Examples:
     Q: "I'm looking for a product for [specific use]"
     A: "For [specific use], you'll want a versatile product that can handle different conditions. The [product.title] is designed for exactly that, with [feature] and [benefit]."
     action: "redirect"
     url: "/products/[handle]"

2. EXPERIENCE LEVEL (2 text, 2 voice):
   - Questions about finding the right product for their skill level
   - Examples:
     Q: "What kind of product is good for [specific skill level]?"
     A: "For [specific skill level], you'll want a forgiving product that's easy to control. The [product.title] is great for learning because [feature/benefit]."

IMPORTANT RULES:
1. Make discovery questions GENERAL about finding the right type of product
2. Don't mention specific product details until the answer
3. Use ACTUAL product features and benefits from the description
4. Make discovery answers more like natural sales conversations
5. Use the EXACT product type from product.productType
6. Use the EXACT vendor name from product.vendor
7. Discovery responses should build interest before mentioning price
8. Voice responses should be shorter and more conversational

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
      "action": "redirect",
      "url": "/products/[handle]"
    }
  ]
}`;

const ONPAGE_QA_PROMPT = `Generate 10 on-page questions and answers for the following product:
\${productJson}

Generate QAs for these subcategories:

1. FIT/SIZING (2 text, 2 voice):
   - Questions about size and fit
   - Examples:
     Q: "What size should I get for the [product.title]?"
     A: "The [product.title] comes in [list available sizes]. For your needs, I'd recommend [size]."
     action: "scroll"
     url: "/products/[handle]#[div-id]"

2. QUALITY/DURABILITY (2 text, 2 voice):
   - Questions about product quality
   - Examples:
     Q: "How long will the [product.title] last?"
     A: "The [product.title] is built with [quality feature] and should last [duration]. You can see the materials used in the specifications section."
     action: "scroll"
     url: "/products/[handle]#[div-id]"

3. FEATURE SPECIFIC (1 text, 1 voice):
   - Questions about specific features
   - Examples:
     Q: "Does the [product.title] have [feature]?"
     A: "Yes, the [product.title] includes [feature] which [benefit]. Let me show you in the features section."
     action: "scroll"
     url: "/products/[handle]#[div-id]"

IMPORTANT RULES:
1. ALWAYS use the EXACT product name and variant title when specified
2. For cart actions, use the CORRECT variant.id for the specific variant mentioned
3. If no specific variant is mentioned and multiple exist, ask which variant they want
4. For single variant products, use variants[0].id
5. ONLY use divIds that are provided in product.divIds
6. If a relevant divId doesn't exist, explain the information instead of trying to scroll
7. NEVER use pronouns like "this" or "it" - always use the full product name
8. Voice responses should be shorter and more conversational
9. If its right finish your answer with "would you like to add it to your cart?"
10. never use fake div ids, only use the ones given to you

Format your response EXACTLY as follows:
{
  "qas": [
    {
      "id": "temp-1",
      "type": "text" | "voice",
      "category": "on-page",
      "subcategory": "fit_sizing" | "quality_durability" | "feature_specific",
      "question": "string",
      "answer": "string",
      "action": "scroll" | "cart" | null,
      "url": "/products/[handle]#[div-id]" | "/cart/add?id=[variant-id]&quantity=1" | null
    }
  ]
}`;

const STATEMENT_QA_PROMPT = `Generate 10 statement responses for the following product:
\${productJson}

Generate QAs for these subcategories:

1. INTENT SIGNALS (2 text, 2 voice):
   - Positive statements about wanting to buy
   - Examples:
     Q: "I want something for [specific use]"
     A: "That's great! The [product.title] would be perfect for that because [feature/benefit]. Let me show you more about its features."
     action: "scroll"
     url: "/products/[handle]#[div-id]"

2. OBJECTIONS (2 text, 1 voice):
   - Negative statements about price or features
   - Examples:
     Q: "[product.title] seems expensive"
     A: "I understand your concern. The [product.title] is priced at $[price] because [value proposition]. Let me explain its value and quality."
     action: null
     url: null

3. CONCERNS/HESITATIONS (2 text, 1 voice):
   - Statements showing uncertainty
   - Examples:
     Q: "I'm not sure about the [product.title]"
     A: "Let me tell you more about the [product.title]. It offers [key feature] and [benefit]. I'll explain the specifications in detail."
     action: null
     url: null

IMPORTANT RULES:
1. ALWAYS use the EXACT product name and variant title when specified
2. ONLY include cart actions when explicitly requested (e.g., "let's get it", "add it to cart")
3. If no specific variant is mentioned and multiple exist, ask which variant
4. Make responses helpful and conversational
5. For positive statements without cart requests, offer more information
6. For negative statements, acknowledge and explain the value/benefits
7. NO automatic redirects or cart actions unless specifically requested
8. Voice responses should be shorter and more conversational
9. ONLY use divIds that are provided in product.divIds
10. If a relevant divId doesn't exist, explain the information instead of trying to scroll
11. never use fake div ids, only use the ones given to you

Format your response EXACTLY as follows:
{
  "qas": [
    {
      "id": "temp-1",
      "type": "text" | "voice",
      "category": "statement",
      "subcategory": "intent_signal" | "objection" | "concern_hesitation",
      "question": "string",
      "answer": "string",
      "action": "scroll" | "cart" | null,
      "url": "/products/[handle]#[div-id]" | "/cart/add?id=[variant-id]&quantity=1" | null
    }
  ]
}`;

const CLARIFYING_QA_PROMPT = `Generate 8 clarifying question responses for the following product:
\${productJson}

Generate QAs for these subcategories:

1. UNCLEAR INTENT (2 text, 2 voice):
   - Responses to vague statements that need clarification
   - Examples:
     Q: "I need something for [specific use]"
     A: "What kind of use are you looking for? Different products are designed for different purposes."
     action: null
     url: null

2. MISSING INFO (2 text, 2 voice):
   - Responses to incomplete questions
   - Examples:
     Q: "Can I get the [product.title] in a bigger size?"
     A: "Totally — what size are you looking for? This will help me recommend the right option for you."
     action: null
     url: null

IMPORTANT RULES:
1. ALWAYS use the EXACT product name and variant title when specified
2. Make clarifying questions specific and helpful
3. Focus on getting the information needed to provide better assistance
4. Keep responses conversational and friendly
5. Voice responses should be shorter and more conversational
6. NEVER use divIds or scroll actions in clarifying questions
7. Keep responses focused on gathering information

Format your response EXACTLY as follows:
{
  "qas": [
    {
      "id": "temp-1",
      "type": "text" | "voice",
      "category": "clarifying",
      "subcategory": "unclear_intent" | "missing_info",
      "question": "string",
      "answer": "string",
      "action": null,
      "url": null
    }
  ]
}`;

const OBJECTION_HANDLING_QA_PROMPT = `Generate 8 objection handling responses for the following product:
\${productJson}

Generate QAs for these subcategories:

1. PRICE/VALUE (2 text, 2 voice):
   - Responses to price-related objections
   - Examples:
     Q: "[product.title] is kinda expensive"
     A: "True — but the [product.title] is built to last and includes [value feature]. Let me explain why it's worth the investment."
     action: null
     url: null

2. TRUST/QUALITY (2 text, 2 voice):
   - Responses to brand/quality concerns
   - Examples:
     Q: "Never heard of [vendor]"
     A: "[Vendor] is well-reviewed and has been making [product type] for [duration]. Let me tell you more about their reputation and quality."
     action: null
     url: null

IMPORTANT RULES:
1. ALWAYS use the EXACT product name and variant title when specified
2. Address objections directly but positively
3. Focus on value and benefits
4. Keep responses conversational and helpful
5. Voice responses should be shorter and more conversational
6. NEVER use divIds or scroll actions in objection handling
7. Focus on explaining value and building trust

Format your response EXACTLY as follows:
{
  "qas": [
    {
      "id": "temp-1",
      "type": "text" | "voice",
      "category": "objection_handling",
      "subcategory": "price_value" | "trust_quality",
      "question": "string",
      "answer": "string",
      "action": null,
      "url": null
    }
  ]
}`;

const CART_ACTIONS_QA_PROMPT = `Generate 6 cart action responses for the following product:
\${productJson}

Generate QAs for these subcategories:

1. ADD/REMOVE/UPDATE (3 text, 3 voice):
   For products with multiple variants:
   Q: "Add the [variant.title] [product.title] to my cart"
   A: "I'll add the [variant.title] [product.title] to your cart."
   action: "cart"
   url: "/cart/add?id=[specific-variant.id]&quantity=1"

   Q: "I want [number] of the [variant.title] [product.title]"
   A: "I'll update your cart to [number] [variant.title] [product.title]."
   action: "cart"
   url: "/cart/update?id=[specific-variant.id]&quantity=[number]"

   Q: "Remove the [variant.title] [product.title] from my cart"
   A: "I'll remove the [variant.title] [product.title] from your cart."
   action: "cart"
   url: "/cart/update?id=[specific-variant.id]&quantity=0"

IMPORTANT RULES:
1. ALWAYS use the EXACT product name and variant title when specified
2. For cart actions, use the CORRECT variant.id for the specific variant mentioned
3. If no specific variant is mentioned and multiple exist, ask which variant they want
4. For single variant products, use variants[0].id
5. Keep responses clear and action-oriented
6. Voice responses should be shorter and more conversational
7. ALWAYS use "your cart" instead of "the cart" or "my cart"
8. Make cart responses personal and specific to the user
9. NEVER use divIds or scroll actions in cart responses
10. Focus on clear, direct cart actions

Format your response EXACTLY as follows:
{
  "qas": [
    {
      "id": "temp-1",
      "type": "text" | "voice",
      "category": "cart_action",
      "subcategory": "add_remove_update",
      "question": "string",
      "answer": "string",
      "action": "cart" | "redirect",
      "url": "/cart/add?id=[variant-id]&quantity=1" | "/cart/update?id=[variant-id]&quantity=[number]" | "/cart"
    }
  ]
}`;

// Function to process QAs and generate vectors
async function processQAs(
  qas: any[],
  vectorId: string,
  product: any,
  category: string
) {
  const sectionVectors = [];
  let processedCount = 0;

  // Create a sanitized product title for IDs
  const sanitizedTitle = product.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  for (const qa of qas) {
    try {
      const qaText = `${qa.question} ${qa.answer}`;
      const type = "product"; // Hardcoded type
      const qaCategory = category || qa.category || "general";
      const qaSubcategory = qa.subcategory || "general";

      console.log(`Generating vectors for QA ${qa.id}:`, {
        question: qa.question.substring(0, 50) + "...",
        category: qaCategory,
        subcategory: qaSubcategory,
      });

      const [denseVector, sparseVector] = await Promise.all([
        embeddings.embedQuery(qaText),
        // Pass the additional fields to generateSparseVectors
        generateSparseVectors(qaText, type, qaCategory, qaSubcategory),
      ]);

      // Add product metadata to each QA
      const productMetadata = {
        title: product.title || "",
        description: product.description || "",
        price: product.variants?.[0]?.price || 0,
        productUrl: `/products/${product.handle}` || "",
        priceMin:
          product.variants?.length > 0
            ? Math.min(...product.variants.map((v: any) => v.price))
            : 0,
        priceMax:
          product.variants?.length > 0
            ? Math.max(...product.variants.map((v: any) => v.price))
            : 0,
        totalInventory: product.totalInventory || 0,
      };

      sectionVectors.push({
        id: `qa-${sanitizedTitle}-${crypto.randomBytes(8).toString("hex")}`,
        values: denseVector,
        sparseValues: sparseVector,
        metadata: {
          type: type, // Use the variable
          category: qaCategory,
          subcategory: qaSubcategory,
          questionType: qa.questionType || "text",
          question: qa.question || "",
          answer: qa.answer || "",
          webAction: qa.webAction || "",
          url: qa.url || "",
          productId: vectorId,
          ...productMetadata,
        },
      });
      processedCount++;
    } catch (error: any) {
      console.error(`Error processing QA ${qa.id}:`, error);
    }
  }
  return sectionVectors;
}

// Update the generateQAs function to handle multiple prompts
async function generateQAs(product: any, vectorId: string) {
  try {
    console.log("Preparing product data for QA generation:", {
      fromDatabase: Boolean(product.websiteId),
      productId: product.id,
      shopifyId: product.shopifyId,
      vectorId: vectorId,
    });

    // Get variants with prices
    const variants = (product.variants || []).map((v: any) => ({
      title: v.title || "",
      price: v.price || 0,
      compareAtPrice: v.compareAtPrice || 0,
      sku: v.sku || "",
      inventory: v.inventory || 0,
    }));

    // Calculate price range
    const prices = variants.map((v: any) => v.price).filter(Boolean);
    const priceRange =
      prices.length > 0
        ? {
            min: Math.min(...prices),
            max: Math.max(...prices),
          }
        : null;

    // Extract div IDs from scrapedHtml
    const divIds = [];
    if (product.scrapedHtml) {
      const idRegex = /\sid=["']([^"']+)["']/g;
      let match;
      while ((match = idRegex.exec(product.scrapedHtml)) !== null) {
        divIds.push(match[1]);
      }
    }

    // Use database fields with enhanced data
    const productData = {
      title: product.title || "",
      description: product.description || "",
      descriptionHtml: product.bodyHtml || "",
      handle: product.handle || "",
      productType: product.productType || "",
      vendor: product.vendor || "",
      status: product.status || "",
      tags: product.tags || [],
      priceRange,
      variants,
      images: (product.images || []).map((img: any) => img.url),
      totalInventory: product.totalInventory,
      hasOutOfStockVariants: product.hasOutOfStockVariants,
      tracksInventory: product.tracksInventory,
      divIds,
      scrapedHtml: product.scrapedHtml || "",

      // Remove any circular references or unnecessary fields
      website: undefined,
      VectorDbConfig: undefined,
    };

    console.log(
      "Generated product data for QAs:",
      JSON.stringify(productData, null, 2)
    );

    // Array to store all vectors
    const vectors = [];
    let processedCount = 0;

    // Generate QAs for each category and process them in parallel
    console.log("\nGenerating Discovery QAs...");
    const discoveryQAs = await generateQAsForPrompt(
      productData,
      vectorId,
      DISCOVERY_QA_PROMPT
    );
    const discoveryVectorsPromise = processQAs(
      discoveryQAs,
      vectorId,
      product,
      "discovery"
    );

    console.log("\nGenerating On-Page QAs...");
    const onPageQAs = await generateQAsForPrompt(
      productData,
      vectorId,
      ONPAGE_QA_PROMPT
    );
    const onPageVectorsPromise = processQAs(
      onPageQAs,
      vectorId,
      product,
      "on-page"
    );

    console.log("\nGenerating Statement QAs...");
    const statementQAs = await generateQAsForPrompt(
      productData,
      vectorId,
      STATEMENT_QA_PROMPT
    );
    const statementVectorsPromise = processQAs(
      statementQAs,
      vectorId,
      product,
      "statement"
    );

    console.log("\nGenerating Clarifying QAs...");
    const clarifyingQAs = await generateQAsForPrompt(
      productData,
      vectorId,
      CLARIFYING_QA_PROMPT
    );
    const clarifyingVectorsPromise = processQAs(
      clarifyingQAs,
      vectorId,
      product,
      "clarifying"
    );

    console.log("\nGenerating Objection Handling QAs...");
    const objectionHandlingQAs = await generateQAsForPrompt(
      productData,
      vectorId,
      OBJECTION_HANDLING_QA_PROMPT
    );
    const objectionHandlingVectorsPromise = processQAs(
      objectionHandlingQAs,
      vectorId,
      product,
      "objection_handling"
    );

    console.log("\nGenerating Cart Action QAs...");
    const cartActionQAs = await generateQAsForPrompt(
      productData,
      vectorId,
      CART_ACTIONS_QA_PROMPT
    );
    const cartActionVectorsPromise = processQAs(
      cartActionQAs,
      vectorId,
      product,
      "cart_action"
    );

    // Wait for all vector processing to complete
    const [
      discoveryVectors,
      onPageVectors,
      statementVectors,
      clarifyingVectors,
      objectionHandlingVectors,
      cartActionVectors,
    ] = await Promise.all([
      discoveryVectorsPromise,
      onPageVectorsPromise,
      statementVectorsPromise,
      clarifyingVectorsPromise,
      objectionHandlingVectorsPromise,
      cartActionVectorsPromise,
    ]);

    // Combine all vectors
    vectors.push(
      ...discoveryVectors,
      ...onPageVectors,
      ...statementVectors,
      ...clarifyingVectors,
      ...objectionHandlingVectors,
      ...cartActionVectors
    );

    // Combine all QAs for validation
    const allQAs = [
      ...discoveryQAs,
      ...onPageQAs,
      ...statementQAs,
      ...clarifyingQAs,
      ...objectionHandlingQAs,
      ...cartActionQAs,
    ];

    // Create a sanitized product title for IDs
    const sanitizedTitle = product.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    // Make IDs unique by adding product ID and sanitized title
    allQAs.forEach((qa, index) => {
      qa.id = `qa-${sanitizedTitle}-${crypto.randomBytes(8).toString("hex")}`;
      qa.webAction = qa.webAction || null;
      qa.url = qa.url || null;
      qa.questionType = qa.questionType || "text";
      qa.product = {
        title: product.title || "",
        description: product.description || "",
        price: product.variants?.[0]?.price || 0,
        priceMin: product.priceRange?.min || 0,
        priceMax: product.priceRange?.max || 0,
        totalInventory: product.totalInventory || 0,
      };
    });

    // Validate each QA - only check for required fields
    const validatedQAs = allQAs.filter((qa) => {
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

// Update the generateQAsForPrompt function to ensure proper structure
async function generateQAsForPrompt(
  productData: any,
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
            "${productJson}",
            JSON.stringify(productData, null, 2)
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

    // Convert null values to empty strings and ensure proper structure
    return parsedContent.qas.map((qa: any) => ({
      ...qa,
      webAction: qa.webAction || null,
      url: qa.url || null,
      questionType: qa.questionType || "text",
      product: {
        title: productData.title || "",
        description: productData.description || "",
        price: productData.variants?.[0]?.price || 0,
        priceMin: productData.priceRange?.min || 0,
        priceMax: productData.priceRange?.max || 0,
        totalInventory: productData.totalInventory || 0,
      },
    }));
  } catch (error) {
    console.error("Error generating QAs for prompt:", error);
    return [];
  }
}

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

// The "training" endpoint
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
    await prisma.shopifyProduct.update({
      where: { id },
      data: { isTraining: true },
    });

    // Get the website ID from the product
    console.log("Looking up product with ID:", id);
    const product = await prisma.shopifyProduct.findFirst({
      where: { id },
      include: {
        website: {
          include: {
            VectorDbConfig: true,
          },
        },
        variants: true,
        images: true,
      },
    });

    if (!product) {
      // Reset isTraining if product not found
      await prisma.shopifyProduct.update({
        where: { id },
        data: { isTraining: false },
      });
      console.log("Product not found in database with ID:", id);
      return cors(
        request,
        NextResponse.json(
          { error: "Product not found in database" },
          { status: 404 }
        )
      );
    }

    console.log("Found product:", {
      id: product.id,
      title: product.title,
      websiteId: product.websiteId,
      qaNamespace: product.website.VectorDbConfig?.QANamespace,
      variantsCount: product.variants?.length || 0,
      imagesCount: product.images?.length || 0,
    });

    // Get the namespace from VectorDbConfig or fallback to website ID
    const qaNamespace =
      product.website.VectorDbConfig?.QANamespace || `${product.website.id}-qa`;
    console.log("Using QA namespace:", qaNamespace);

    // Initialize Pinecone index
    const index = pinecone.index("voicero-hybrid");

    // Generate QAs using the database data
    console.log("Generating QAs for product");
    let result;
    try {
      result = await generateQAs(product, vectorId);
      console.log(`Successfully generated ${result.vectors.length} QAs`);
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
        await prisma.shopifyProduct.update({
          where: { id },
          data: { trained: true },
        });
        console.log("Updated product trained status to true");
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
    await prisma.shopifyProduct.update({
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
        message: "Generated and stored QAs for product",
        count: result.vectors.length,
        productId: vectorId,
        processedQAs: result.validatedQAs.length,
        totalQAs: result.validatedQAs.length,
      })
    );
  } catch (error: any) {
    // Reset isTraining if there's an error
    if (id) {
      await prisma.shopifyProduct.update({
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
