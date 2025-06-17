import { NextRequest, NextResponse } from "next/server";
import prisma from "../../../../../lib/prisma";
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Client } from "@opensearch-project/opensearch";
import { cors } from "../../../../../lib/cors";
import { RecordSparseValues } from "@pinecone-database/pinecone";
import { v4 as uuidv4 } from "uuid"; // For generating unique IDs
import OpenAI from "openai";
import crypto from "crypto";
import { Prisma } from "@prisma/client"; // Import Prisma namespace
import { createChatCompletionWithRetry } from "../../../../../lib/openai-utils";
export const dynamic = "force-dynamic";

// Define the type based on the query including relations
const wordpressPageWithRelations =
  Prisma.validator<Prisma.WordpressPageDefaultArgs>()({
    include: {
      website: {
        include: {
          VectorDbConfig: true,
        },
      },
    },
  });

type WordpressPageWithRelations = Prisma.WordpressPageGetPayload<
  typeof wordpressPageWithRelations
>;

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

// Helper function to generate sparse vectors (updated signature and logic)
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

// System message for the AI - Updated for WordPress Pages
const SYSTEM_MESSAGE = `You are a helpful assistant that generates questions and answers for WordPress pages. Your task is to:
1. Generate discovery QAs about the page overall (always use "redirect" action with the page link)
2. Generate on-page QAs about specific information (use scrollText to point to exact content)
3. Generate statement QAs about user intentions (use scrollText when referencing specific parts)

CRITICAL RULES FOR scrollText:
- Use SHORT, EXACT phrases from the page content
- Even 2-3 words is fine if they match exactly
- DO NOT try to paraphrase or combine text
- DO NOT use long sentences or paragraphs
- If you can't find an exact match, use a shorter phrase that does match
- Examples of good scrollText:
  ✓ "privacy policy"
  ✓ "contact information"
  ✓ "terms of service"
- Examples of bad scrollText:
  ✗ "we will treat this as a request to opt-out"
  ✗ "if you visit our website with the Global Privacy Control"
  ✗ "we collect personal information from your interactions"

Keep answers concise and natural:
- Text answers: 20-40 words
- Voice answers: 10-20 words

You must return valid JSON in the specified format.`;

// ============================================================================

// Update the QA interface for WordPress Pages
interface QA {
  id: string;
  questionType: "text" | "voice";
  question: string;
  answer: string;
  webAction: string | null;
  url: string | null;
  scrollText?: string | null;
  page: {
    title: string;
    description: string; // Use content as description
    pageUrl: string; // Use link as pageUrl
  };
}

// Function to process QAs and generate vectors (updated for WordPress Pages)
async function processQAs(
  qas: any[],
  pageRecordId: number, // Use internal DB ID
  page: WordpressPageWithRelations, // Use the specific type
  category: string
) {
  const sectionVectors = [];
  let processedCount = 0;

  // Create a sanitized page title for IDs
  const sanitizedTitle = (page.title || `page-${page.wpId}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  for (const qa of qas) {
    try {
      const qaText = `${qa.question} ${qa.answer}`;
      const type = "page"; // Hardcoded type for pages
      const qaCategory = category || qa.category || "general"; // Use passed category first
      const qaSubcategory = qa.subcategory || "general"; // Use QA's subcategory

      console.log(`Generating vectors for QA (WP Page: ${page.wpId}):`, {
        question: qa.question.substring(0, 50) + "...",
        category: qaCategory,
        subcategory: qaSubcategory,
      });

      const [denseVector, sparseVector] = await Promise.all([
        embeddings.embedQuery(qaText),
        generateSparseVectors(qaText, type, qaCategory, qaSubcategory),
      ]);

      // Base metadata for WordPress page with no nulls
      const baseMetadata: Record<string, any> = {
        title: page.title || "",
        description: page.content || "",
        pageUrl: page.link || "",
        type: type,
        category: qaCategory,
        subcategory: qaSubcategory,
        questionType: qa.questionType || "text",
        question: qa.question || "",
        answer: qa.answer || "",
        webAction: qa.webAction || qa.action || "",
        url: qa.url || "",
      };

      // Add scrollText only if it exists
      if (qa.scrollText) {
        baseMetadata.scrollText = qa.scrollText;
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
        // Use sanitized title and WP ID for uniqueness, plus random bytes
        id: `qa-wp-page-${sanitizedTitle}-${page.wpId}-${crypto
          .randomBytes(4)
          .toString("hex")}`,
        values: denseVector,
        sparseValues: sparseVector,
        metadata: baseMetadata,
      });
      processedCount++;
    } catch (error: any) {
      console.error(`Error processing QA for WP Page ${page.wpId}:`, error);
    }
  }
  return sectionVectors;
}

// Update the generateQAs function for WordPress Pages
async function generateQAs(
  page: WordpressPageWithRelations,
  pageRecordId: number
) {
  try {
    console.log("Preparing WordPress page data for QA generation:", {
      fromDatabase: Boolean(page.websiteId),
      pageRecordId: pageRecordId, // Internal DB ID
      wpId: page.wpId, // WordPress specific ID
      websiteId: page.websiteId,
    });

    // Use WordPress database fields
    const pageData = {
      wpId: page.wpId,
      title: page.title || "",
      content: page.content || "", // Content for scrollText matching
      link: page.link || "", // Page URL
      slug: page.slug || "",
    };

    // Check if this is a shop page
    const isShopPage =
      pageData.link.includes("/shop") ||
      pageData.slug.includes("shop") ||
      pageData.title.toLowerCase().includes("shop");

    console.log(
      "Generated WordPress page data for QAs:",
      JSON.stringify({ ...pageData, isShopPage }, null, 2)
    );

    // Array to store all vectors
    const vectors = [];

    // Generate QAs for each category and process them in parallel
    console.log("\nGenerating Discovery QAs (WordPress Page)...");
    const discoveryQAs = await generateQAsForPrompt(
      pageData,
      pageRecordId,
      DISCOVERY_QA_PROMPT
    );
    const discoveryVectorsPromise = processQAs(
      discoveryQAs,
      pageRecordId,
      page,
      "discovery"
    );

    console.log("\nGenerating On-Page QAs (WordPress Page)...");
    const onPageQAs = await generateQAsForPrompt(
      pageData,
      pageRecordId,
      ON_PAGE_QA_PROMPT
    );
    const onPageVectorsPromise = processQAs(
      onPageQAs,
      pageRecordId,
      page,
      "on-page"
    );

    console.log("\nGenerating Statement QAs (WordPress Page)...");
    const statementQAs = await generateQAsForPrompt(
      pageData,
      pageRecordId,
      STATEMENT_QA_PROMPT
    );
    const statementVectorsPromise = processQAs(
      statementQAs,
      pageRecordId,
      page,
      "statement"
    );

    // Generate Shop-specific QAs if this is a shop page
    let shopQAs: any[] = [];
    let shopVectorsPromise = Promise.resolve(
      [] as Array<{
        id: string;
        values: number[];
        sparseValues: RecordSparseValues;
        metadata: Record<string, any>;
      }>
    );

    if (isShopPage) {
      console.log("\nGenerating Shop-specific QAs (WordPress Shop Page)...");
      shopQAs = await generateQAsForPrompt(
        pageData,
        pageRecordId,
        SHOP_QA_PROMPT
      );
      shopVectorsPromise = processQAs(shopQAs, pageRecordId, page, "shop");
    }

    // Wait for all vector processing to complete
    const [discoveryVectors, onPageVectors, statementVectors, shopVectors] =
      await Promise.all([
        discoveryVectorsPromise,
        onPageVectorsPromise,
        statementVectorsPromise,
        shopVectorsPromise,
      ]);

    // Combine all vectors
    vectors.push(
      ...discoveryVectors,
      ...onPageVectors,
      ...statementVectors,
      ...shopVectors
    );

    // Combine all QAs with category assignments
    const categorizedQAs = [
      ...discoveryQAs.map((qa: any) => ({ ...qa, category: "discovery" })),
      ...onPageQAs.map((qa: any) => ({ ...qa, category: "on-page" })),
      ...statementQAs.map((qa: any) => ({ ...qa, category: "statement" })),
      ...shopQAs.map((qa: any) => ({ ...qa, category: "shop" })),
    ];

    // Create a sanitized page title for IDs
    const sanitizedTitle = (page.title || `page-${page.wpId}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    // Make IDs unique and ensure fields are set
    categorizedQAs.forEach((qa, index) => {
      qa.id = `qa-wp-page-${sanitizedTitle}-${page.wpId}-${crypto
        .randomBytes(4)
        .toString("hex")}-${index}`;
      qa.webAction = qa.webAction || null;
      qa.url = qa.url || null;
      qa.scrollText = qa.scrollText || null;
      qa.questionType = qa.questionType || "text";
      qa.page = {
        title: page.title || "",
        description: page.content || "",
        pageUrl: page.link || "",
      };
      qa.category = qa.category || "general";
      qa.subcategory = qa.subcategory || "general";
    });

    // Validate each QA
    const validatedQAs = categorizedQAs.filter((qa) => {
      const isValid =
        qa.id &&
        qa.questionType &&
        qa.question &&
        qa.answer &&
        qa.category &&
        qa.subcategory;

      if (!isValid) {
        console.warn("Filtered out invalid WP Page QA:", qa);
      }
      return isValid;
    });

    if (validatedQAs.length === 0) {
      throw new Error("No valid QAs generated for WordPress page");
    }

    // Log QA counts by type
    const typeCounts = validatedQAs.reduce((acc: any, qa) => {
      acc[qa.questionType] = (acc[qa.questionType] || 0) + 1;
      return acc;
    }, {});

    console.log("\nWordPress Page QA Statistics by Type:");
    Object.entries(typeCounts).forEach(([type, count]) => {
      console.log(`${type}: ${count} QAs`);
    });

    console.log(`\nGenerated ${validatedQAs.length} total WordPress Page QAs`);
    console.log("Sample WordPress Page QAs:", validatedQAs.slice(0, 2));

    return { validatedQAs, vectors };
  } catch (error) {
    console.error("Error in generateQAs (WordPress Page):", error);
    throw error;
  }
}

// Update the generateQAsForPrompt function for WordPress Pages
async function generateQAsForPrompt(
  pageData: any,
  pageRecordId: number,
  prompt: string
) {
  try {
    const completion = await createChatCompletionWithRetry(openai, {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: SYSTEM_MESSAGE,
        },
        {
          role: "user",
          content: prompt.replace(
            "${pageJson}",
            JSON.stringify(pageData, null, 2)
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

    // Map prompt fields to QA structure and ensure consistency
    return parsedContent.qas.map((qa: any) => ({
      id: qa.id || `temp-${crypto.randomBytes(4).toString("hex")}`,
      questionType: qa.type || "text",
      question: qa.question || "",
      answer: qa.answer || "",
      webAction: qa.action || null,
      url: qa.url || null,
      scrollText: qa.scrollText || null,
      category: qa.category || "general",
      subcategory: qa.subcategory || "general",
      page: {
        title: pageData.title || "",
        description: pageData.content || "",
        pageUrl: pageData.link || "",
      },
    }));
  } catch (error) {
    console.error("Error generating QAs for prompt (WordPress Page):", error);
    return [];
  }
}

// Split into 3 separate prompts for each main category - Adapted for WordPress Pages
const DISCOVERY_QA_PROMPT = `Generate 10 discovery questions and answers for the following WordPress page:
\${pageJson}

Generate QAs for these subcategories:

1. PAGE_PURPOSE (3 text, 3 voice):
   - Questions about what the page is for and who it's for
   - Text answers: Overview of main purpose in 2-3 sentences (20-40 words)
   - Voice answers: Brief purpose overview in 1-2 sentences (10-20 words)
   - Always uses "redirect" action with the page's link
   - Examples:
     Q: "What kind of information can I find on this page?"
     A: "This page explains [main purpose from content]. It's designed for [target audience] looking to learn about [topic]."
     action: "redirect"
     url: "[page.link]"

2. CONTENT_OVERVIEW (2 text, 2 voice):
   - Questions about what content and sections are available
   - Text answers: List main sections in 2-3 sentences (20-40 words)
   - Voice answers: Quick section overview in 1-2 sentences (10-20 words)
   - Always uses "redirect" action with the page's link
   - Examples:
     Q: "What sections does this page have?"
     A: "The page covers [list main sections from content]. Each section provides detailed information about [topic]."
     action: "redirect"
     url: "[page.link]"

Format as:
{
  "qas": [
    {
      "id": "qa-discovery-1",
      "type": "text" | "voice",
      "category": "discovery",
      "subcategory": "page_purpose" | "content_overview",
      "question": "string",
      "answer": "string",
      "action": "redirect",
      "url": "[page.link]"
    }
  ]
}`;

const ON_PAGE_QA_PROMPT = `Generate 10 on-page questions and answers for the following WordPress page:
\${pageJson}

Generate QAs for these subcategories:

1. SECTION_CONTENT (2 text, 2 voice):
   - Questions about specific section content
   - Text answers: Section overview + scroll prompt (20-40 words)
   - Voice answers: Brief section info + scroll prompt (10-20 words)
   - Include scrollText with EXACT text from the page content that answers the question
   - DO NOT modify or paraphrase the text - it must be an exact copy from the content field
   - Examples:
     Q: "What does the [section name] section cover?"
     A: "Let me show you the exact section that explains this."
     action: "scroll"
     url: null
     scrollText: "[EXACT text copied from the page content]"

2. NAVIGATION (2 text, 2 voice):
   - Questions about finding specific information
   - Text answers: Location + scroll prompt (20-40 words)
   - Voice answers: Quick location + scroll prompt (10-20 words)
   - Include scrollText with EXACT text from the content that contains the information
   - DO NOT modify or paraphrase the text - it must be an exact copy
   - Examples:
     Q: "Where can I find information about [topic]?"
     A: "I'll show you the exact section that covers this."
     action: "scroll"
     url: null
     scrollText: "[EXACT text copied from the page content]"

CRITICAL RULES FOR scrollText:
- Use SHORT, EXACT phrases from the page content
- Even 2-3 words is fine if they match exactly
- DO NOT try to paraphrase or combine text
- DO NOT use long sentences or paragraphs
- If you can't find an exact match, use a shorter phrase that does match

Format as:
{
  "qas": [
    {
      "id": "qa-on_page-1",
      "type": "text" | "voice",
      "category": "on_page",
      "subcategory": "section_content" | "navigation",
      "question": "string",
      "answer": "string",
      "action": "scroll" | null,
      "url": null,
      "scrollText": "exact copied text from page content" | null
    }
  ]
}`;

const STATEMENT_QA_PROMPT = `Generate 10 statement-based questions and answers for the following WordPress page:
\${pageJson}

Generate QAs for these subcategories:

1. INTENT (2 text, 2 voice):
   - Questions about user goals and intentions
   - Text answers: Goal-focused overview + relevant section (20-40 words)
   - Voice answers: Quick goal response + section reference (10-20 words)
   - Include scrollText when referencing specific content
   - Examples:
     Q: "I want to learn about [topic]"
     A: "Let me show you the exact information about [topic] from our page."
     action: "scroll"
     url: null
     scrollText: "exact text from page content about the topic"

2. CLARIFICATION (2 text, 2 voice):
   - Questions clarifying page content or sections
   - Text answers: Clarification + section reference (20-40 words)
   - Voice answers: Brief clarification + scroll prompt (10-20 words)
   - Include scrollText when referencing specific content
   - Examples:
     Q: "I'm not sure what [term] means"
     A: "Let me show you where the page explains this term."
     action: "scroll"
     url: null
     scrollText: "exact text from page content explaining the term"

CRITICAL RULES FOR scrollText:
- Use SHORT, EXACT phrases from the page content
- Even 2-3 words is fine if they match exactly
- DO NOT try to paraphrase or combine text
- DO NOT use long sentences or paragraphs
- If you can't find an exact match, use a shorter phrase that does match

Format as:
{
  "qas": [
    {
      "id": "qa-statement-1",
      "type": "text" | "voice",
      "category": "statement",
      "subcategory": "intent" | "clarification",
      "question": "string",
      "answer": "string",
      "action": "scroll" | "redirect" | null,
      "url": "[page.link]" | null,
      "scrollText": "exact text from page content" | null
    }
  ]
}`;

// Add a new prompt for shop-specific QAs
const SHOP_QA_PROMPT = `Generate 20 shop-specific questions and answers for the following WordPress shop page:
\${pageJson}

Generate QAs for these subcategories:

1. SORTING (8 text, 8 voice):
   - Questions about sorting products in different ways
   - Text answers: 20-40 words explaining sorting option
   - Voice answers: 10-20 words explaining sorting option
   - Always use "redirect" action with modified URL for sorting
   - IMPORTANT: Always append the correct sorting parameter to the base URL
   - Examples:
     Q: "How can I sort products by price?"
     A: "You can sort products from lowest to highest price. I'll take you there."
     action: "redirect"
     url: "[page.link]?orderby=price"  // Append ?orderby=price
     
     Q: "Can I see the most expensive items first?"
     A: "Yes, I can show you products sorted from highest to lowest price."
     action: "redirect"
     url: "[page.link]?orderby=price-desc"  // For price high to low
     
     Q: "Show me the newest products"
     A: "I'll show you the products sorted by most recently added."
     action: "redirect"
     url: "[page.link]?orderby=date"  // For newest products

     Q: "Show me the highest rated products"
     A: "I'll show you the products sorted by highest rating."
     action: "redirect"
     url: "[page.link]?orderby=rating"  // For highest rating

     Q: "Show me the most popular products"
     A: "I'll show you the products sorted by popularity."
     action: "redirect"
     url: "[page.link]?orderby=popularity"  // For most popular

2. FILTERING (2 text, 2 voice):
   - Questions about filtering products by category or attributes
   - Text answers: 20-40 words explaining filtering options
   - Voice answers: 10-20 words explaining filtering options
   - Always use "redirect" action with the shop page URL
   - Examples:
     Q: "Can I filter products by category?"
     A: "Yes, you can browse products by categories. I'll take you to the shop page."
     action: "redirect"
     url: "[page.link]"

IMPORTANT: For sorting questions, ensure the URL has the appropriate parameter:
- Price (low to high): ?orderby=price
- Price (high to low): ?orderby=price-desc
- Popularity: ?orderby=popularity
- Average rating: ?orderby=rating
- Latest/newest: ?orderby=date

Format as:
{
  "qas": [
    {
      "id": "qa-shop-1",
      "type": "text" | "voice",
      "category": "shop",
      "subcategory": "sorting" | "filtering",
      "question": "string",
      "answer": "string",
      "action": "redirect",
      "url": "string (include orderby parameter for sorting)"
    }
  ]
}`;

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

// The "training" endpoint - Adapted for WordPress Pages
export async function POST(request: NextRequest) {
  let pageRecordId: number | undefined; // Use internal DB ID for updates
  let idFromRequest: number | undefined; // Keep track of requested internal ID
  let websiteIdFromRequest: string | undefined; // Keep track of requested websiteId

  try {
    // Expect id and websiteId - id is the internal database ID, not WordPress ID
    const { wpId: idRaw, websiteId } = await request.json();
    // Parse id to number if it's a string
    const id = typeof idRaw === "string" ? parseInt(idRaw, 10) : idRaw;

    idFromRequest = id;
    websiteIdFromRequest = websiteId;

    console.log("Received WordPress page training request with:", {
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

    // Find the page by internal ID, not wpId
    const page = await prisma.wordpressPage.findFirst({
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
      },
    });

    if (!page) {
      console.log(
        `WordPress Page not found with internal ID: ${id} and websiteId: ${websiteId}`
      );
      return cors(
        request,
        NextResponse.json(
          { error: "WordPress Page not found in database" },
          { status: 404 }
        )
      );
    }

    // Store the internal database ID for updates (same as input in this case)
    pageRecordId = page.id;

    // Set isTraining to true at the start using internal ID
    await prisma.wordpressPage.update({
      where: { id: pageRecordId },
      data: { isTraining: true },
    });

    console.log("Found WordPress page:", {
      id: page.id, // Internal DB ID
      wpId: page.wpId,
      title: page.title,
      websiteId: page.websiteId,
      qaNamespace: page.website.VectorDbConfig?.QANamespace,
    });

    // Get the namespace from VectorDbConfig or fallback to website ID
    const qaNamespace =
      page.website.VectorDbConfig?.QANamespace || `${page.website.id}-qa`;
    console.log("Using QA namespace:", qaNamespace);

    // Initialize Pinecone index
    const index = pinecone.index("voicero-hybrid");

    // Generate QAs using the WordPress page data and internal ID
    console.log("Generating QAs for WordPress page");
    let result;
    try {
      // Pass the full page object and its internal DB ID
      result = await generateQAs(page, pageRecordId);
      console.log(
        `Successfully generated ${result.vectors.length} vectors for WP Page ${id}`
      );
    } catch (error: any) {
      console.error("Error generating QAs for WP page:", error);
      // Reset isTraining on error
      await prisma.wordpressPage.update({
        where: { id: pageRecordId },
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
      `Upserting ${result.vectors.length} vectors to QA namespace: ${qaNamespace} for WP Page ${id}`
    );
    if (result.vectors.length > 0) {
      try {
        await index.namespace(qaNamespace).upsert(result.vectors);
        console.log("Successfully upserted vectors to Pinecone for WP Page");

        // Update the trained field to true using internal ID
        await prisma.wordpressPage.update({
          where: { id: pageRecordId },
          data: { trained: true, isTraining: false }, // Set trained true, isTraining false
        });
        console.log("Updated WP page trained status to true");
      } catch (error: any) {
        console.error(
          "Error upserting vectors to Pinecone for WP Page:",
          error
        );
        // Reset isTraining on error
        await prisma.wordpressPage.update({
          where: { id: pageRecordId },
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
      console.warn(`No vectors generated for WP Page ${id}, skipping upsert.`);
      // Still need to mark training as finished (even if unsuccessful)
      await prisma.wordpressPage.update({
        where: { id: pageRecordId },
        data: { isTraining: false, trained: false }, // Mark as not trained if no vectors
      });

      return cors(
        request,
        NextResponse.json({
          success: true,
          message: "WordPress page processed but no vectors were generated",
          count: 0,
          wpPageId: id,
          processedQAs: 0,
          totalQAsGenerated: 0,
        })
      );
    }

    return cors(
      request,
      NextResponse.json({
        success: true,
        message: "Generated and stored QAs for WordPress page",
        count: result.vectors.length,
        wpPageId: id, // Return the id from the request
        processedQAs: result.validatedQAs.length,
        totalQAsGenerated: result.validatedQAs.length, // Reflect validated count
      })
    );
  } catch (error: any) {
    // Reset isTraining if there's an error and we have the ID
    if (pageRecordId) {
      try {
        await prisma.wordpressPage.update({
          where: { id: pageRecordId },
          data: { isTraining: false },
        });
      } catch (updateError) {
        console.error("Failed to reset isTraining flag on error:", updateError);
      }
    } else {
      // If we didn't even find the page, try finding by id/websiteId again to reset
      if (idFromRequest && websiteIdFromRequest) {
        try {
          await prisma.wordpressPage.updateMany({
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

    console.error("Error in WordPress page training endpoint:", error);
    return cors(
      request,
      NextResponse.json(
        {
          error:
            "An error occurred while processing the WordPress page training request",
          details: error.message,
        },
        { status: 500 }
      )
    );
  }
}
