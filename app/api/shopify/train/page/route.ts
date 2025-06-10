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

// Helper function to generate sparse vectors (updated signature and logic)
async function generateSparseVectors(
  qaText: string,
  type: string, // Added type
  category: string, // Added category
  subcategory: string // Added subcategory
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

// System message for the AI - Edit this to modify AI behavior
const SYSTEM_MESSAGE = `You are a helpful assistant that generates questions and answers for pages. Your task is to:
1. Generate discovery QAs about the page overall (always use "redirect" action)
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

// Update the QA interface to match the product route
interface QA {
  id: string;
  questionType: "text" | "voice";
  question: string;
  answer: string;
  webAction: string | null;
  url: string | null;
  page: {
    title: string;
    description: string;
    pageUrl: string;
    isPublished: boolean;
    publishedAt: string;
    templateSuffix: string;
  };
}

// Function to process QAs and generate vectors (updated)
async function processQAs(
  qas: any[],
  vectorId: string,
  page: any,
  category: string // Added category parameter
) {
  const sectionVectors = [];
  let processedCount = 0;

  // Create a sanitized page title for IDs
  const sanitizedTitle = page.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  for (const qa of qas) {
    try {
      const qaText = `${qa.question} ${qa.answer}`;
      const type = "page"; // Hardcoded type for pages
      const qaCategory = category || qa.category || "general"; // Use passed category first
      const qaSubcategory = qa.subcategory || "general"; // Use QA's subcategory

      console.log(`Generating vectors for QA ${qa.id}:`, {
        question: qa.question.substring(0, 50) + "...",
        category: qaCategory,
        subcategory: qaSubcategory,
      });

      const [denseVector, sparseVector] = await Promise.all([
        embeddings.embedQuery(qaText),
        generateSparseVectors(qaText, type, qaCategory, qaSubcategory),
      ]);

      // Add page metadata to each QA - ensure all values are strings or numbers
      const pageMetadata = {
        title: String(page.title || ""),
        description: String(page.content || ""),
        pageUrl: String(`/pages/${page.handle}` || ""),
        templateSuffix: String(page.templateSuffix || ""),
        isPublished: String(page.isPublished || false), // Convert boolean to string
        publishedAt: String(page.publishedAt || ""),
      };

      // Ensure VectorMetadata interface includes all fields being added
      const metadata = {
        ...pageMetadata,
        type: String(type),
        category: String(qaCategory),
        subcategory: String(qaSubcategory),
        questionType: String(qa.questionType || "text"),
        question: String(qa.question || ""),
        answer: String(qa.answer || ""),
        webAction: qa.webAction ? String(qa.webAction) : "",
        url: qa.url ? String(qa.url) : "",
        scrollText: qa.scrollText ? String(qa.scrollText) : "",
        pageId: String(vectorId),
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

// Update the generateQAs function to handle multiple prompts (updated calls to processQAs)
async function generateQAs(page: any, vectorId: string) {
  try {
    console.log("Preparing page data for QA generation:", {
      fromDatabase: Boolean(page.websiteId),
      pageId: page.id,
      shopifyId: page.shopifyId,
      vectorId: vectorId,
    });

    // Extract div IDs from scrapedHtml
    const divIds = [];
    if (page.scrapedHtml) {
      const idRegex = /\sid=["']([^"']+)["']/g;
      let match;
      while ((match = idRegex.exec(page.scrapedHtml)) !== null) {
        divIds.push(match[1]);
      }
    }

    // Use database fields with enhanced data
    const pageData = {
      title: page.title || "",
      handle: page.handle || "",
      content: page.content || "",
      scrapedHtml: page.scrapedHtml || "",
      isPublished: page.isPublished || false,
      publishedAt: page.publishedAt,
      templateSuffix: page.templateSuffix || "",
      pageUrl: `/pages/${page.handle}`,
      divIds,

      // Remove any circular references or unnecessary fields
      website: undefined,
      VectorDbConfig: undefined,
    };

    console.log(
      "Generated page data for QAs:",
      JSON.stringify(pageData, null, 2)
    );

    // Array to store all vectors
    const vectors = [];

    // Generate QAs for each category and process them in parallel
    console.log("\nGenerating Discovery QAs...");
    const discoveryQAs = await generateQAsForPrompt(
      pageData,
      vectorId,
      DISCOVERY_QA_PROMPT
    );
    // Pass "discovery" category explicitly
    const discoveryVectorsPromise = processQAs(
      discoveryQAs,
      vectorId,
      page,
      "discovery"
    );

    console.log("\nGenerating On-Page QAs...");
    const onPageQAs = await generateQAsForPrompt(
      pageData,
      vectorId,
      ON_PAGE_QA_PROMPT
    );
    // Pass "on-page" category explicitly
    const onPageVectorsPromise = processQAs(
      onPageQAs,
      vectorId,
      page,
      "on-page"
    );

    console.log("\nGenerating Statement QAs...");
    const statementQAs = await generateQAsForPrompt(
      pageData,
      vectorId,
      STATEMENT_QA_PROMPT
    );
    // Pass "statement" category explicitly
    const statementVectorsPromise = processQAs(
      statementQAs,
      vectorId,
      page,
      "statement"
    );

    // Wait for all vector processing to complete
    const [discoveryVectors, onPageVectors, statementVectors] =
      await Promise.all([
        discoveryVectorsPromise,
        onPageVectorsPromise,
        statementVectorsPromise,
      ]);

    // Combine all vectors
    vectors.push(...discoveryVectors, ...onPageVectors, ...statementVectors);

    // Combine all QAs for validation
    const allQAs = [...discoveryQAs, ...onPageQAs, ...statementQAs];

    // Create a sanitized page title for IDs (Moved back here)
    const sanitizedTitle = page.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    // Assign category/subcategory based on origin before validation
    const categorizedQAs = [
      ...discoveryQAs.map((qa: QA) => ({ ...qa, category: "discovery" })), // Add QA type
      ...onPageQAs.map((qa: QA) => ({ ...qa, category: "on-page" })), // Add QA type
      ...statementQAs.map((qa: QA) => ({ ...qa, category: "statement" })), // Add QA type
    ];

    // Make IDs unique by adding page ID and sanitized title, ensure fields
    categorizedQAs.forEach((qa, index) => {
      qa.id = `qa-${sanitizedTitle}-${crypto.randomBytes(8).toString("hex")}`; // Now sanitizedTitle is defined
      qa.webAction = qa.webAction || null;
      qa.url = qa.url || null;
      qa.scrollText = qa.scrollText || null; // Ensure scrollText exists
      qa.questionType = qa.questionType || "text";
      qa.page = {
        // Ensure page object exists on QA
        title: page.title || "",
        description: page.content || "",
        pageUrl: `/pages/${page.handle}` || "",
        isPublished: page.isPublished || false,
        publishedAt: page.publishedAt || "",
        templateSuffix: page.templateSuffix || "",
      };
      // Ensure category/subcategory are present (using defaults if needed)
      qa.category = qa.category || "general";
      qa.subcategory = qa.subcategory || "general";
    });

    // Validate each QA - only check for required fields
    const validatedQAs = categorizedQAs.filter((qa) => {
      // Added category and subcategory to validation
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
  pageData: any,
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
      page: {
        title: pageData.title || "",
        description: pageData.content || "",
        pageUrl: `/pages/${pageData.handle}` || "",
        isPublished: pageData.isPublished || false,
        publishedAt: pageData.publishedAt || "",
        templateSuffix: pageData.templateSuffix || "",
      },
    }));
  } catch (error) {
    console.error("Error generating QAs for prompt:", error);
    return [];
  }
}

// Helper function to get category from prompt
function getCategoryFromPrompt(prompt: string): string {
  if (prompt.includes("discovery")) return "discovery";
  if (prompt.includes("on-page")) return "on-page";
  if (prompt.includes("statement")) return "statement";
  return "general";
}

// Helper function to get subcategory from prompt
function getSubcategoryFromPrompt(prompt: string): string {
  if (prompt.includes("page_purpose")) return "page_purpose";
  if (prompt.includes("content_overview")) return "content_overview";
  if (prompt.includes("section_content")) return "section_content";
  if (prompt.includes("navigation")) return "navigation";
  if (prompt.includes("intent")) return "intent";
  if (prompt.includes("clarification")) return "clarification";
  return "general";
}

// Split into 3 separate prompts for each main category
const DISCOVERY_QA_PROMPT = `Generate 10 discovery questions and answers for the following page:
\${pageJson}

Generate QAs for these subcategories:

1. PAGE_PURPOSE (3 text, 3 voice):
   - Questions about what the page is for and who it's for
   - Text answers: Overview of main purpose in 2-3 sentences (20-40 words)
   - Voice answers: Brief purpose overview in 1-2 sentences (10-20 words)
   - Always uses "redirect" action (no section scrolling)
   - Examples:
     Q: "What kind of information can I find on this page?"
     A: "This page explains [main purpose]. It's designed for [target audience] looking to learn about [topic]."
     action: "redirect"
     url: "/pages/[handle]"

2. CONTENT_OVERVIEW (2 text, 2 voice):
   - Questions about what content and sections are available
   - Text answers: List main sections in 2-3 sentences (20-40 words)
   - Voice answers: Quick section overview in 1-2 sentences (10-20 words)
   - Always uses "redirect" action (no section scrolling)
   - Examples:
     Q: "What sections does this page have?"
     A: "The page covers [list main sections]. Each section provides detailed information about [topic]."
     action: "redirect"
     url: "/pages/[handle]"

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
      "url": "/pages/[handle]"
    }
  ]
}`;

const ON_PAGE_QA_PROMPT = `Generate 10 on-page questions and answers for the following page:
\${pageJson}

Generate QAs for these subcategories:

1. SECTION_CONTENT (2 text, 2 voice):
   - Questions about specific section content
   - Text answers: Section overview + scroll prompt (20-40 words)
   - Voice answers: Brief section info + scroll prompt (10-20 words)
   - Include scrollText with EXACT text from the page that answers the question
   - DO NOT modify or paraphrase the text - it must be an exact copy
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
   - Include scrollText with EXACT text that contains the information
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
- Examples of good scrollText:
  ✓ "privacy policy"
  ✓ "contact information"
  ✓ "terms of service"
- Examples of bad scrollText:
  ✗ "we will treat this as a request to opt-out"
  ✗ "if you visit our website with the Global Privacy Control"
  ✗ "we collect personal information from your interactions"

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
      "scrollText": "exact copied text from page content or html" | null
    }
  ]
}`;

const STATEMENT_QA_PROMPT = `Generate 10 statement-based questions and answers for the following page:
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
     scrollText: "exact text from page about the topic"

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
     scrollText: "exact text from page explaining the term"

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
      "url": "/pages/[handle]" | null,
      "scrollText": "exact text from page" | null
    }
  ]
}`;

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
    await prisma.shopifyPage.update({
      where: { id },
      data: { isTraining: true },
    });

    // Get the website ID from the page
    console.log("Looking up page with ID:", id);
    const page = await prisma.shopifyPage.findFirst({
      where: { id },
      include: {
        website: {
          include: {
            VectorDbConfig: true,
          },
        },
      },
    });

    if (!page) {
      // Reset isTraining if page not found
      await prisma.shopifyPage.update({
        where: { id },
        data: { isTraining: false },
      });
      console.log("Page not found in database with ID:", id);
      return cors(
        request,
        NextResponse.json(
          { error: "Page not found in database" },
          { status: 404 }
        )
      );
    }

    console.log("Found page:", {
      id: page.id,
      websiteId: page.websiteId,
      qaNamespace: page.website.VectorDbConfig?.QANamespace,
    });

    // Get the namespace from VectorDbConfig or fallback to website ID
    const qaNamespace =
      page.website.VectorDbConfig?.QANamespace || `${page.website.id}-qa`;
    console.log("Using QA namespace:", qaNamespace);

    // Initialize Pinecone index
    const index = pinecone.index("voicero-hybrid");

    // Generate QAs using the database data
    console.log("Generating QAs for page");
    let result;
    try {
      result = await generateQAs(page, vectorId);
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
        await prisma.shopifyPage.update({
          where: { id },
          data: { trained: true },
        });
        console.log("Updated page trained status to true");
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
    await prisma.shopifyPage.update({
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
        message: "Generated and stored QAs for page",
        count: result.vectors.length,
        pageId: vectorId,
        processedQAs: result.validatedQAs.length,
        totalQAs: result.validatedQAs.length,
      })
    );
  } catch (error: any) {
    // Reset isTraining if there's an error
    if (id) {
      await prisma.shopifyPage.update({
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
