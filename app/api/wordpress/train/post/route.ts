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
export const dynamic = "force-dynamic";

// Define the type based on the query including relations
const wordpressPostWithRelations =
  Prisma.validator<Prisma.WordpressPostDefaultArgs>()({
    include: {
      website: {
        include: {
          VectorDbConfig: true,
        },
      },
      author: true,
      categories: true,
      tags: true,
    },
  });

type WordpressPostWithRelations = Prisma.WordpressPostGetPayload<
  typeof wordpressPostWithRelations
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

// System message for the AI - Updated for WordPress Blog Posts
const SYSTEM_MESSAGE = `You are a helpful assistant that generates questions and answers for WordPress blog posts. 
Make voice responses more conversational and natural sounding. Questions should be human-like questions based on the post content. 
Answers should be quick, 1-2 short sentences to make better sense for voice.
Always include specific post details in your answers.

CRITICAL RULES FOR scrollText:
- Use SHORT, EXACT phrases from the post content
- Even 2-3 words is fine if they match exactly
- DO NOT try to paraphrase or combine text
- DO NOT use long sentences or paragraphs
- If you can't find an exact match, use a shorter phrase that does match

You must return valid JSON in the specified format.`;
// ============================================================================

// Update the QA interface for WordPress Posts
interface QA {
  id: string;
  questionType: "text" | "voice";
  question: string;
  answer: string;
  webAction: string | null;
  url: string | null;
  scrollText?: string | null;
  post: {
    title: string;
    description: string; // Use content as description
    content: string;
    postUrl: string; // Use link as URL
    author: string;
    categories: string[];
    tags: string[];
  };
}

interface VectorMetadata extends Record<string, any> {
  type: string;
  category: string;
  subcategory: string;
  question: string;
  answer: string;
  action: string;
  url: string;
  scrollText: string;
  postId: number; // WordPress Post ID (wpId)
  postTitle: string;
  slug: string;
  divAnchors?: string[];
}

// Function to process QAs and generate vectors (updated for WordPress Posts)
async function processQAs(
  qas: any[],
  postRecordId: number, // Use internal DB ID
  post: WordpressPostWithRelations, // Use the specific type
  category: string
) {
  const sectionVectors = [];
  let processedCount = 0;

  // Create a sanitized post title for IDs
  const sanitizedTitle = (post.title || `post-${post.wpId}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  for (const qa of qas) {
    try {
      const qaText = `${qa.question} ${qa.answer}`;
      const type = "post"; // Hardcoded type for posts
      const qaCategory = category || qa.category || "general"; // Use passed category first
      const qaSubcategory = qa.subcategory || "general"; // Use QA's subcategory

      console.log(`Generating vectors for QA (WP Post: ${post.wpId}):`, {
        question: qa.question.substring(0, 50) + "...",
        category: qaCategory,
        subcategory: qaSubcategory,
      });

      const [denseVector, sparseVector] = await Promise.all([
        embeddings.embedQuery(qaText),
        generateSparseVectors(qaText, type, qaCategory, qaSubcategory),
      ]);

      // Extract categories and tags as arrays of strings
      const categories = post.categories.map((category) => category.name);
      const tags = post.tags.map((tag) => tag.name);

      // Add post metadata to each QA - ensure no nulls and convert arrays to strings
      const postMetadata: Record<string, any> = {
        title: post.title || "",
        description: post.excerpt || "",
        content: post.content || "",
        postUrl: post.link || "",
        author: post.author?.name || "",
        // Convert arrays to strings with comma separation
        categories: categories.length > 0 ? categories.join(", ") : "",
        tags: tags.length > 0 ? tags.join(", ") : "",
        slug: post.slug || "",
        type: type,
        category: qaCategory,
        subcategory: qaSubcategory,
        questionType: qa.questionType || "text",
        question: qa.question || "",
        answer: qa.answer || "",
        webAction: qa.webAction || "",
        url: qa.url || "",
      };

      // Only add scrollText if it exists and is not null
      if (qa.scrollText) {
        postMetadata.scrollText = qa.scrollText;
      }

      // Ensure no null values in metadata
      Object.keys(postMetadata).forEach((key) => {
        if (postMetadata[key] === null || postMetadata[key] === undefined) {
          postMetadata[key] = "";
        }
      });

      sectionVectors.push({
        id: `qa-wp-post-${sanitizedTitle}-${post.wpId}-${crypto
          .randomBytes(8)
          .toString("hex")}`,
        values: denseVector,
        sparseValues: sparseVector,
        metadata: postMetadata,
      });
      processedCount++;
    } catch (error: any) {
      console.error(`Error processing QA for WP Post ${post.wpId}:`, error);
    }
  }
  return sectionVectors;
}

// Update the generateQAs function for WordPress Posts
async function generateQAs(
  post: WordpressPostWithRelations,
  postRecordId: number
) {
  try {
    console.log("Preparing WordPress post data for QA generation:", {
      fromDatabase: Boolean(post.websiteId),
      postRecordId: postRecordId, // Internal DB ID
      wpId: post.wpId, // WordPress specific ID
      websiteId: post.websiteId,
    });

    // Extract categories and tags for display
    const categories = post.categories.map((category) => category.name);
    const tags = post.tags.map((tag) => tag.name);

    // Use WordPress database fields
    const postData = {
      wpId: post.wpId,
      title: post.title || "",
      content: post.content || "", // Content for scrollText matching
      excerpt: post.excerpt || "",
      link: post.link || "", // Post URL
      slug: post.slug || "",
      author: post.author?.name || "",
      categories: categories,
      tags: tags,
    };

    console.log(
      "Generated WordPress post data for QAs:",
      JSON.stringify(postData, null, 2)
    );

    // Array to store all vectors
    const vectors = [];

    // Generate QAs for each category and process them in parallel
    console.log("\nGenerating Discovery QAs (WordPress Post)...");
    const discoveryQAs = await generateQAsForPrompt(
      postData,
      postRecordId,
      DISCOVERY_QA_PROMPT
    );
    const discoveryVectorsPromise = processQAs(
      discoveryQAs,
      postRecordId,
      post,
      "discovery"
    );

    console.log("\nGenerating Content QAs (WordPress Post)...");
    const contentQAs = await generateQAsForPrompt(
      postData,
      postRecordId,
      CONTENT_QA_PROMPT
    );
    const contentVectorsPromise = processQAs(
      contentQAs,
      postRecordId,
      post,
      "content"
    );

    console.log("\nGenerating Topic QAs (WordPress Post)...");
    const topicQAs = await generateQAsForPrompt(
      postData,
      postRecordId,
      TOPIC_QA_PROMPT
    );
    const topicVectorsPromise = processQAs(
      topicQAs,
      postRecordId,
      post,
      "topic"
    );

    // Wait for all vector processing to complete
    const [discoveryVectors, contentVectors, topicVectors] = await Promise.all([
      discoveryVectorsPromise,
      contentVectorsPromise,
      topicVectorsPromise,
    ]);

    // Combine all vectors
    vectors.push(...discoveryVectors, ...contentVectors, ...topicVectors);

    // Combine all QAs for validation
    const allQAs = [...discoveryQAs, ...contentQAs, ...topicQAs];

    // Create a sanitized post title for IDs
    const sanitizedTitle = (post.title || `post-${post.wpId}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    // Assign category/subcategory based on origin before validation
    const categorizedQAs = [
      ...discoveryQAs.map((qa: any) => ({ ...qa, category: "discovery" })),
      ...contentQAs.map((qa: any) => ({ ...qa, category: "content" })),
      ...topicQAs.map((qa: any) => ({ ...qa, category: "topic" })),
    ];

    // Make IDs unique, ensure fields and categories/subcategories
    categorizedQAs.forEach((qa, index) => {
      qa.id = `qa-wp-post-${sanitizedTitle}-${post.wpId}-${crypto
        .randomBytes(4)
        .toString("hex")}-${index}`;
      qa.webAction = qa.webAction || null;
      qa.url = qa.url || null;
      qa.scrollText = qa.scrollText || null;
      qa.questionType = qa.questionType || "text";
      qa.category = qa.category || "general"; // Ensure category exists
      qa.subcategory = qa.subcategory || "general"; // Ensure subcategory exists
      // Re-add the qa.post object assignment
      qa.post = {
        title: post.title || "",
        description: post.excerpt || "", // Use excerpt as description
        content: post.content || "",
        postUrl: post.link || "",
        author: post.author?.name || "",
        categories: categories,
        tags: tags,
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
        console.warn("Filtered out invalid WP Post QA:", qa);
      }
      return isValid;
    });

    if (validatedQAs.length === 0) {
      throw new Error("No valid QAs generated for WordPress post");
    }

    // Log QA counts by type
    const typeCounts = validatedQAs.reduce((acc: any, qa) => {
      acc[qa.questionType] = (acc[qa.questionType] || 0) + 1;
      return acc;
    }, {});

    console.log("\nWordPress Post QA Statistics by Type:");
    Object.entries(typeCounts).forEach(([type, count]) => {
      console.log(`${type}: ${count} QAs`);
    });

    console.log(`\nGenerated ${validatedQAs.length} total WordPress Post QAs`);
    console.log("Sample WordPress Post QAs:", validatedQAs.slice(0, 2));

    return { validatedQAs, vectors };
  } catch (error) {
    console.error("Error in generateQAs (WordPress Post):", error);
    throw error;
  }
}

// Update prompts for WordPress Posts
const DISCOVERY_QA_PROMPT = `Generate 10 discovery/search questions and answers for the following WordPress blog post:
\${postJson}

Generate QAs for these subcategories:

1. SEARCH (3 text, 3 voice):
   - Questions from a searching perspective
   - Text answers: 20-40 words
   - Voice answers: 10-20 words
   - Examples:
     Q: "Do you have any articles about [topic]?"
     A: "Yes! We have a detailed guide about [topic] that covers [key points]."
     action: "redirect"
     url: "[post.link]"

2. FINDING (2 text, 2 voice):
   - Questions about finding specific information
   - Text answers: 20-40 words
   - Voice answers: 10-20 words
   - Examples:
     Q: "I'm looking for information about [topic]"
     A: "Check out our comprehensive article about [topic], which walks you through [key aspects]."
     action: "redirect"
     url: "[post.link]"

Format as:
{
  "qas": [
    {
      "id": "qa-discovery-1",
      "type": "text" | "voice",
      "category": "discovery",
      "subcategory": "search" | "finding",
      "question": "string (from search perspective)",
      "answer": "string (mention article/guide exists and brief overview)",
      "action": "redirect",
      "url": "[post.link]",
      "scrollText": null
    }
  ]
}`;

const CONTENT_QA_PROMPT = `Generate 10 content-specific questions and answers for this WordPress blog post:
\${postJson}

Generate QAs for these subcategories:

1. TIPS (2 text, 2 voice):
   - Questions about specific tips and advice
   - Text answers: 20-40 words
   - Voice answers: 10-20 words
   - Examples:
     Q: "What tips does the article give about [topic]?"
     A: "The article explains [tip]. Let me show you that section."
     action: "scroll"
     url: null
     scrollText: "exact text from article about the tip"

2. INSTRUCTIONS (2 text, 2 voice):
   - Questions about step-by-step processes
   - Text answers: 20-40 words
   - Voice answers: 10-20 words
   - Examples:
     Q: "How do I [process] according to the article?"
     A: "The article outlines the steps: [steps]. I'll scroll to that section."
     action: "scroll"
     url: null
     scrollText: "exact text from article about the process"

3. INSIGHTS (1 text, 1 voice):
   - Questions about key insights and recommendations
   - Text answers: 20-40 words
   - Voice answers: 10-20 words
   - Examples:
     Q: "What does the article recommend for [topic]?"
     A: "The article suggests [recommendation]. Let me show you where it explains this."
     action: "scroll"
     url: null
     scrollText: "exact text from article with the recommendation"

CRITICAL RULES FOR scrollText:
- Use SHORT, EXACT phrases from the post content
- Even 2-3 words is fine if they match exactly
- DO NOT try to paraphrase or combine text
- DO NOT use long sentences or paragraphs
- If you can't find an exact match, use a shorter phrase that does match

Format as:
{
  "qas": [
    {
      "id": "qa-content-1",
      "type": "text" | "voice",
      "category": "content",
      "subcategory": "tips" | "instructions" | "insights",
      "question": "string (reference 'article' or 'blog post')",
      "answer": "string (start with 'The article explains...' or similar)",
      "action": "scroll",
      "url": null,
      "scrollText": "exact text from article that answers the question"
    }
  ]
}`;

const TOPIC_QA_PROMPT = `Generate 10 topic-based questions and answers for this WordPress blog post:
\${postJson}

Generate QAs for these subcategories:

1. BACKGROUND (2 text, 2 voice):
   - Questions about background concepts
   - Text answers: 20-40 words
   - Voice answers: 10-20 words
   - Examples:
     Q: "What background does this article cover about [topic]?"
     A: "The article explains the basics of [topic]. I'll show you that section."
     action: "scroll"
     url: null
     scrollText: "exact text from article explaining the background"

2. NEXT_STEPS (2 text, 2 voice):
   - Questions about next steps and related topics
   - Text answers: 20-40 words
   - Voice answers: 10-20 words
   - Examples:
     Q: "After reading this article, what should I learn about next?"
     A: "The article suggests exploring [topic]. Let me show you where it mentions this."
     action: "scroll"
     url: null
     scrollText: "exact text from article about next steps"

3. RELATED_TOPICS (1 text, 1 voice):
   - Questions about related topics and connections
   - Text answers: 20-40 words
   - Voice answers: 10-20 words
   - Examples:
     Q: "What other topics does this article connect to?"
     A: "The article relates to [topic] and [topic]. Let me show you those connections."
     action: "scroll"
     url: null
     scrollText: "exact text from article about related topics"

CRITICAL RULES FOR scrollText:
- Use SHORT, EXACT phrases from the post content
- Even 2-3 words is fine if they match exactly
- DO NOT try to paraphrase or combine text
- DO NOT use long sentences or paragraphs
- If you can't find an exact match, use a shorter phrase that does match

Format as:
{
  "qas": [
    {
      "id": "qa-topic-1",
      "type": "text" | "voice",
      "category": "topic",
      "subcategory": "background" | "next_steps" | "related_topics",
      "question": "string (reference 'article' or 'guide')",
      "answer": "string (mention 'article' or 'guide' explains/covers)",
      "action": "scroll" | "redirect",
      "url": null,
      "scrollText": "exact text from article if referencing specific part" | null
    }
  ]
}`;

// Helper function to generate QAs for a specific prompt
async function generateQAsForPrompt(
  postData: any,
  postRecordId: number,
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
            "${postJson}",
            JSON.stringify(postData, null, 2)
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
      category: qa.category || getCategoryFromPrompt(prompt),
      subcategory: qa.subcategory || getSubcategoryFromPrompt(prompt),
    }));
  } catch (error) {
    console.error("Error generating QAs for prompt (WordPress Post):", error);
    return [];
  }
}

// Helper function to get category from prompt
function getCategoryFromPrompt(prompt: string): string {
  if (prompt.includes("discovery")) return "discovery";
  if (prompt.includes("content")) return "content";
  if (prompt.includes("topic")) return "topic";
  return "general";
}

// Helper function to get subcategory from prompt
function getSubcategoryFromPrompt(prompt: string): string {
  if (prompt.includes("search")) return "search";
  if (prompt.includes("tips")) return "tips";
  if (prompt.includes("instructions")) return "instructions";
  if (prompt.includes("background")) return "background";
  if (prompt.includes("next_steps")) return "next_steps";
  return "general";
}

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  let postRecordId: number | undefined; // Use internal DB ID for updates
  let wpIdFromRequest: number | undefined; // Keep track of requested internal ID
  let websiteIdFromRequest: string | undefined; // Keep track of requested websiteId

  try {
    // Expect id and websiteId - id is the internal database ID, not WordPress ID
    const { wpId: idRaw, websiteId } = await request.json();
    // Parse id to number if it's a string
    const id = typeof idRaw === "string" ? parseInt(idRaw, 10) : idRaw;

    wpIdFromRequest = id;
    websiteIdFromRequest = websiteId;

    console.log("Received WordPress post training request with:", {
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

    // Find the post by internal ID, not wpId
    const post = await prisma.wordpressPost.findFirst({
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
        author: true,
        categories: true,
        tags: true,
      },
    });

    if (!post) {
      console.log(
        `WordPress Post not found with internal ID: ${id} and websiteId: ${websiteId}`
      );
      return cors(
        request,
        NextResponse.json(
          { error: "WordPress Post not found in database" },
          { status: 404 }
        )
      );
    }

    // Store the internal database ID for updates
    postRecordId = post.id;

    // Set isTraining to true at the start using internal ID
    await prisma.wordpressPost.update({
      where: { id: postRecordId },
      data: { isTraining: true },
    });

    console.log("Found WordPress post:", {
      id: post.id, // Internal DB ID
      wpId: post.wpId,
      title: post.title,
      websiteId: post.websiteId,
      qaNamespace: post.website.VectorDbConfig?.QANamespace,
    });

    // Get the namespace from VectorDbConfig or fallback to website ID
    const qaNamespace =
      post.website.VectorDbConfig?.QANamespace || `${post.website.id}-qa`;
    console.log("Using QA namespace:", qaNamespace);

    // Initialize Pinecone index
    const index = pinecone.index("voicero-hybrid");

    // Generate QAs using the WordPress post data and internal ID
    console.log("Generating QAs for WordPress post");
    let result;
    try {
      // Pass the full post object and its internal DB ID
      result = await generateQAs(post, postRecordId);
      console.log(
        `Successfully generated ${result.vectors.length} vectors for WP Post ${id}`
      );
    } catch (error: any) {
      console.error("Error generating QAs for WP post:", error);
      // Reset isTraining on error
      await prisma.wordpressPost.update({
        where: { id: postRecordId },
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
      `Upserting ${result.vectors.length} vectors to QA namespace: ${qaNamespace} for WP Post ${id}`
    );
    if (result.vectors.length > 0) {
      try {
        await index.namespace(qaNamespace).upsert(result.vectors);
        console.log("Successfully upserted vectors to Pinecone for WP Post");

        // Update the trained field to true using internal ID
        await prisma.wordpressPost.update({
          where: { id: postRecordId },
          data: { trained: true, isTraining: false }, // Set trained true, isTraining false
        });
        console.log("Updated WP post trained status to true");
      } catch (error: any) {
        console.error(
          "Error upserting vectors to Pinecone for WP Post:",
          error
        );
        // Reset isTraining on error
        await prisma.wordpressPost.update({
          where: { id: postRecordId },
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
      console.warn(`No vectors generated for WP Post ${id}, skipping upsert.`);
      // Still need to mark training as finished (even if unsuccessful)
      await prisma.wordpressPost.update({
        where: { id: postRecordId },
        data: { isTraining: false, trained: false }, // Mark as not trained if no vectors
      });
    }

    return cors(
      request,
      NextResponse.json({
        success: true,
        message: "Generated and stored QAs for WordPress post",
        count: result.vectors.length,
        wpPostId: id, // Return the id from the request
        processedQAs: result.validatedQAs.length,
        totalQAsGenerated: result.validatedQAs.length, // Reflect validated count
      })
    );
  } catch (error: any) {
    // Reset isTraining if there's an error and we have the ID
    if (postRecordId) {
      try {
        await prisma.wordpressPost.update({
          where: { id: postRecordId },
          data: { isTraining: false },
        });
      } catch (updateError) {
        console.error("Failed to reset isTraining flag on error:", updateError);
      }
    } else {
      // If we didn't even find the post, try finding by wpId/websiteId again to reset
      if (wpIdFromRequest && websiteIdFromRequest) {
        try {
          await prisma.wordpressPost.updateMany({
            where: { wpId: wpIdFromRequest, websiteId: websiteIdFromRequest },
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

    console.error("Error in WordPress post training endpoint:", error);
    return cors(
      request,
      NextResponse.json(
        {
          error:
            "An error occurred while processing the WordPress post training request",
          details: error.message,
        },
        { status: 500 }
      )
    );
  }
}
