import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Client } from "@opensearch-project/opensearch";
import { cors } from "../../../../../lib/cors";
import { RecordSparseValues } from "@pinecone-database/pinecone";
import OpenAI from "openai";
import { createChatCompletionWithRetry } from "../../../../../lib/openai-utils";
export const dynamic = "force-dynamic";

const prisma = new PrismaClient();
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
  text: string
): Promise<RecordSparseValues> {
  const indexName = `temp-analysis-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 15)}`;

  try {
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

const GENERAL_QA_PROMPT = `Generate general store-wide questions and answers based on this content:
\${storeJson}

Generate QAs for these categories:

1. NAVIGATION (5 text, 5 voice):
   - Questions about navigating to main store pages
   - Always use "redirect" action with appropriate URL
   - Examples:
     Q: "How do I get to the home page?"
     A: "I'll take you to our home page."
     action: "redirect"
     url: "/"

     Q: "Can you show me the shopping cart?"
     A: "I'll take you to your shopping cart."
     action: "redirect"
     url: "/cart"

     Q: "Where's the checkout?"
     A: "Let me take you to checkout."
     action: "redirect"
     url: "/checkout"

2. GENERAL (15 text, 15 voice):
   - Broad questions about products, collections, blog posts
   - NO actions or URLs - these are informational only
   - Examples:
     Q: "What kind of products do you sell?"
     A: "We offer [types of products from collections]. Our collections include [collection names]."
     action: null
     url: null

     Q: "Do you have a blog?"
     A: "Yes, we have blog posts covering topics like [blog categories/topics]."
     action: null
     url: null

IMPORTANT:
- For NAVIGATION: Only use standard Shopify URLs (/cart, /checkout, etc.)
- For GENERAL: NO actions or URLs - just informational answers
- Keep answers concise and natural
- Use information from collections, products, and blogs to inform answers

Format as:
{
  "qas": [
    {
      "id": "qa-general-1",
      "type": "text" | "voice",
      "category": "navigation" | "general",
      "question": "string",
      "answer": "string",
      "action": "redirect" | null,
      "url": "/standard/shopify/url" | null
    }
  ]
}`;

const SYSTEM_MESSAGE = `You are a helpful assistant that generates general store-wide questions and answers. Your task is to:
1. Generate navigation QAs for basic store pages (always use "redirect" action)
2. Generate general informational QAs about the store (no actions/URLs)

For navigation questions:
- Only use standard Shopify URLs (/cart, /checkout, /, /collections, etc.)
- Always include both action and URL
- Keep answers simple and direct

For general questions:
- Focus on broad store information
- NO actions or URLs
- Use available product/collection/blog data to inform answers

Keep answers concise and natural:
- Text answers: 20-40 words
- Voice answers: 10-20 words

You must return valid JSON in the specified format.`;

interface QA {
  id: string;
  type: "text" | "voice";
  category: "navigation" | "general";
  question: string;
  answer: string;
  action: string | null;
  url: string | null;
}

// Helper function to get store data
async function getStoreData(websiteId: string) {
  try {
    // Get collections data
    const collections = await prisma.shopifyCollection.findMany({
      where: {
        websiteId,
      },
      select: {
        title: true,
        handle: true,
        description: true,
      },
    });

    // Get products data
    const products = await prisma.shopifyProduct.findMany({
      where: {
        websiteId,
        status: "ACTIVE",
        publishedAt: { not: null },
        OR: [
          { publishedAt: { lt: new Date() } },
          { publishedAt: { equals: new Date() } },
        ],
      },
      select: {
        title: true,
        handle: true,
        description: true,
        productType: true,
        vendor: true,
        priceRange: true,
        publishedAt: true,
        status: true,
      },
    });

    // Get blog posts data
    const blogPosts = await prisma.shopifyBlogPost.findMany({
      where: {
        websiteId,
        isPublished: true,
        publishedAt: { not: null },
        OR: [
          { publishedAt: { lt: new Date() } },
          { publishedAt: { equals: new Date() } },
        ],
      },
      select: {
        title: true,
        handle: true,
        summary: true,
        publishedAt: true,
        blog: {
          select: {
            handle: true,
            title: true,
          },
        },
      },
    });

    // Get pages data
    const pages = await prisma.shopifyPage.findMany({
      where: {
        websiteId,
        isPublished: true,
        publishedAt: { not: null },
        OR: [
          { publishedAt: { lt: new Date() } },
          { publishedAt: { equals: new Date() } },
        ],
      },
      select: {
        title: true,
        handle: true,
        bodySummary: true,
        isPublished: true,
        publishedAt: true,
      },
    });

    // Get active discounts
    const discounts = await prisma.shopifyDiscount.findMany({
      where: {
        websiteId,
        status: "ACTIVE",
        startsAt: {
          not: null,
          lte: new Date(),
        },
        OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
      },
      select: {
        title: true,
        code: true,
        type: true,
        value: true,
        appliesTo: true,
        startsAt: true,
        endsAt: true,
      },
    });

    return {
      collections: collections.map((c) => ({
        title: c.title,
        handle: c.handle,
        description: c.description,
      })),
      products: products.map((p) => ({
        title: p.title,
        handle: p.handle,
        description: p.description,
        type: p.productType,
        vendor: p.vendor,
        priceRange: p.priceRange,
        publishedAt: p.publishedAt,
        status: p.status,
      })),
      blogPosts: blogPosts.map((p) => ({
        title: p.title,
        handle: p.handle,
        summary: p.summary,
        publishedAt: p.publishedAt,
        blogHandle: p.blog?.handle,
        blogTitle: p.blog?.title,
      })),
      pages: pages.map((p) => ({
        title: p.title,
        handle: p.handle,
        summary: p.bodySummary,
        isPublished: p.isPublished,
        publishedAt: p.publishedAt,
      })),
      discounts: discounts.map((d) => ({
        title: d.title,
        code: d.code,
        type: d.type,
        value: d.value,
        appliesTo: d.appliesTo,
        startsAt: d.startsAt,
        endsAt: d.endsAt,
      })),
    };
  } catch (error) {
    console.error("Error getting store data:", error);
    throw error;
  }
}

// Function to process QAs and generate vectors
async function processQAs(qas: QA[], websiteId: string) {
  const sectionVectors = [];
  let processedCount = 0;
  for (const qa of qas) {
    try {
      const qaText = `${qa.question} ${qa.answer}`;
      console.log(`Generating vectors for QA ${qa.id}:`, {
        question: qa.question.substring(0, 50) + "...",
      });

      const [denseVector, sparseVector] = await Promise.all([
        embeddings.embedQuery(qaText),
        generateSparseVectors(qaText),
      ]);

      const metadata = {
        type: qa.type || "",
        category: qa.category || "",
        question: qa.question || "",
        answer: qa.answer || "",
        action: qa.action || "",
        url: qa.url || "",
        websiteId: websiteId || "",
      };

      // Ensure all metadata values are strings
      const sanitizedMetadata = Object.entries(metadata).reduce(
        (acc, [key, value]) => {
          acc[key] = String(value || "");
          return acc;
        },
        {} as Record<string, string>
      );

      sectionVectors.push({
        id: `qa-${websiteId}-${qa.category}-${processedCount + 1}`,
        values: denseVector,
        sparseValues: sparseVector,
        metadata: sanitizedMetadata,
      });
      processedCount++;
    } catch (error: any) {
      console.error(`Error processing QA ${qa.id}:`, error);
    }
  }
  return sectionVectors;
}

// Helper function to generate QAs
async function generateQAs(
  storeData: any,
  prompt: string,
  systemMessage: string
) {
  try {
    const completion = await createChatCompletionWithRetry(openai, {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMessage },
        {
          role: "user",
          content: prompt.replace(
            "${storeJson}",
            JSON.stringify(storeData, null, 2)
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

    // Validate and fix QAs
    const validatedQAs = parsedContent.qas.map((qa: QA) => {
      // For navigation category, ensure proper action and URL
      if (qa.category === "navigation") {
        qa.action = "redirect";
        // Ensure URL starts with /
        qa.url = qa.url?.startsWith("/") ? qa.url : `/${qa.url}`;
      } else {
        // For general category, ensure no action or URL
        qa.action = null;
        qa.url = null;
      }

      return qa;
    });

    return validatedQAs;
  } catch (error) {
    console.error("Error generating QAs:", error);
    throw error;
  }
}

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    const { websiteId } = await request.json();
    console.log("Received request with websiteId:", websiteId);

    // Basic input checks
    if (!websiteId) {
      return cors(
        request,
        NextResponse.json(
          {
            error: "Missing required field: websiteId",
          },
          { status: 400 }
        )
      );
    }

    // Get the website's VectorDbConfig
    const website = await prisma.website.findUnique({
      where: { id: websiteId },
      include: {
        VectorDbConfig: true,
      },
    });

    if (!website) {
      return cors(
        request,
        NextResponse.json({ error: "Website not found" }, { status: 404 })
      );
    }

    // Get the namespace from VectorDbConfig or fallback to website ID
    const qaNamespace =
      website.VectorDbConfig?.QANamespace || `${website.id}-qa`;
    console.log("Using QA namespace:", qaNamespace);

    // Get store data
    console.log("Getting store data...");
    const storeData = await getStoreData(websiteId);

    console.log("\nStore data summary:");
    console.log(`Collections: ${storeData.collections.length}`);
    console.log(`Products: ${storeData.products.length}`);
    console.log(`Blog posts: ${storeData.blogPosts.length}`);
    console.log(`Pages: ${storeData.pages.length}`);
    console.log(`Active discounts: ${storeData.discounts.length}`);

    // Generate QAs
    console.log("\nGenerating General QAs...");
    const generalQAs = await generateQAs(
      storeData,
      GENERAL_QA_PROMPT,
      SYSTEM_MESSAGE
    );

    // Process QAs and generate vectors
    console.log("\nProcessing QAs and generating vectors...");
    const vectors = await processQAs(generalQAs, websiteId);

    // Initialize Pinecone index
    const index = pinecone.index("voicero-hybrid");

    // Add new vectors
    console.log("\nAdding new QA vectors...");
    if (vectors.length > 0) {
      await index.namespace(qaNamespace).upsert(vectors);
      console.log(`Added ${vectors.length} new QA vectors`);
    }

    // Log statistics
    const navigationQAs = generalQAs.filter(
      (qa: QA) => qa.category === "navigation"
    );
    const informationalQAs = generalQAs.filter(
      (qa: QA) => qa.category === "general"
    );
    const textQAs = generalQAs.filter((qa: QA) => qa.type === "text");
    const voiceQAs = generalQAs.filter((qa: QA) => qa.type === "voice");

    return cors(
      request,
      NextResponse.json({
        success: true,
        message: "Generated and stored general QAs",
        stats: {
          totalQAs: generalQAs.length,
          navigationQAs: navigationQAs.length,
          generalQAs: informationalQAs.length,
          textQAs: textQAs.length,
          voiceQAs: voiceQAs.length,
          vectorsGenerated: vectors.length,
        },
        store: {
          collectionsCount: storeData.collections.length,
          productsCount: storeData.products.length,
          blogPostsCount: storeData.blogPosts.length,
          pagesCount: storeData.pages.length,
          activeDiscountsCount: storeData.discounts.length,
        },
      })
    );
  } catch (error: any) {
    console.error("Error in general QA generation:", error);
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
