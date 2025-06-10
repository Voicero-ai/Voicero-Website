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

// Initialize clients
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
    // Index the combined text
    await opensearch.index({
      index: indexName,
      body: { content: text },
      refresh: true,
    });

    // Request term vectors for the combined text
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

// Updated prompt for WordPress websites
const GENERAL_QA_PROMPT = `Generate 22 general site-wide questions and answers based on this WordPress site content:
\${storeJson}

Generate QAs for these categories:

1. NAVIGATION (3 text, 3 voice):
   - Questions about navigating to main site pages
   - Always use "redirect" action with appropriate URL
   - Examples:
     Q: "How do I get to the home page?"
     A: "I'll take you to our home page."
     action: "redirect"
     url: "/"

     Q: "Where can I find your blog posts?"
     A: "I'll take you to our blog."
     action: "redirect"
     url: "/blog"

     Q: "Can you show me the contact page?"
     A: "I'll take you to our contact page."
     action: "redirect"
     url: "/contact"

2. GENERAL (5 text, 5 voice):
   - Broad questions about products, categories, posts
   - NO actions or URLs - these are informational only
   - Examples:
     Q: "What kind of products do you sell?"
     A: "We offer [types of products from categories]. Our categories include [category names]."
     action: null
     url: null

     Q: "What topics does your blog cover?"
     A: "Our blog covers topics like [post categories/topics]."
     action: null
     url: null

3. SITE_INFO (3 text, 3 voice):
   - Questions about the site itself, policies, etc.
   - NO actions or URLs - these are informational only
   - Examples:
     Q: "What's your website about?"
     A: "Our website focuses on [site topic based on content]. We offer [products/services] and share information about [blog topics]."
     action: null
     url: null

IMPORTANT:
- For NAVIGATION: Only use standard WordPress URLs (/, /blog, /contact, etc.)
- For GENERAL and SITE_INFO: NO actions or URLs - just informational answers
- Keep answers concise and natural
- Use information from categories, products, and posts to inform answers

Format as:
{
  "qas": [
    {
      "id": "qa-general-1",
      "type": "text" | "voice",
      "category": "navigation" | "general" | "site_info",
      "subcategory": "pages" | "info" | "products" | "blog",
      "question": "string",
      "answer": "string",
      "action": "redirect" | null,
      "url": "/standard/wordpress/url" | null
    }
  ]
}`;

// Updated system message for WordPress
const SYSTEM_MESSAGE = `You are a helpful assistant that generates general site-wide questions and answers for a WordPress website. Your task is to:
1. Generate navigation QAs for basic site pages (always use "redirect" action)
2. Generate general informational QAs about the site (no actions/URLs)
3. Generate site info QAs about the website itself (no actions/URLs)

For navigation questions:
- Only use standard WordPress URLs (/, /blog, /contact, /about, and others etc.)
- Always include both action and URL
- Keep answers simple and direct

For general and site info questions:
- Focus on broad site information
- NO actions or URLs
- Use available product/category/post data to inform answers

Keep answers concise and natural:
- Text answers: 20-40 words
- Voice answers: 10-20 words

You must return valid JSON in the specified format.`;

// Updated interface for WordPress
interface QA {
  id: string;
  type: "text" | "voice";
  category: "navigation" | "general" | "site_info";
  subcategory: "pages" | "info" | "products" | "blog";
  question: string;
  answer: string;
  action: string | null;
  url: string | null;
}

// Helper function to get WordPress site data
async function getWordPressSiteData(websiteId: string) {
  try {
    // Get WordPress categories
    const categories = await prisma.wordpressCategory.findMany({
      where: {
        websiteId,
      },
      select: {
        name: true,
        slug: true,
        description: true,
      },
    });

    // Get WordPress product categories
    const productCategories = await prisma.wordpressProductCategory.findMany({
      where: {
        websiteId,
      },
      select: {
        name: true,
        slug: true,
        description: true,
      },
    });

    // Get WordPress products
    const products = await prisma.wordpressProduct.findMany({
      where: {
        websiteId,
      },
      select: {
        name: true,
        slug: true,
        description: true,
        shortDescription: true,
        permalink: true,
        price: true,
      },
      take: 50, // Limit to 50 products to avoid overwhelming the prompt
    });

    // Get WordPress posts
    const posts = await prisma.wordpressPost.findMany({
      where: {
        websiteId,
      },
      select: {
        title: true,
        slug: true,
        excerpt: true,
        link: true,
        authorId: true,
        categories: {
          select: {
            name: true,
          },
        },
        tags: {
          select: {
            name: true,
          },
        },
      },
      take: 50, // Limit to 50 posts to avoid overwhelming the prompt
    });

    // Get WordPress pages
    const pages = await prisma.wordpressPage.findMany({
      where: {
        websiteId,
      },
      select: {
        title: true,
        slug: true,
        content: true,
        link: true,
      },
    });

    // Get WordPress tags
    const tags = await prisma.wordpressTag.findMany({
      where: {
        websiteId,
      },
      select: {
        name: true,
        slug: true,
      },
    });

    return {
      categories: categories.map((c) => ({
        name: c.name,
        slug: c.slug,
        description: c.description,
      })),
      productCategories: productCategories.map((c) => ({
        name: c.name,
        slug: c.slug,
        description: c.description,
      })),
      products: products.map((p) => ({
        name: p.name,
        slug: p.slug,
        description: p.description,
        shortDescription: p.shortDescription,
        permalink: p.permalink,
        price: p.price,
      })),
      posts: posts.map((p) => ({
        title: p.title,
        slug: p.slug,
        excerpt: p.excerpt,
        link: p.link,
        categories: p.categories.map((c) => c.name),
        tags: p.tags.map((t) => t.name),
      })),
      pages: pages.map((p) => ({
        title: p.title,
        slug: p.slug,
        link: p.link,
      })),
      tags: tags.map((t) => ({
        name: t.name,
        slug: t.slug,
      })),
    };
  } catch (error) {
    console.error("Error getting WordPress site data:", error);
    throw error;
  }
}

// Function to process QAs and generate vectors - Updated for WordPress
async function processQAs(qas: QA[], websiteId: string) {
  const sectionVectors = [];
  let processedCount = 0;
  for (const qa of qas) {
    try {
      const qaText = `${qa.question} ${qa.answer}`;
      const type = "general";
      const qaCategory = qa.category || "general";
      const qaSubcategory = qa.subcategory || "info";

      console.log(`Generating vectors for QA ${qa.id}:`, {
        question: qa.question.substring(0, 50) + "...",
        category: qaCategory,
        subcategory: qaSubcategory,
      });

      const [denseVector, sparseVector] = await Promise.all([
        embeddings.embedQuery(qaText),
        generateSparseVectors(qaText, type, qaCategory, qaSubcategory),
      ]);

      // Create a unique ID with randomness
      const uniqueId = `qa-wp-general-${websiteId.substring(0, 8)}-${crypto
        .randomBytes(4)
        .toString("hex")}-${processedCount + 1}`;

      const metadata = {
        type: type,
        category: qaCategory,
        subcategory: qaSubcategory,
        questionType: qa.type || "text",
        question: qa.question || "",
        answer: qa.answer || "",
        webAction: qa.action || "",
        url: qa.url || "",
        websiteId: websiteId || "",
      };

      sectionVectors.push({
        id: uniqueId,
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

// Helper function to generate QAs - updated for WordPress
async function generateQAs(
  siteData: any,
  prompt: string,
  systemMessage: string
) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMessage },
        {
          role: "user",
          content: prompt.replace(
            "${storeJson}",
            JSON.stringify(siteData, null, 2)
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

    // Validate and fix QAs
    const validatedQAs = parsedContent.qas.map((qa: QA) => {
      // For navigation category, ensure proper action and URL
      if (qa.category === "navigation") {
        qa.action = "redirect";
        // Ensure URL starts with /
        qa.url = qa.url?.startsWith("/") ? qa.url : `/${qa.url}`;
      } else {
        // For general and site_info categories, ensure no action or URL
        qa.action = null;
        qa.url = null;
      }

      // Ensure subcategory is set
      if (!qa.subcategory) {
        if (qa.category === "navigation") qa.subcategory = "pages";
        else if (qa.category === "general") qa.subcategory = "info";
        else if (qa.category === "site_info") qa.subcategory = "info";
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

// Updated POST handler for WordPress
export async function POST(request: NextRequest) {
  try {
    const { websiteId } = await request.json();
    console.log(
      "Received WordPress general QA request with websiteId:",
      websiteId
    );

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

    // Get WordPress site data
    console.log("Getting WordPress site data...");
    const siteData = await getWordPressSiteData(websiteId);

    console.log("\nWordPress site data summary:");
    console.log(`Categories: ${siteData.categories.length}`);
    console.log(`Product Categories: ${siteData.productCategories.length}`);
    console.log(`Products: ${siteData.products.length}`);
    console.log(`Posts: ${siteData.posts.length}`);
    console.log(`Pages: ${siteData.pages.length}`);
    console.log(`Tags: ${siteData.tags.length}`);

    // Generate QAs
    console.log("\nGenerating WordPress General QAs...");
    const generalQAs = await generateQAs(
      siteData,
      GENERAL_QA_PROMPT,
      SYSTEM_MESSAGE
    );

    // Process QAs and generate vectors
    console.log("\nProcessing QAs and generating vectors...");
    const vectors = await processQAs(generalQAs, websiteId);

    // Initialize Pinecone index
    const index = pinecone.index("voicero-hybrid");

    // Add new vectors
    console.log("\nAdding new WordPress QA vectors...");
    if (vectors.length > 0) {
      await index.namespace(qaNamespace).upsert(vectors);
      console.log(`Added ${vectors.length} new WordPress QA vectors`);
    }

    // Log statistics
    const navigationQAs = generalQAs.filter(
      (qa: QA) => qa.category === "navigation"
    );
    const generalInfoQAs = generalQAs.filter(
      (qa: QA) => qa.category === "general"
    );
    const siteInfoQAs = generalQAs.filter(
      (qa: QA) => qa.category === "site_info"
    );
    const textQAs = generalQAs.filter((qa: QA) => qa.type === "text");
    const voiceQAs = generalQAs.filter((qa: QA) => qa.type === "voice");

    return cors(
      request,
      NextResponse.json({
        success: true,
        message: "Generated and stored WordPress general QAs",
        stats: {
          totalQAs: generalQAs.length,
          navigationQAs: navigationQAs.length,
          generalInfoQAs: generalInfoQAs.length,
          siteInfoQAs: siteInfoQAs.length,
          textQAs: textQAs.length,
          voiceQAs: voiceQAs.length,
          vectorsGenerated: vectors.length,
        },
        site: {
          categoriesCount: siteData.categories.length,
          productCategoriesCount: siteData.productCategories.length,
          productsCount: siteData.products.length,
          postsCount: siteData.posts.length,
          pagesCount: siteData.pages.length,
          tagsCount: siteData.tags.length,
        },
      })
    );
  } catch (error: any) {
    console.error("Error in WordPress general QA generation:", error);
    return cors(
      request,
      NextResponse.json(
        {
          error:
            "An error occurred while processing the WordPress general QA request",
          details: error.message,
        },
        { status: 500 }
      )
    );
  }
}
