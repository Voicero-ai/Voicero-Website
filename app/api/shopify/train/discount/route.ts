import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Client } from "@opensearch-project/opensearch";
import { cors } from "../../../../../lib/cors";
import { RecordSparseValues } from "@pinecone-database/pinecone";
import OpenAI from "openai";
import crypto from "crypto";
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

// Main prompt for discount QA generation
const DISCOUNT_QA_PROMPT = `Generate 10 questions and answers about using this discount:
\${discountJson}

Generate QAs for these subcategories:

1. ELIGIBILITY (2 text, 2 voice):
   - Questions about who can use the discount and when
   - Text answers: 2-3 sentences (20-40 words)
   - Voice answers: 1-2 sentences (10-20 words)
   - Examples:
     Q: "Can I use this discount?"
     A: "Yes, this [discount type] for [value] is available until [end date]. It applies to [products/collections]."

2. USAGE (2 text, 2 voice):
   - Questions about how to apply the discount
   - Text answers: 2-3 sentences (20-40 words)
   - Voice answers: 1-2 sentences (10-20 words)
   - Examples:
     Q: "How do I use this discount?"
     A: "Enter code [code] at checkout to get [value] off [applies to]."

3. VALUE (1 text, 1 voice):
   - Questions about discount amount and savings
   - Text answers: 2-3 sentences (20-40 words)
   - Voice answers: 1-2 sentences (10-20 words)
   - Examples:
     Q: "How much will I save?"
     A: "This discount gives you [value] off [applies to]. The minimum purchase is [min amount]."

Format as:
{
  "qas": [
    {
      "id": "qa-discount-1",
      "type": "text" | "voice",
      "category": "discount",
      "subcategory": "eligibility" | "usage" | "value",
      "question": "string",
      "answer": "string",
      "action": null,
      "url": null
    }
  ]
}`;

const SYSTEM_MESSAGE = `You are a helpful assistant that generates questions and answers about discounts. Make voice responses conversational and natural. Focus on helping users understand if they can use the discount, how to apply it, and how much they'll save. Keep text answers to 20-40 words (2-3 sentences) and voice answers to 10-20 words (1-2 sentences). You must return valid JSON.`;

// Update the QA interface to match our standard format
interface QA {
  id: string;
  questionType: "text" | "voice";
  question: string;
  answer: string;
  webAction: string | null;
  url: string | null;
  discount: {
    title: string;
    code: string;
    type: string;
    value: string;
    startsAt: string;
    endsAt: string;
    status: string;
  };
}

interface VectorMetadata extends Record<string, any> {
  type: string;
  category: string;
  subcategory: string;
  question: string;
  answer: string;
  action: string | null;
  url: string | null;
  discountId: string;
  discountTitle: string;
  discountCode: string;
}

// Function to process QAs and generate vectors
async function processQAs(
  qas: any[],
  vectorId: string,
  discount: any
  // category is always 'discount' here, subcategory comes from QA
) {
  const sectionVectors = [];
  let processedCount = 0;

  // Create a sanitized discount title for IDs
  const sanitizedTitle = discount.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  for (const qa of qas) {
    try {
      const qaText = `${qa.question} ${qa.answer}`;
      const type = "discount"; // Hardcoded type
      const category = "discount"; // Hardcoded category
      const subcategory = qa.subcategory || "general"; // Get subcategory from QA

      console.log(`Generating vectors for QA ${qa.id}:`, {
        question: qa.question.substring(0, 50) + "...",
        category: category,
        subcategory: subcategory,
      });

      const [denseVector, sparseVector] = await Promise.all([
        embeddings.embedQuery(qaText),
        // Pass the additional fields to generateSparseVectors
        generateSparseVectors(qaText, type, category, subcategory),
      ]);

      // Add discount metadata to each QA
      const discountMetadata = {
        title: discount.title || "",
        code: discount.code || "",
        type: discount.type || "", // Note: this is discount type (e.g., FIXED_AMOUNT), not vector type
        value: discount.value || "",
        startsAt: discount.startsAt || "",
        endsAt: discount.endsAt || "",
        status: discount.status || "",
      };

      sectionVectors.push({
        id: `qa-${sanitizedTitle}-${crypto.randomBytes(8).toString("hex")}`,
        values: denseVector,
        sparseValues: sparseVector,
        metadata: {
          // Spread discountMetadata first
          ...discountMetadata, // Spreads discount-specific fields like code, value etc.
          // Define specific vector metadata second to ensure they overwrite
          type: type, // Vector type: "discount"
          category: category, // Vector category: "discount"
          subcategory: subcategory, // Vector subcategory: e.g., "eligibility"
          questionType: qa.questionType || "text",
          question: qa.question || "",
          answer: qa.answer || "",
          webAction: qa.webAction || "",
          url: qa.url || "",
          discountId: vectorId,
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
async function generateQAs(discount: any, vectorId: string) {
  try {
    console.log("Preparing discount data for QA generation:", {
      fromDatabase: Boolean(discount.websiteId),
      discountId: discount.id,
      shopifyId: discount.shopifyId,
      vectorId: vectorId,
    });

    // Use database fields with enhanced data
    const discountData = {
      title: discount.title || "",
      code: discount.code || "",
      type: discount.type || "",
      value: discount.value || "",
      appliesTo: discount.appliesTo || "all products",
      startsAt: discount.startsAt,
      endsAt: discount.endsAt,
      status: discount.status || "ACTIVE",

      // Remove any circular references or unnecessary fields
      website: undefined,
      VectorDbConfig: undefined,
    };

    console.log(
      "Generated discount data for QAs:",
      JSON.stringify(discountData, null, 2)
    );

    // Array to store all vectors
    const vectors = [];

    // Generate QAs for each subcategory using the single prompt
    // The prompt itself asks for specific subcategories (eligibility, usage, value)
    // generateQAsForPrompt filters the result by the requested subcategory
    console.log("\nGenerating QAs from Discount Prompt...");
    const eligibilityQAs = await generateQAsForPrompt(
      discountData,
      vectorId,
      DISCOUNT_QA_PROMPT,
      "eligibility"
    );
    const usageQAs = await generateQAsForPrompt(
      discountData,
      vectorId,
      DISCOUNT_QA_PROMPT,
      "usage"
    );
    const valueQAs = await generateQAsForPrompt(
      discountData,
      vectorId,
      DISCOUNT_QA_PROMPT,
      "value"
    );

    // Process vectors for each subcategory group
    // Pass category="discount" explicitly to processQAs
    const eligibilityVectorsPromise = processQAs(
      eligibilityQAs,
      vectorId,
      discount
      // category handled inside processQAs for discounts
    );
    const usageVectorsPromise = processQAs(
      usageQAs,
      vectorId,
      discount
      // category handled inside processQAs for discounts
    );
    const valueVectorsPromise = processQAs(
      valueQAs,
      vectorId,
      discount
      // category handled inside processQAs for discounts
    );

    // Wait for all vector processing to complete
    const [eligibilityVectors, usageVectors, valueVectors] = await Promise.all([
      eligibilityVectorsPromise,
      usageVectorsPromise,
      valueVectorsPromise,
    ]);

    // Combine all vectors
    vectors.push(...eligibilityVectors, ...usageVectors, ...valueVectors);

    // Combine all QAs for validation
    const allQAs = [...eligibilityQAs, ...usageQAs, ...valueQAs];

    // Create a sanitized discount title for IDs
    const sanitizedTitle = discount.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    // Make IDs unique, ensure fields and categories/subcategories
    allQAs.forEach((qa, index) => {
      qa.id = `qa-${sanitizedTitle}-${crypto.randomBytes(8).toString("hex")}`;
      qa.webAction = qa.webAction || null;
      qa.url = qa.url || null;
      qa.questionType = qa.questionType || "text";
      qa.category = "discount"; // Explicitly set category
      qa.subcategory = qa.subcategory || "general"; // Ensure subcategory exists
      // Keep existing qa.discount assignment
      qa.discount = {
        title: discount.title || "",
        code: discount.code || "",
        type: discount.type || "",
        value: discount.value || "",
        startsAt: discount.startsAt || "",
        endsAt: discount.endsAt || "",
        status: discount.status || "",
      };
    });

    // Validate each QA - check required fields including category/subcategory
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

    // Log QA counts by subcategory
    const subcategoryCounts = validatedQAs.reduce((acc, qa) => {
      acc[qa.subcategory] = (acc[qa.subcategory] || 0) + 1;
      return acc;
    }, {});

    console.log("\nQA Statistics by Subcategory:");
    Object.entries(subcategoryCounts).forEach(([subcategory, count]) => {
      console.log(`${subcategory}: ${count} QAs`);
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
  discountData: any,
  vectorId: string,
  prompt: string,
  subcategory: string
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
            "${discountJson}",
            JSON.stringify(discountData, null, 2)
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

    // Filter QAs by subcategory and convert null values
    return parsedContent.qas
      .filter((qa: any) => qa.subcategory === subcategory)
      .map((qa: any) => ({
        ...qa,
        webAction: qa.webAction || null,
        url: qa.url || null,
        questionType: qa.questionType || "text",
        discount: {
          title: discountData.title || "",
          code: discountData.code || "",
          type: discountData.type || "",
          value: discountData.value || "",
          startsAt: discountData.startsAt || "",
          endsAt: discountData.endsAt || "",
          status: discountData.status || "",
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
    await prisma.shopifyDiscount.update({
      where: { id },
      data: { isTraining: true },
    });

    // Get the website ID from the discount
    console.log("Looking up discount with ID:", id);
    const discount = await prisma.shopifyDiscount.findFirst({
      where: { id },
      include: {
        website: {
          include: {
            VectorDbConfig: true,
          },
        },
      },
    });

    if (!discount) {
      // Reset isTraining if discount not found
      await prisma.shopifyDiscount.update({
        where: { id },
        data: { isTraining: false },
      });
      console.log("Discount not found in database with ID:", id);
      return cors(
        request,
        NextResponse.json(
          { error: "Discount not found in database" },
          { status: 404 }
        )
      );
    }

    console.log("Found discount:", {
      id: discount.id,
      websiteId: discount.websiteId,
      qaNamespace: discount.website.VectorDbConfig?.QANamespace,
    });

    // Get the namespace from VectorDbConfig or fallback to website ID
    const qaNamespace =
      discount.website.VectorDbConfig?.QANamespace ||
      `${discount.website.id}-qa`;
    console.log("Using QA namespace:", qaNamespace);

    // Initialize Pinecone index
    const index = pinecone.index("voicero-hybrid");

    // Generate QAs using the database data
    console.log("Generating QAs for discount");
    let result;
    try {
      result = await generateQAs(discount, vectorId);
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
        await prisma.shopifyDiscount.update({
          where: { id },
          data: { trained: true },
        });
        console.log("Updated discount trained status to true");
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
    await prisma.shopifyDiscount.update({
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
        message: "Generated and stored QAs for discount",
        count: result.vectors.length,
        discountId: vectorId,
        processedQAs: result.validatedQAs.length,
        totalQAs: result.validatedQAs.length,
      })
    );
  } catch (error: any) {
    // Reset isTraining if there's an error
    if (id) {
      await prisma.shopifyDiscount.update({
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
