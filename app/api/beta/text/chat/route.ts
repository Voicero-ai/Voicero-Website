// app/api/text-chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import * as mysql from "mysql2/promise";
import {
  verifyToken,
  getWebsiteIdFromToken,
} from "../../../../../lib/token-verifier";
import Stripe from "stripe";
import { Pinecone } from "@pinecone-database/pinecone";
import {
  QuestionClassification,
  performMainSearch,
} from "../../../../../lib/pinecone-search";
import { buildHybridQueryVectors } from "../../../../../lib/sparse/hybrid_query_tuning";

export const dynamic = "force-dynamic";

const dbConfig = {
  host: process.env.DATABASE_HOST!,
  user: process.env.DATABASE_USER!,
  password: process.env.DATABASE_PASSWORD!,
  database: process.env.DATABASE_NAME!,
  port: parseInt(process.env.DATABASE_PORT!) || 3306,
  charset: "utf8mb4",
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Pinecone client
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

// Helper function to map classifier action to pinecone action_intent
function mapActionToActionIntent(action: string): string {
  switch (action) {
    case "get_order":
      return "get_orders";
    case "track_order":
      return "track_order";
    case "return_order":
      return "return_order";
    case "exchange_order":
      return "exchange_order";
    case "add_to_cart":
      return "purchase";
    default:
      return "none";
  }
}

/**
 * Minimal data-URL guard; we accept "data:*;base64,...."
 * Returns { mime, base64, dataUrl } or null if invalid.
 */
function parseDataUrl(input?: string | null) {
  if (!input || typeof input !== "string") return null;
  const m = input.match(/^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m) return null;
  const mime = m[1]?.trim();
  const base64 = m[2]?.trim();
  if (!mime || !base64) return null;
  return { mime, base64, dataUrl: input };
}

/** Quick size guard (in bytes) for base64 payloads to avoid huge requests */
function approxBytesFromBase64(b64: string) {
  // 4 base64 chars ~ 3 bytes
  return Math.floor((b64.replace(/\s/g, "").length * 3) / 4);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

type IncomingAttachment = {
  contentPreview?: string; // data URL
  name?: string;
  type?: string; // e.g. "image/png", "application/pdf"
  extension?: string; // ".png", ".pdf"
  size?: number;
  fileId?: string; // optional Files API id for images
};

export async function POST(request: NextRequest) {
  let connection: mysql.Connection | undefined;

  try {
    const body = await request.json();

    const {
      question,
      responseId: incomingResponseId,
      pageContent,
      sessionId,
      conversationId,
      attachedImage, // { contentPreview: "data:image/png;base64,...", ... } or null
      attachedFile, // { contentPreview: "data:application/pdf;base64,...", ... } or null
      attachedImages, // optional array of images (data URL or fileId)
    }: {
      question: string;
      responseId?: string;
      pageContent?: string | null;
      sessionId?: string | null;
      conversationId?: string | null;
      attachedImage?: IncomingAttachment | null;
      attachedFile?: IncomingAttachment | null;
      attachedImages?: IncomingAttachment[] | null;
    } = body;

    // Auth
    const authHeader = request.headers.get("authorization");
    const isTokenValid = await verifyToken(authHeader);
    if (!isTokenValid) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid token" },
        { status: 401 }
      );
    }

    if (!question && !attachedImage && !attachedFile) {
      return NextResponse.json(
        { error: "Question or an attachment is required" },
        { status: 400 }
      );
    }

    // DB connect
    connection = await mysql.createConnection(dbConfig);

    // Find or create session
    let sessionIdToUse = sessionId;
    if (!sessionIdToUse || sessionIdToUse === "") {
      const websiteId = await getWebsiteIdFromToken(authHeader);
      if (!websiteId) {
        return NextResponse.json(
          { error: "Could not determine website ID from token" },
          { status: 400 }
        );
      }
      await connection.execute(
        "INSERT INTO Session (id, websiteId, textOpen) VALUES (UUID(), ?, ?)",
        [websiteId, true]
      );
      const [newSessionResult] = await connection.execute(
        "SELECT id FROM Session WHERE websiteId = ? ORDER BY createdAt DESC LIMIT 1",
        [websiteId]
      );
      sessionIdToUse = (newSessionResult as any[])[0].id;
    }

    // Conversation handling
    let conversationIdToUse = conversationId;
    if (!conversationIdToUse || conversationIdToUse === "") {
      await connection.execute(
        "INSERT INTO TextConversations (id, sessionId, createdAt, mostRecentConversationAt, firstConversationAt) VALUES (UUID(), ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))",
        [sessionIdToUse]
      );
      const [newConversationIdResult] = await connection.execute(
        "SELECT id FROM TextConversations WHERE sessionId = ? ORDER BY createdAt DESC LIMIT 1",
        [sessionIdToUse]
      );
      conversationIdToUse = (newConversationIdResult as any[])[0].id;
    } else {
      await connection.execute(
        "UPDATE TextConversations SET mostRecentConversationAt = CURRENT_TIMESTAMP(3), totalMessages = totalMessages + 1 WHERE id = ?",
        [conversationIdToUse]
      );
    }

    // Log user turn
    const userText = question ?? "";
    await connection.execute(
      "INSERT INTO TextChats (id, textConversationId, messageType, content, createdAt) VALUES (UUID(), ?, 'user', ?, CURRENT_TIMESTAMP(3))",
      [conversationIdToUse, userText]
    );

    // ------- Stripe usage metering (copied logic, adapted) -------
    // Determine if this is the first user message in the conversation
    let shouldBillForStripe = false;
    try {
      const [cntRows] = await connection.execute(
        "SELECT COUNT(*) as cnt FROM TextChats WHERE textConversationId = ? AND messageType = 'user'",
        [conversationIdToUse]
      );
      const userMsgCount = (cntRows as any[])[0]?.cnt ?? 0;
      shouldBillForStripe = userMsgCount === 1;
    } catch (e) {
      console.error("Billing Debug: failed to count user messages", e);
    }

    // Resolve websiteId for billing
    let websiteIdForBilling: string | null = null;
    try {
      const websiteIdFromToken = await getWebsiteIdFromToken(
        request.headers.get("authorization")
      );
      websiteIdForBilling = websiteIdFromToken || null;
      if (!websiteIdForBilling) {
        const [sessRows] = await connection.execute(
          "SELECT websiteId FROM Session WHERE id = ? LIMIT 1",
          [sessionIdToUse]
        );
        websiteIdForBilling = (sessRows as any[])[0]?.websiteId || null;
      }
    } catch (e) {
      console.error("Billing Debug: failed to resolve websiteId", e);
    }

    // Fetch website and user info required for billing
    let websiteForBilling: {
      id: string;
      plan: string;
      monthlyQueries: number;
      stripeSubscriptionId: string | null;
      stripeSubscriptionItemId: string | null;
      userId: string | null;
    } | null = null;
    let userForBilling: {
      id: string;
      stripeCustomerId: string | null;
      email: string | null;
    } | null = null;

    if (websiteIdForBilling) {
      try {
        const [wRows] = await connection.execute(
          "SELECT id, plan, monthlyQueries, stripeSubscriptionId, stripeSubscriptionItemId, userId FROM Website WHERE id = ? LIMIT 1",
          [websiteIdForBilling]
        );
        const w = (wRows as any[])[0];
        if (w) {
          websiteForBilling = {
            id: w.id,
            plan: w.plan,
            monthlyQueries: w.monthlyQueries ?? 0,
            stripeSubscriptionId: w.stripeSubscriptionId || null,
            stripeSubscriptionItemId: w.stripeSubscriptionItemId || null,
            userId: w.userId || null,
          };

          if (websiteForBilling.userId) {
            const [uRows] = await connection.execute(
              "SELECT id, stripeCustomerId, email FROM User WHERE id = ? LIMIT 1",
              [websiteForBilling.userId]
            );
            const u = (uRows as any[])[0];
            if (u) {
              userForBilling = {
                id: u.id,
                stripeCustomerId: u.stripeCustomerId || null,
                email: u.email || null,
              };
            }
          }
        }
      } catch (e) {
        console.error("Billing Debug: failed to load website/user", e);
      }
    }

    // ----- Pre-check and auto-upgrade behavior (mirror Shopify route) -----
    if (websiteForBilling) {
      if (websiteForBilling.plan === "Beta") {
        // Beta plan billing handled elsewhere; skip limit check here
      } else {
        const queryLimit = 100; // Starter plan limit (mirrors Shopify logic)
        if (
          websiteForBilling.monthlyQueries >= queryLimit &&
          websiteForBilling.plan !== "Enterprise"
        ) {
          if (websiteForBilling.stripeSubscriptionId) {
            try {
              const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
              const enterprisePriceId = process.env.STRIPE_ENTERPRISE_PRICE_ID;

              if (enterprisePriceId) {
                const subscription = await stripe.subscriptions.retrieve(
                  websiteForBilling.stripeSubscriptionId
                );
                const updated = await stripe.subscriptions.update(
                  websiteForBilling.stripeSubscriptionId,
                  {
                    items: [
                      {
                        id: subscription.items.data[0].id,
                        price: enterprisePriceId,
                      },
                    ],
                    proration_behavior: "none",
                  }
                );

                await connection.execute(
                  "UPDATE Website SET plan = 'Enterprise', stripeSubscriptionItemId = ? WHERE id = ?",
                  [updated.items.data[0].id, websiteForBilling.id]
                );

                // Update in-memory object
                websiteForBilling.plan = "Enterprise";
                websiteForBilling.stripeSubscriptionItemId =
                  updated.items.data[0].id;
              }
            } catch (error) {
              console.error(
                "Failed to auto-upgrade to Enterprise plan (text chat):",
                error
              );
              return NextResponse.json(
                {
                  error:
                    "You have reached your monthly query limit of 1000. Auto-upgrade to Enterprise plan failed.",
                },
                {
                  status: 429,
                  headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods":
                      "GET, POST, PUT, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers":
                      "Content-Type, Authorization",
                  },
                }
              );
            }
          } else {
            return NextResponse.json(
              {
                error:
                  "You have reached your monthly query limit of 1000. Please upgrade to Enterprise plan for unlimited queries.",
              },
              {
                status: 429,
                headers: {
                  "Access-Control-Allow-Origin": "*",
                  "Access-Control-Allow-Methods":
                    "GET, POST, PUT, DELETE, OPTIONS",
                  "Access-Control-Allow-Headers": "Content-Type, Authorization",
                },
              }
            );
          }
        }
      }
    }

    // Increment monthly queries for first message in conversation (per-thread style)
    if (shouldBillForStripe && websiteForBilling?.id) {
      try {
        await connection.execute(
          "UPDATE Website SET monthlyQueries = monthlyQueries + 1 WHERE id = ?",
          [websiteForBilling.id]
        );
      } catch (e) {
        console.error("Billing Debug: failed to increment monthlyQueries", e);
      }
    }

    // Fire-and-forget Stripe metering so it runs alongside the OpenAI call
    void (async () => {
      try {
        if (
          shouldBillForStripe &&
          websiteForBilling?.stripeSubscriptionId &&
          websiteForBilling?.stripeSubscriptionItemId
        ) {
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

          // Resolve stripeCustomerId: prefer user record, else fetch from subscription
          let stripeCustomerId = userForBilling?.stripeCustomerId || null;
          if (!stripeCustomerId && websiteForBilling.stripeSubscriptionId) {
            try {
              const subscription = await stripe.subscriptions.retrieve(
                websiteForBilling.stripeSubscriptionId
              );
              if (subscription?.customer) {
                stripeCustomerId =
                  typeof subscription.customer === "string"
                    ? subscription.customer
                    : subscription.customer.id;
              }
            } catch (e) {
              console.error(
                "Billing Debug: failed to retrieve subscription for customer id",
                e
              );
            }
          }

          if (stripeCustomerId) {
            try {
              const meterEvent = await stripe.billing.meterEvents.create({
                event_name: "api_requests",
                payload: {
                  stripe_customer_id: stripeCustomerId,
                  value: "1",
                },
                timestamp: Math.floor(Date.now() / 1000),
              });
              console.log(
                "Stripe: Successfully recorded meter event (text chat)",
                meterEvent
              );
            } catch (e) {
              console.error("Stripe: failed to record meter event", e);
            }

            // Persist found customer id if user didn't have it
            if (
              stripeCustomerId &&
              userForBilling?.id &&
              !userForBilling?.stripeCustomerId
            ) {
              try {
                await connection!.execute(
                  "UPDATE User SET stripeCustomerId = ? WHERE id = ?",
                  [stripeCustomerId, userForBilling.id]
                );
              } catch (e) {
                console.error(
                  "Billing Debug: failed to persist stripeCustomerId on user",
                  e
                );
              }
            }
          } else {
            console.log(
              "Stripe: No stripeCustomerId available for metering (text chat)"
            );
          }
        } else if (!shouldBillForStripe) {
          console.log(
            "Stripe: Not billing for follow-up message in this conversation"
          );
        } else {
          console.log(
            "Stripe: Not billing - missing subscription IDs or website context"
          );
        }
      } catch (e) {
        console.error("Stripe metering unexpected error (text chat)", e);
      }
    })();

    // ----- Build multimodal content parts for Responses API -----
    const contentParts: any[] = [];

    // 1) Page context + question as text
    const textPrompt =
      (pageContent ? `Page Context:\n${pageContent}\n\n` : "") +
      (userText?.trim().length
        ? `User: ${userText}`
        : "User sent an attachment with no message.");
    contentParts.push({ type: "input_text", text: textPrompt });

    // 2) Images — support multiple via array and single via attachedImage
    const normalizedImages: IncomingAttachment[] = [];
    if (Array.isArray(attachedImages) && attachedImages.length > 0) {
      normalizedImages.push(...attachedImages);
    }
    if (attachedImage) {
      normalizedImages.push(attachedImage);
    }
    for (const img of normalizedImages) {
      if (img?.fileId) {
        contentParts.push({
          type: "input_image",
          file_id: img.fileId,
          detail: "auto",
        });
        continue;
      }
      const imgDataUrl = parseDataUrl(img?.contentPreview || null);
      if (imgDataUrl && imgDataUrl.mime.startsWith("image/")) {
        if (approxBytesFromBase64(imgDataUrl.base64) > 10 * 1024 * 1024) {
          return NextResponse.json(
            {
              error:
                "Image too large. Please send a smaller image (<=10MB base64 payload).",
            },
            { status: 413 }
          );
        }
        contentParts.push({
          type: "input_image",
          image_url: imgDataUrl.dataUrl,
          detail: "auto",
        });
      }
    }

    // 3) PDF (base64 data URL) -> upload to Files API and attach for file_search
    let attachments: any[] | undefined = undefined;
    const fileDataUrl = parseDataUrl(attachedFile?.contentPreview || null);
    if (fileDataUrl && fileDataUrl.mime === "application/pdf") {
      if (approxBytesFromBase64(fileDataUrl.base64) > 20 * 1024 * 1024) {
        return NextResponse.json(
          {
            error:
              "PDF too large. Please send a smaller file (<=20MB base64 payload).",
          },
          { status: 413 }
        );
      }
      const filename =
        attachedFile?.name || `upload${attachedFile?.extension || ".pdf"}`;
      const buffer = Buffer.from(fileDataUrl.base64, "base64");
      const uploaded = await openai.files.create({
        file: await toFile(buffer, filename),
        purpose: "assistants",
      });
      attachments = [
        {
          file_id: uploaded.id,
          tools: [{ type: "file_search" }],
        },
      ];
      contentParts.push({
        type: "input_text",
        text: `Attached file: ${filename}.`,
      });
    }

    // 4) If user sent only an attachment, inject a direct task cue so the model describes/summarizes first
    const userGaveNoText = !userText || userText.trim().length === 0;
    if (userGaveNoText && normalizedImages.length > 0) {
      contentParts.unshift({
        type: "input_text",
        text: "TASK: Describe each attached image in detail. Include objects, any visible text (OCR), colors, layout, and context. Then provide a concise 1-sentence alt text for each image.",
      });
    }
    if (
      userGaveNoText &&
      fileDataUrl &&
      fileDataUrl.mime === "application/pdf"
    ) {
      contentParts.unshift({
        type: "input_text",
        text: "TASK: Summarize the attached PDF. Provide a brief overview, key points in bullets, any headings/sections detected, and a 1–2 sentence summary.",
      });
    }

    // If neither valid image nor pdf present & no text, bail
    if (contentParts.length === 1 && textPrompt.trim() === "") {
      return NextResponse.json(
        {
          error: "No valid attachment found (image/pdf) and no text provided.",
        },
        { status: 400 }
      );
    }

    // Chain to previous response if valid OpenAI id
    const previousResponseIdForOpenAI =
      typeof incomingResponseId === "string" &&
      incomingResponseId.startsWith("resp_")
        ? incomingResponseId
        : undefined;

    // ---- First, call the classifier to determine the intent, language, and actions ----
    const classifierCompletion = await openai.responses.create({
      model: "gpt-4.1-mini",
      instructions: [
        "You are a classifier AI tasked with analyzing customer queries.",
        "DO NOT answer the query directly. Instead, classify it according to the requested categories.",
        "Your response must be valid JSON with the following structure:",
        "{",
        '  "category": one of ["sales", "support", "discount"],',
        '  "language": the language detected in the user query (e.g., "english", "spanish"),',
        '  "action": one of ["get_order", "track_order", "return_order", "exchange_order", "add_to_cart", "none"],',
        '  "actionType": the specific data needed for the action (e.g., order_id, order_email, item_id, item_name) or null if action is "none",',
        '  "needsResearch": boolean indicating if the answer requires complex research (true) or is straightforward (false),',
        '  "researchContext": if needsResearch is true, provide specific context on what to research; otherwise null',
        "}",
        "Analyze the query thoroughly before making classifications.",
        "For actions, extract specific IDs, emails, or product names mentioned in the query.",
        "Only set an action if the user is clearly asking to perform that specific action.",
        "Only set needsResearch to true if answering requires information not directly available in the query or page content.",
      ].join(" "),
      input: [{ role: "user", content: contentParts }],
      max_output_tokens: 200,
    });

    // Parse the classifier result
    let classifierResult: any;
    try {
      const classifierText = (classifierCompletion as any).output_text || "{}";
      console.log("[CLASSIFIER] Raw output from OpenAI:", classifierText);

      // Ensure the result is valid JSON
      if (
        classifierText.startsWith("```json") &&
        classifierText.endsWith("```")
      ) {
        classifierResult = JSON.parse(classifierText.slice(7, -3).trim());
      } else {
        classifierResult = JSON.parse(classifierText);
      }

      console.log("[CLASSIFIER] Parsed result:", classifierResult);
    } catch (error) {
      console.error("Error parsing classifier result:", error);
      classifierResult = {
        category: "support",
        language: "english",
        action: "none",
        actionType: null,
        needsResearch: false,
        researchContext: null,
      };
    }

    // Determine if we need to generate a full response or a generic action response
    let outputText: string;
    let openaiResponseId = (classifierCompletion as any)?.id || null;
    let fullCompletion: any = null;
    let aiStartTime = 0; // For tracking AI completion time

    // Convert classifier result to QuestionClassification type for Pinecone search
    const pineconeClassification: QuestionClassification = {
      type: "general", // Default type
      category: classifierResult.category || "general",
      "sub-category": "general",
      interaction_type:
        classifierResult.category === "sales"
          ? "sales"
          : classifierResult.category === "support"
          ? "support"
          : "general",
      action_intent: mapActionToActionIntent(classifierResult.action),
    };

    console.log("[PINECONE] Using classification:", pineconeClassification);

    // Prepare for Pinecone search if research is needed
    let searchResults = [];
    let searchStartTime = 0; // For timing the entire search process
    if (classifierResult.needsResearch) {
      try {
        console.log("[PINECONE] Research needed, performing search");
        searchStartTime = Date.now();

        // Get website ID for Pinecone namespace
        const websiteId = await getWebsiteIdFromToken(authHeader);
        if (!websiteId) {
          throw new Error("Could not determine website ID from token");
        }

        // Get website details from DB
        const [websiteRows] = await connection.execute(
          "SELECT id, name FROM Website WHERE id = ? LIMIT 1",
          [websiteId]
        );
        const website = (websiteRows as any[])[0];

        if (!website) {
          throw new Error("Could not find website in database");
        }

        // Generate query vectors
        console.log("[TIMING] Starting vector generation");
        const vectorStartTime = Date.now();
        const { denseScaled: queryDense, sparseScaled: querySparse } =
          await buildHybridQueryVectors(question, {
            alpha: 0.6,
            featureSpace: 2_000_003,
          });
        const vectorEndTime = Date.now();
        console.log(
          `[TIMING] Vector generation took ${vectorEndTime - vectorStartTime}ms`
        );

        // Perform search
        console.log("[TIMING] Starting Pinecone search query");
        const searchQueryStartTime = Date.now();
        const timeMarks: Record<string, number> = {};
        searchResults = await performMainSearch(
          pinecone,
          website,
          question,
          queryDense,
          querySparse,
          pineconeClassification,
          false, // useAllNamespaces
          timeMarks
        );

        const searchQueryEndTime = Date.now();
        console.log(
          `[TIMING] Pinecone search query took ${
            searchQueryEndTime - searchQueryStartTime
          }ms`
        );

        console.log(
          `[PINECONE] Search returned ${searchResults.length} results`
        );

        // Log more detailed information about the search results
        if (searchResults.length > 0) {
          // Log the top 3 results with more details
          const topResults = searchResults.slice(0, 3);
          topResults.forEach((result, index) => {
            console.log(`[PINECONE] Result #${index + 1}:`);
            console.log(
              `  Score: ${result.score || 0}, RerankScore: ${
                result.rerankScore || "N/A"
              }`
            );
            console.log(
              `  ClassificationMatch: ${result.classificationMatch || "N/A"}`
            );
            console.log(`  Type: ${result.metadata?.type || "unknown"}`);
            console.log(
              `  Category: ${result.metadata?.category || "unknown"}`
            );

            // Log content preview based on content type
            if (result.metadata?.question) {
              console.log(`  Question: ${result.metadata.question}`);
              console.log(
                `  Answer preview: ${(result.metadata.answer || "").substring(
                  0,
                  100
                )}${result.metadata.answer?.length > 100 ? "..." : ""}`
              );
            } else if (result.metadata?.title) {
              console.log(`  Title: ${result.metadata.title}`);
              console.log(
                `  Content preview: ${(result.metadata.content || "").substring(
                  0,
                  100
                )}${result.metadata.content?.length > 100 ? "..." : ""}`
              );
            } else if (result.metadata?.handle) {
              console.log(`  Handle: ${result.metadata.handle}`);
            }

            console.log(""); // Empty line for separation
          });

          // Log the complete raw data of just the top result for debugging
          console.log("[PINECONE] Raw top result data:");
          console.log(JSON.stringify(searchResults[0], null, 2));
        }
      } catch (error) {
        console.error("[PINECONE] Search error:", error);
        // Continue execution even if search fails
      } finally {
        const searchEndTime = Date.now();
        console.log(
          `[TIMING] Total Pinecone search process took ${
            searchEndTime - searchStartTime
          }ms`
        );
      }
    }

    if (classifierResult.action !== "none") {
      // For action-based responses, generate a generic response based on the action
      let actionResponseText = "I'll help you with that ";
      console.log(
        "[ACTION] Generating action-based response for action:",
        classifierResult.action
      );

      switch (classifierResult.action) {
        case "get_order":
          actionResponseText += `order information${
            classifierResult.actionType
              ? ` for ${classifierResult.actionType}`
              : ""
          }.`;
          break;
        case "track_order":
          actionResponseText += `order tracking${
            classifierResult.actionType
              ? ` for ${classifierResult.actionType}`
              : ""
          }.`;
          break;
        case "return_order":
          actionResponseText += `return process${
            classifierResult.actionType
              ? ` for ${classifierResult.actionType}`
              : ""
          }.`;
          break;
        case "exchange_order":
          actionResponseText += `exchange process${
            classifierResult.actionType
              ? ` for ${classifierResult.actionType}`
              : ""
          }.`;
          break;
        case "add_to_cart":
          actionResponseText += `adding ${
            classifierResult.actionType || "that item"
          } to your cart.`;
          break;
        default:
          actionResponseText += "request right away.";
      }

      outputText = actionResponseText;
      console.log("[ACTION] Generated response:", outputText);
    } else {
      // For non-action responses or research needed, call the full completion API
      let aiStartTime = Date.now();
      console.log("[TIMING] Starting AI completion");

      // Add search results context to the content parts if available
      if (searchResults && searchResults.length > 0) {
        const processingStartTime = Date.now();
        // Extract relevant information from top search results (max 3)
        const topResults = searchResults.slice(0, 3);
        const searchContext = topResults
          .map((result, index) => {
            const metadata = result.metadata || {};
            // Format depends on the type of content
            if (metadata.question && metadata.answer) {
              return `[${index + 1}] Q: ${metadata.question}\nA: ${
                metadata.answer
              }`;
            } else if (metadata.title && metadata.content) {
              return `[${index + 1}] ${metadata.title}:\n${metadata.content}`;
            } else if (metadata.title) {
              return `[${index + 1}] ${metadata.title}`;
            } else {
              return `[${index + 1}] ${JSON.stringify(metadata)}`;
            }
          })
          .join("\n\n");

        // Add search results as context
        if (searchContext) {
          // Log the search context being added to the prompt
          console.log("[PINECONE] Adding search context to prompt:");
          console.log(searchContext);

          const processingEndTime = Date.now();
          console.log(
            `[TIMING] Results processing and formatting took ${
              processingEndTime - processingStartTime
            }ms`
          );

          contentParts.unshift({
            type: "input_text",
            text: `Search Results:\n${searchContext}\n\n`,
          });
        }
      }

      fullCompletion = await openai.responses.create({
        model: "gpt-4.1-mini",
        // instructions are optional; keeping your style from before
        instructions: [
          "You are a friendly, helpful AI assistant that helps users with their questions.",
          "Be warm, encouraging, and helpful — like a friendly guide.",
          "Always be conversational, direct, and approachable.",
          "Respond in English.",
          "Keep responses helpful and informative.",
          "When an image or file is attached, DO NOT ask follow-up questions first. Immediately describe (for images) or summarize (for files) before anything else.",
          "If the user did not ask a specific question, assume they want a description/summary of the attachment and provide it succinctly.",
          attachedImage
            ? "If an image is attached, first describe clearly what you see (objects, text, colors, layout), then answer the user's request using the image."
            : "",
          attachedFile
            ? "If a file is attached (e.g., a PDF), summarize the most relevant points for the user's request. If it's long, give a concise overview first, then key details."
            : "",
          pageContent
            ? "Use provided page context to give precise, relevant guidance."
            : "",
          "Format the response with concise markdown.",
        ]
          .filter(Boolean)
          .join(" "),
        // Responses API accepts `input` with a single user turn containing multimodal parts:
        input: [{ role: "user", content: contentParts }],
        ...(attachments ? { attachments } : {}),
        previous_response_id: previousResponseIdForOpenAI,
        max_output_tokens: 800,
      });
    }

    // Extract text from the full completion
    outputText =
      (fullCompletion as any)?.output_text ??
      (Array.isArray((fullCompletion as any)?.output)
        ? (fullCompletion as any).output
            .map((p: any) =>
              (p.content ?? []).map((c: any) => c.text?.value ?? "").join("")
            )
            .join("")
        : "");

    // Update response ID from the full completion
    openaiResponseId = (fullCompletion as any)?.id || openaiResponseId;

    if (fullCompletion && aiStartTime > 0) {
      const aiEndTime = Date.now();
      console.log(`[TIMING] AI completion took ${aiEndTime - aiStartTime}ms`);

      console.log(
        "[MAIN] Full completion generated. Response ID:",
        openaiResponseId
      );
      console.log(
        "[MAIN] Output text:",
        outputText.substring(0, 200) + (outputText.length > 200 ? "..." : "")
      );
    }

    // Store AI turn
    await connection.execute(
      "INSERT INTO TextChats (id, textConversationId, messageType, content, createdAt, responseId) VALUES (UUID(), ?, 'ai', ?, CURRENT_TIMESTAMP(3), ?)",
      [
        conversationIdToUse,
        outputText || "No response",
        openaiResponseId || null,
      ]
    );

    return NextResponse.json(
      {
        answer: outputText || "No response",
        responseId: openaiResponseId,
        sessionId: sessionIdToUse,
        conversationId: conversationIdToUse,
        classification: classifierResult,
        searchResults:
          searchResults && searchResults.length > 0
            ? searchResults.slice(0, 5).map((r) => {
                // Log what's being included in the response
                console.log(
                  `[PINECONE] Including in response: ${
                    r.metadata?.title || r.metadata?.question || r.id
                  }`
                );
                return {
                  score: r.rerankScore || r.score,
                  metadata: r.metadata,
                };
              })
            : [],
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      }
    );
  } catch (error) {
    console.error("Error in text chat route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      }
    );
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}
