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

// System message for the AI - Edit this to modify AI behavior
const SYSTEM_MESSAGE = `You are a helpful assistant that generates questions and answers for blog posts. Make voice responses more conversational and natural sounding. Questions should be human like questions based on the post content. and answers should be quick, 1-2 short sentences so it makes better sense for voice. Always include specific post details in your answers. You must return valid JSON.`;
// ============================================================================

// Update the QA interface to match the product route
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
    priceRange: {
      min: number;
      max: number;
    } | null;
    totalInventory: number;
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
  postId: string;
  postTitle: string;
  blogHandle: string;
  divAnchors?: string[];
}

// Function to process QAs and generate vectors
async function processQAs(
  qas: any[],
  vectorId: string,
  post: any,
  category: string
) {
  const sectionVectors = [];
  let processedCount = 0;

  // Create a sanitized post title for IDs
  const sanitizedTitle = post.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  for (const qa of qas) {
    try {
      const qaText = `${qa.question} ${qa.answer}`;
      const type = "post";
      const qaCategory = category || qa.category || "general";
      const qaSubcategory = qa.subcategory || "general";

      console.log(`Generating vectors for QA ${qa.id}:`, {
        question: qa.question.substring(0, 50) + "...",
        category: qaCategory,
        subcategory: qaSubcategory,
      });

      const [denseVector, sparseVector] = await Promise.all([
        embeddings.embedQuery(qaText),
        generateSparseVectors(qaText, type, qaCategory, qaSubcategory),
      ]);

      // Add post metadata to each QA
      const postMetadata = {
        title: post.title || "",
        description: post.summary || "",
        content: post.content || "",
        postUrl: `/blogs/${post.blog?.handle}/${post.handle}` || "",
        author: post.author || "",
        publishedAt: post.publishedAt || "",
        tags: post.tags || [],
        blogHandle: post.blog?.handle || "",
        blogTitle: post.blog?.title || "",
        isPublished: post.isPublished || false,
        image: post.image || "",
      };

      sectionVectors.push({
        id: `qa-${sanitizedTitle}-${crypto.randomBytes(8).toString("hex")}`,
        values: denseVector,
        sparseValues: sparseVector,
        metadata: {
          type: type,
          category: qaCategory,
          subcategory: qaSubcategory,
          questionType: qa.questionType || "text",
          question: qa.question || "",
          answer: qa.answer || "",
          webAction: qa.webAction || "",
          url: qa.url || "",
          scrollText: qa.scrollText || "",
          postId: vectorId,
          ...postMetadata,
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
async function generateQAs(post: any, vectorId: string) {
  try {
    console.log("Preparing post data for QA generation:", {
      fromDatabase: Boolean(post.websiteId),
      postId: post.id,
      shopifyId: post.shopifyId,
      vectorId: vectorId,
    });

    // Extract div IDs from scrapedHtml
    const divIds = [];
    if (post.scrapedHtml) {
      const idRegex = /\sid=["']([^"']+)["']/g;
      let match;
      while ((match = idRegex.exec(post.scrapedHtml)) !== null) {
        divIds.push(match[1]);
      }
    }

    // Use database fields with enhanced data
    const postData = {
      title: post.title || "",
      handle: post.handle || "",
      content: post.content || "",
      summary: post.summary || "",
      scrapedHtml: post.scrapedHtml || "",
      author: post.author || "",
      image: post.image || "",
      isPublished: post.isPublished || false,
      publishedAt: post.publishedAt,
      tags: post.tags || [],
      blogHandle: post.blog?.handle || "",
      blogTitle: post.blog?.title || "",
      postUrl: `/blogs/${post.blog?.handle}/${post.handle}`,
      divIds,

      // Remove any circular references or unnecessary fields
      website: undefined,
      VectorDbConfig: undefined,
      blog: undefined,
    };

    console.log(
      "Generated post data for QAs:",
      JSON.stringify(postData, null, 2)
    );

    // Array to store all vectors
    const vectors = [];

    // Generate QAs for each category and process them in parallel
    console.log("\nGenerating Discovery QAs...");
    const discoveryQAs = await generateQAsForPrompt(
      postData,
      vectorId,
      DISCOVERY_QA_PROMPT
    );
    const discoveryVectorsPromise = processQAs(
      discoveryQAs,
      vectorId,
      post,
      "discovery"
    );

    console.log("\nGenerating Content QAs...");
    const contentQAs = await generateQAsForPrompt(
      postData,
      vectorId,
      CONTENT_QA_PROMPT
    );
    const contentVectorsPromise = processQAs(
      contentQAs,
      vectorId,
      post,
      "content"
    );

    console.log("\nGenerating Topic QAs...");
    const topicQAs = await generateQAsForPrompt(
      postData,
      vectorId,
      TOPIC_QA_PROMPT
    );
    const topicVectorsPromise = processQAs(topicQAs, vectorId, post, "topic");

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
    const sanitizedTitle = post.title
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
      qa.id = `qa-${sanitizedTitle}-${crypto.randomBytes(8).toString("hex")}`;
      qa.webAction = qa.webAction || null;
      qa.url = qa.url || null;
      qa.scrollText = qa.scrollText || null;
      qa.questionType = qa.questionType || "text";
      qa.category = qa.category || "general"; // Ensure category exists
      qa.subcategory = qa.subcategory || "general"; // Ensure subcategory exists
      // Re-add the qa.post object assignment
      qa.post = {
        title: post.title || "",
        description: post.summary || "",
        content: post.content || "",
        postUrl: `/blogs/${post.blog?.handle}/${post.handle}` || "",
        author: post.author || "",
        publishedAt: post.publishedAt || "",
        tags: post.tags || [],
        blogHandle: post.blog?.handle || "",
        blogTitle: post.blog?.title || "",
        isPublished: post.isPublished || false,
        image: post.image || "",
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

// Split into 3 separate prompts for each main category
const DISCOVERY_QA_PROMPT = `Generate 10 discovery/search questions and answers for the following blog article:
\${postJson}

Generate QAs for these subcategories:

1. SEARCH (3 text, 3 voice):
   - Questions from a searching perspective
   - Text answers: 20-40 words
   - Voice answers: 10-20 words
   - Examples:
     Q: "Do you have any articles about [topic]?"
     A: "Yes! We have a detailed guide about [topic] written by [author] that covers [key points]."
     action: "redirect"
     url: "/blogs/\${blogHandle}/\${handle}"

2. FINDING (2 text, 2 voice):
   - Questions about finding specific information
   - Text answers: 20-40 words
   - Voice answers: 10-20 words
   - Examples:
     Q: "I'm looking for information about [topic]"
     A: "Check out our comprehensive article about [topic], which walks you through [key aspects]."
     action: "redirect"
     url: "/blogs/\${blogHandle}/\${handle}"

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
      "url": "/blogs/\${blogHandle}/\${handle}",
      "scrollText": null
    }
  ]
}`;

const CONTENT_QA_PROMPT = `Generate 10 content-specific questions and answers for this blog article:
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

const TOPIC_QA_PROMPT = `Generate 10 topic-based questions and answers for this blog article:
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
    await prisma.shopifyBlogPost.update({
      where: { id },
      data: { isTraining: true },
    });

    // Get the website ID from the blog post
    console.log("Looking up blog post with ID:", id);
    const post = await prisma.shopifyBlogPost.findFirst({
      where: { id },
      include: {
        website: {
          include: {
            VectorDbConfig: true,
          },
        },
        blog: true,
      },
    });

    if (!post) {
      // Reset isTraining if post not found
      await prisma.shopifyBlogPost.update({
        where: { id },
        data: { isTraining: false },
      });
      console.log("Blog post not found in database with ID:", id);
      return cors(
        request,
        NextResponse.json(
          { error: "Blog post not found in database" },
          { status: 404 }
        )
      );
    }

    console.log("Found blog post:", {
      id: post.id,
      websiteId: post.websiteId,
      qaNamespace: post.website.VectorDbConfig?.QANamespace,
    });

    // Get the namespace from VectorDbConfig or fallback to website ID
    const qaNamespace =
      post.website.VectorDbConfig?.QANamespace || `${post.website.id}-qa`;
    console.log("Using QA namespace:", qaNamespace);

    // Initialize Pinecone index
    const index = pinecone.index("voicero-hybrid");

    // Generate QAs using the database data
    console.log("Generating QAs for blog post");
    let result;
    try {
      result = await generateQAs(post, vectorId);
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
        await prisma.shopifyBlogPost.update({
          where: { id },
          data: { trained: true },
        });
        console.log("Updated blog post trained status to true");
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
    await prisma.shopifyBlogPost.update({
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
        message: "Generated and stored QAs for blog post",
        count: result.vectors.length,
        postId: vectorId,
        processedQAs: result.validatedQAs.length,
        totalQAs: result.validatedQAs.length,
      })
    );
  } catch (error: any) {
    // Reset isTraining if there's an error
    if (id) {
      await prisma.shopifyBlogPost.update({
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
