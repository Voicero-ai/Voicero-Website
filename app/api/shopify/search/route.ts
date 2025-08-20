import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { Pinecone } from "@pinecone-database/pinecone";
import {
  buildHybridQueryVectors,
  shouldFallbackToCollections,
} from '../../../../lib/sparse/hybrid_query_tuning';
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

// Deterministic sparse vector generator remains unchanged for documents; query path uses hybrid builder

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

    // Combine conversation history with current query for better context
    const lastMessages = conversationHistory.slice(-6); // Get last 6 messages
    const combinedQuery = [...lastMessages, query].join(" ");

    // Build hybrid query vectors (query-only path; no reindexing required)
    const { denseScaled, sparseScaled } = await buildHybridQueryVectors(
      combinedQuery,
      {
        alpha: 0.5,
        featureSpace: 2_000_003,
      }
    );

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

    // Optional fallback for ultra-generic queries
    if (shouldFallbackToCollections(sparseScaled)) {
      return cors(
        request,
        NextResponse.json({
          response: {
            action: "redirect",
            answer: "Here’s our catalog to browse items.",
            category: "discovery",
            pageId: "collections",
            pageTitle: "Shop All",
            question: query,
            scrollText: "",
            subcategory: "content_overview",
            type: type,
            url: `${website.url}/collections/all`,
          },
          context: {
            mainContent: null,
            exampleQAs: [],
          },
        })
      );
    }

    // Perform hybrid search with increased limit to get enough QAs
    const searchResponse = await index.namespace(website.id).query({
      vector: denseScaled,
      sparseVector: sparseScaled,
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
