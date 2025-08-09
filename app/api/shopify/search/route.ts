import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Client } from "@opensearch-project/opensearch";
import { cors } from "../../../../lib/cors";
import OpenAI from "openai";
export const dynamic = "force-dynamic";

interface Website {
  id: string;
  url: string;
}

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});
const openai = new OpenAI();

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

// Helper function to generate sparse vectors using OpenSearch
async function generateSparseVectors(text: string) {
  const indexName = `temp-analysis-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 15)}`;

  try {
    // Create temporary index with BM25-like settings
    await opensearch.indices.create({
      index: indexName,
      body: {
        settings: {
          analysis: {
            analyzer: {
              custom_analyzer: {
                type: "custom",
                tokenizer: "standard",
                filter: ["lowercase", "stop", "porter_stem", "length"],
              },
            },
          },
        },
        mappings: {
          properties: {
            content: {
              type: "text",
              analyzer: "custom_analyzer",
              term_vector: "with_positions_offsets_payloads",
              similarity: "BM25",
            },
          },
        },
      },
    });

    // Index the document
    await opensearch.index({
      index: indexName,
      body: { content: text },
      refresh: true,
    });

    // Get term vectors with BM25 stats
    const response = await opensearch.transport.request({
      method: "GET",
      path: `/${indexName}/_termvectors`,
      body: {
        doc: { content: text },
        fields: ["content"],
        term_statistics: true,
        field_statistics: true,
      },
    });

    const terms = response.body.term_vectors?.content?.terms || {};
    const sparseValues: number[] = [];
    const sparseIndices: number[] = [];

    // Sort by BM25 score and take top terms
    Object.entries(terms)
      .sort((a, b) => {
        const scoreA = (a[1] as any).score || 0;
        const scoreB = (b[1] as any).score || 0;
        return scoreB - scoreA;
      })
      .slice(0, 1000)
      .forEach(([_, stats], idx) => {
        const tf = (stats as any).term_freq || 0;
        const docFreq = (stats as any).doc_freq || 1;
        const score = tf * Math.log(1 + 1 / docFreq);
        sparseIndices.push(idx);
        sparseValues.push(score);
      });

    // Normalize values to [0,1] range
    const maxValue = Math.max(...sparseValues);
    if (maxValue > 0) {
      for (let i = 0; i < sparseValues.length; i++) {
        sparseValues[i] = sparseValues[i] / maxValue;
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

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const {
      query,
      websiteId,
      type = "text",
      conversationHistory = [],
      currentUrl = "",
    } = body;

    if (!query || !websiteId) {
      return cors(
        request,
        NextResponse.json(
          { error: "Missing required fields: query and websiteId" },
          { status: 400 }
        )
      );
    }

    // Get website details
    const websites = (await query("SELECT id, url FROM Website WHERE id = ?", [
      websiteId,
    ])) as Website[];

    if (websites.length === 0) {
      return cors(
        request,
        NextResponse.json({ error: "Website not found" }, { status: 404 })
      );
    }

    const website = websites[0];

    // Initialize embeddings
    const embeddings = new OpenAIEmbeddings({
      modelName: "text-embedding-3-large",
    });

    // Combine conversation history with current query for better context
    const lastMessages = conversationHistory.slice(-6); // Get last 6 messages
    const combinedQuery = [...lastMessages, query].join(" ");

    // Generate dense vector for the combined query
    const queryEmbedding = await embeddings.embedQuery(combinedQuery);

    // Generate sparse vector for the combined query
    const sparseVectors = await generateSparseVectors(combinedQuery);

    // Initialize Pinecone index
    const index = pinecone.Index("voicero-hybrid");

    // Extract content type from URL if available
    let contentType = "";
    if (currentUrl) {
      const urlObj = new URL(currentUrl);
      const pathParts = urlObj.pathname.split("/").filter(Boolean);
      if (pathParts.length > 0) {
        contentType = pathParts[0]; // e.g., "products", "collections", "pages"
      }
    }

    // Perform hybrid search with increased limit to get enough QAs
    const searchResponse = await index.namespace(website.id).query({
      vector: queryEmbedding,
      sparseVector: sparseVectors,
      topK: 20,
      includeMetadata: true,
      filter: contentType ? { type: contentType } : undefined,
    });

    // Separate QA and non-QA results
    const qaResults = searchResponse.matches.filter((match) =>
      match.id.startsWith("qa-")
    );
    const nonQaResults = searchResponse.matches.filter(
      (match) => !match.id.startsWith("qa-")
    );

    // Get top 10 QAs and first non-QA result
    const topQAs = qaResults.slice(0, 10);
    const mainContent = nonQaResults[0];

    if (!mainContent) {
      return cors(
        request,
        NextResponse.json(
          { error: "No relevant content found" },
          { status: 404 }
        )
      );
    }

    // Prepare context for OpenAI with enhanced metadata
    const context = {
      mainContent: {
        type: mainContent.id.split("-")[0],
        title: mainContent.metadata?.title || "",
        content: mainContent.metadata?.content || "",
        description: mainContent.metadata?.description || "",
        handle: mainContent.metadata?.handle || "",
        url: `${website.url}/${mainContent.id.split("-")[0]}s/${
          mainContent.metadata?.handle || ""
        }`,
        price: mainContent.metadata?.price,
        variants: mainContent.metadata?.variants,
        collection: mainContent.metadata?.collection,
        tags: mainContent.metadata?.tags,
      },
      exampleQAs: topQAs.map((qa) => ({
        question: qa.metadata?.question || "",
        answer: qa.metadata?.answer || "",
        type: qa.metadata?.type || "text",
        category: qa.metadata?.category || "",
        subcategory: qa.metadata?.subcategory || "",
        action: qa.metadata?.action || "",
        url: qa.metadata?.url || "",
        scrollText: qa.metadata?.scrollText || "",
      })),
      conversationContext: {
        history: lastMessages,
        currentUrl,
        contentType,
      },
    };

    // Generate response using OpenAI with enhanced system prompt
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant that generates responses in the same format as the example QAs.
          The main content is what the user is asking about, and the example QAs show the format you should follow.
          Keep responses concise and natural. For voice responses, use 1-2 sentences. For text responses, use 2-3 sentences.
          Always include specific details from the main content in your response.
          
          Consider the conversation history and current context when generating responses.
          If the user is asking about a specific product, collection, or page, prioritize that content type.
          If the user is asking about prices, discounts, or purchasing, include relevant pricing information.
          If the user is asking about navigation or location, provide clear direction to the requested content.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            query,
            context,
            type,
          }),
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const response = completion.choices[0].message.content;
    let formattedResponse;

    try {
      formattedResponse = JSON.parse(response || "{}");
    } catch (e) {
      // If parsing fails, create a basic response
      formattedResponse = {
        action: "redirect",
        answer: response || "No response available",
        category: "discovery",
        pageId: mainContent.id,
        pageTitle: mainContent.metadata?.title || "",
        question: query,
        scrollText: "",
        subcategory: "content_overview",
        type: type,
        url: `${website.url}/${mainContent.id.split("-")[0]}s/${
          mainContent.metadata?.handle || ""
        }`,
      };
    }

    return cors(
      request,
      NextResponse.json({
        response: formattedResponse,
        context: {
          mainContent: context.mainContent,
          exampleQAs: context.exampleQAs,
        },
      })
    );
  } catch (error: any) {
    console.error("Search error:", error);
    return cors(
      request,
      NextResponse.json(
        { error: "Failed to perform search", details: error.message },
        { status: 500 }
      )
    );
  }
}
