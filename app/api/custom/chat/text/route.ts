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
    case "delete_from_cart":
      return "delete_from_cart";
    case "get_cart":
      return "get_cart";
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
      baseUrl, // Include the current page URL
    }: {
      question: string;
      responseId?: string;
      pageContent?: string | null;
      sessionId?: string | null;
      conversationId?: string | null;
      attachedImage?: IncomingAttachment | null;
      attachedFile?: IncomingAttachment | null;
      attachedImages?: IncomingAttachment[] | null;
      baseUrl?: string | null;
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

    console.log("INCOMING REQUEST IDs:", {
      sessionId,
      conversationId,
      responseId: incomingResponseId,
    });

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
    console.log("SESSION ID DECISION:", {
      receivedSessionId: sessionId,
      willCreateNew: !sessionIdToUse || sessionIdToUse === "",
    });

    if (!sessionIdToUse || sessionIdToUse === "") {
      const websiteId = await getWebsiteIdFromToken(authHeader);
      if (!websiteId) {
        return NextResponse.json(
          { error: "Could not determine website ID from token" },
          { status: 400 }
        );
      }
      console.log("CREATING NEW SESSION for website:", websiteId);

      await connection.execute(
        "INSERT INTO Session (id, websiteId, textOpen) VALUES (UUID(), ?, ?)",
        [websiteId, true]
      );
      const [newSessionResult] = await connection.execute(
        "SELECT id FROM Session WHERE websiteId = ? ORDER BY createdAt DESC LIMIT 1",
        [websiteId]
      );
      sessionIdToUse = (newSessionResult as any[])[0].id;
      console.log("CREATED NEW SESSION:", sessionIdToUse);
    } else {
      console.log("USING EXISTING SESSION:", sessionIdToUse);
    }

    // Conversation handling
    let conversationIdToUse = conversationId;
    console.log("CONVERSATION ID DECISION:", {
      receivedConversationId: conversationId,
      willCreateNew: !conversationIdToUse || conversationIdToUse === "",
      usingSessionId: sessionIdToUse,
    });

    if (!conversationIdToUse || conversationIdToUse === "") {
      console.log("CREATING NEW CONVERSATION for session:", sessionIdToUse);

      await connection.execute(
        "INSERT INTO TextConversations (id, sessionId, createdAt, mostRecentConversationAt, firstConversationAt) VALUES (UUID(), ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))",
        [sessionIdToUse]
      );
      const [newConversationIdResult] = await connection.execute(
        "SELECT id FROM TextConversations WHERE sessionId = ? ORDER BY createdAt DESC LIMIT 1",
        [sessionIdToUse]
      );
      conversationIdToUse = (newConversationIdResult as any[])[0].id;
      console.log("CREATED NEW CONVERSATION:", {
        newConversationId: conversationIdToUse,
        linkedToSessionId: sessionIdToUse,
      });
    } else {
      console.log("UPDATING EXISTING CONVERSATION:", conversationIdToUse);

      // Verify the session ID of this conversation
      const [convSessionRows] = await connection.execute(
        "SELECT sessionId FROM TextConversations WHERE id = ?",
        [conversationIdToUse]
      );

      if (convSessionRows && (convSessionRows as any[]).length > 0) {
        const actualSessionId = (convSessionRows as any[])[0].sessionId;
        console.log("CONVERSATION SESSION CHECK:", {
          conversationId: conversationIdToUse,
          storedSessionId: actualSessionId,
          receivedSessionId: sessionIdToUse,
          match: actualSessionId === sessionIdToUse,
        });
      }

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

    // ------- Simplified billing - just increment monthlyQueries -------
    // Comment out complex Stripe billing logic and just count queries
    // let shouldBillForStripe = false;
    // try {
    //   const [cntRows] = await connection.execute(
    //     "SELECT COUNT(*) as cnt FROM TextChats WHERE textConversationId = ? AND messageType = 'user'",
    //     [conversationIdToUse]
    //   );
    //   const userMsgCount = (cntRows as any[])[0]?.cnt ?? 0;
    //   shouldBillForStripe = userMsgCount === 1;
    // } catch (e) {
    //   console.error("Billing Debug: failed to count user messages", e);
    // }

    // Simplified billing - just get websiteId and increment monthlyQueries
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

    // Increment monthlyQueries for every user query
    if (websiteIdForBilling) {
      try {
        await connection.execute(
          "UPDATE Website SET monthlyQueries = monthlyQueries + 1 WHERE id = ?",
          [websiteIdForBilling]
        );
        console.log("Updated monthlyQueries for website:", websiteIdForBilling);
      } catch (e) {
        console.error("Failed to increment monthlyQueries", e);
      }
    }

    // Comment out all the complex Stripe billing logic
    // let websiteForBilling: {
    //   id: string;
    //   plan: string;
    //   monthlyQueries: number;
    //   stripeSubscriptionId: string | null;
    //   stripeSubscriptionItemId: string | null;
    //   userId: string | null;
    // } | null = null;
    // let userForBilling: {
    //   id: string;
    //   stripeCustomerId: string | null;
    //   email: string | null;
    // } | null = null;

    // if (websiteIdForBilling) {
    //   try {
    //     const [wRows] = await connection.execute(
    //       "SELECT id, plan, monthlyQueries, stripeSubscriptionId, stripeSubscriptionItemId, userId FROM Website WHERE id = ? LIMIT 1",
    //       [websiteIdForBilling]
    //     );
    //     const w = (wRows as any[])[0];
    //     if (w) {
    //       websiteForBilling = {
    //         id: w.id,
    //         plan: w.plan,
    //         monthlyQueries: w.monthlyQueries ?? 0,
    //         stripeSubscriptionId: w.stripeSubscriptionId || null,
    //         stripeSubscriptionItemId: w.stripeSubscriptionItemId || null,
    //         userId: w.userId || null,
    //       };

    //       if (websiteForBilling.userId) {
    //         const [uRows] = await connection.execute(
    //           "SELECT id, stripeCustomerId, email FROM User WHERE id = ? LIMIT 1",
    //           [websiteForBilling.userId]
    //         );
    //         const u = (uRows as any[])[0];
    //         if (u) {
    //           userForBilling = {
    //             id: u.id,
    //             stripeCustomerId: u.stripeCustomerId || null,
    //             email: u.email || null,
    //           };
    //         }
    //       }
    //     }
    //   } catch (e) {
    //     console.error("Billing Debug: failed to load website/user", e);
    //   }
    // }

    // Comment out complex Stripe billing and plan logic
    // ----- Pre-check and auto-upgrade behavior (mirror Shopify route) -----
    // if (websiteForBilling) {
    //   if (websiteForBilling.plan === "Beta") {
    //     // Beta plan billing handled elsewhere; skip limit check here
    //   } else {
    //     const queryLimit = 100; // Starter plan limit (mirrors Shopify logic)
    //     if (
    //       websiteForBilling.monthlyQueries >= queryLimit &&
    //       websiteForBilling.plan !== "Enterprise"
    //     ) {
    //       if (websiteForBilling.stripeSubscriptionId) {
    //         try {
    //           const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    //           const enterprisePriceId = process.env.STRIPE_ENTERPRISE_PRICE_ID;

    //           if (enterprisePriceId) {
    //             const subscription = await stripe.subscriptions.retrieve(
    //               websiteForBilling.stripeSubscriptionId
    //             );
    //             const updated = await stripe.subscriptions.update(
    //               websiteForBilling.stripeSubscriptionId,
    //               {
    //                 items: [
    //                   {
    //                     id: subscription.items.data[0].id,
    //                     price: enterprisePriceId,
    //                   },
    //                 ],
    //                 proration_behavior: "none",
    //               }
    //             );

    //             await connection.execute(
    //               "UPDATE Website SET plan = 'Enterprise', stripeSubscriptionItemId = ? WHERE id = ?",
    //               [updated.items.data[0].id, websiteForBilling.id]
    //             );

    //             // Update in-memory object
    //             websiteForBilling.plan = "Enterprise";
    //             websiteForBilling.stripeSubscriptionItemId =
    //               updated.items.data[0].id;
    //           }
    //         } catch (error) {
    //           console.error(
    //             "Failed to auto-upgrade to Enterprise plan (text chat):",
    //             error
    //           );
    //           return NextResponse.json(
    //             {
    //               error:
    //                 "You have reached your monthly query limit of 1000. Auto-upgrade to Enterprise plan failed.",
    //             },
    //             {
    //               status: 429,
    //               headers: {
    //                 "Access-Control-Allow-Origin": "*",
    //                 "Access-Control-Allow-Methods":
    //                   "GET, POST, PUT, DELETE, OPTIONS",
    //                 "Access-Control-Allow-Headers":
    //                   "Content-Type, Authorization",
    //               },
    //             }
    //           );
    //         }
    //       } else {
    //         return NextResponse.json(
    //           {
    //             error:
    //               "You have reached your monthly query limit of 1000. Please upgrade to Enterprise plan for unlimited queries.",
    //           },
    //           {
    //             status: 429,
    //             headers: {
    //               "Access-Control-Allow-Origin": "*",
    //               "Access-Control-Allow-Methods":
    //                 "GET, POST, PUT, DELETE, OPTIONS",
    //               "Access-Control-Allow-Headers": "Content-Type, Authorization",
    //             },
    //           }
    //         );
    //       }
    //     }
    //   }
    // }

    // Comment out the old monthly queries increment logic since we do it above now
    // Increment monthly queries for first message in conversation (per-thread style)
    // if (shouldBillForStripe && websiteForBilling?.id) {
    //   try {
    //     await connection.execute(
    //       "UPDATE Website SET monthlyQueries = monthlyQueries + 1 WHERE id = ?",
    //       [websiteForBilling.id]
    //     );
    //   } catch (e) {
    //     console.error("Billing Debug: failed to increment monthlyQueries", e);
    //   }
    // }

    // Comment out all Stripe metering logic
    // Fire-and-forget Stripe metering so it runs alongside the OpenAI call
    // void (async () => {
    //   try {
    //     if (
    //       shouldBillForStripe &&
    //       websiteForBilling?.stripeSubscriptionId &&
    //       websiteForBilling?.stripeSubscriptionItemId
    //     ) {
    //       const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    //       // Resolve stripeCustomerId: prefer user record, else fetch from subscription
    //       let stripeCustomerId = userForBilling?.stripeCustomerId || null;
    //       if (!stripeCustomerId && websiteForBilling.stripeSubscriptionId) {
    //         try {
    //           const subscription = await stripe.subscriptions.retrieve(
    //             websiteForBilling.stripeSubscriptionId
    //           );
    //           if (subscription?.customer) {
    //             stripeCustomerId =
    //               typeof subscription.customer === "string"
    //                 ? subscription.customer
    //                 : subscription.customer.id;
    //           }
    //         } catch (e) {
    //           console.error(
    //             "Billing Debug: failed to retrieve subscription for customer id",
    //             e
    //           );
    //         }
    //       }

    //       if (stripeCustomerId) {
    //         try {
    //           const meterEvent = await stripe.billing.meterEvents.create({
    //             event_name: "api_requests",
    //             payload: {
    //               stripe_customer_id: stripeCustomerId,
    //               value: "1",
    //             },
    //             timestamp: Math.floor(Date.now() / 1000),
    //           });
    //           console.log(
    //             "Stripe: Successfully recorded meter event (text chat)",
    //             meterEvent
    //           );
    //         } catch (e) {
    //           console.error("Stripe: failed to record meter event", e);
    //         }

    //         // Persist found customer id if user didn't have it
    //         if (
    //           stripeCustomerId &&
    //           userForBilling?.id &&
    //           !userForBilling?.stripeCustomerId
    //         ) {
    //           try {
    //             await connection!.execute(
    //               "UPDATE User SET stripeCustomerId = ? WHERE id = ?",
    //               [stripeCustomerId, userForBilling.id]
    //             );
    //           } catch (e) {
    //             console.error(
    //               "Billing Debug: failed to persist stripeCustomerId on user",
    //               e
    //             );
    //           }
    //         }
    //       } else {
    //         console.log(
    //           "Stripe: No stripeCustomerId available for metering (text chat)"
    //         );
    //       }
    //     } else if (!shouldBillForStripe) {
    //       console.log(
    //         "Stripe: Not billing for follow-up message in this conversation"
    //       );
    //     } else {
    //       console.log(
    //         "Stripe: Not billing - missing subscription IDs or website context"
    //       );
    //     }
    //   } catch (e) {
    //     console.error("Stripe metering unexpected error (text chat)", e);
    //   }
    // })();

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
    // Get previous context if there's a valid responseId
    let previousContext = null;

    // If we have a previous responseId, we should maintain context
    // This is crucial for follow-up messages in the same conversation
    if (previousResponseIdForOpenAI) {
      console.log(
        "[CONTEXT] Using previous response ID for context:",
        previousResponseIdForOpenAI
      );

      // Look up the previous action from the database to maintain context
      try {
        const [prevRows] = await connection.execute(
          "SELECT content FROM TextChats WHERE responseId = ? AND messageType = 'ai' LIMIT 1",
          [incomingResponseId]
        );

        if (prevRows && (prevRows as any[]).length > 0) {
          const prevContent = (prevRows as any[])[0].content;
          console.log(
            "[CONTEXT] Found previous AI response:",
            prevContent.substring(0, 100) +
              (prevContent.length > 100 ? "..." : "")
          );

          // If the previous response was about a return, maintain that context
          if (prevContent.includes("return process")) {
            previousContext = "return_order";
            console.log("[CONTEXT] Maintaining previous context: return_order");
          }
        }
      } catch (err) {
        console.error("[CONTEXT] Error fetching previous context:", err);
      }
    }

    const classifierCompletion = await openai.responses.create({
      model: "gpt-4.1-mini",
      instructions: [
        "You are a classifier AI tasked with analyzing customer queries.",
        "DO NOT answer the query directly. Instead, classify it according to the requested categories.",
        "Your response must be valid JSON with the following structure:",
        "{",
        '  "category": one of ["sales", "support", "discount"],',
        '  "language": the language detected in the user query (e.g., "english", "spanish"),',
        '  "action": one of ["get_order", "track_order", "return_order", "cancel_order", "exchange_order", "get_cart", "add_to_cart", "delete_from_cart", "none"],',
        '  "actionType": the specific data needed for the action (e.g., order_id, order_email, item_id, item_name) or null if action is "none"',
        "}",
        "Analyze the query thoroughly before making classifications.",
        "For actions, extract specific IDs, emails, or product names mentioned in the query.",
        "Only set an action if the user is clearly asking to perform that specific action.",
        // Add context maintenance instructions
        previousContext
          ? `IMPORTANT: This is a follow-up to a previous "${previousContext}" conversation. If the user is providing additional information for the same action, maintain the action context.`
          : "",
        previousResponseIdForOpenAI
          ? "This is a follow-up message in an ongoing conversation. Consider the context of previous messages."
          : "",
      ].join(" "),
      input: [{ role: "user", content: contentParts }],
      max_output_tokens: 200,
      previous_response_id: previousResponseIdForOpenAI,
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

      // Override the classifier result if we have a previous context
      if (previousContext === "return_order") {
        if (
          classifierResult.action === "get_order" &&
          classifierResult.actionType
        ) {
          console.log(
            "[CLASSIFIER] Overriding action from get_order to return_order based on previous context"
          );
          // Keep the actionType from get_order but change the action to return_order
          classifierResult.action = "return_order";
        }

        // Fix string-based order_id in actionType
        if (
          classifierResult.action === "return_order" &&
          classifierResult.actionType === "order_id"
        ) {
          // Extract order ID and email from the message if available
          const orderIdMatch = userText.match(/order(?:\s+number)?\s+(\d+)/i);
          const emailMatch = userText.match(
            /email\s+(?:is|:)?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i
          );

          const orderInfo: any = {};
          if (orderIdMatch && orderIdMatch[1]) {
            orderInfo.order_id = orderIdMatch[1];
          }
          if (emailMatch && emailMatch[1]) {
            orderInfo.order_email = emailMatch[1];
          }

          if (Object.keys(orderInfo).length > 0) {
            console.log(
              "[CLASSIFIER] Extracted order details from text:",
              orderInfo
            );
            classifierResult.actionType = orderInfo;
          }
        }
      }

      console.log("[CLASSIFIER] Parsed result:", classifierResult);
    } catch (error) {
      console.error("Error parsing classifier result:", error);
      classifierResult = {
        category: "support",
        language: "english",
        action: previousContext || "none", // Use previous context if available
        actionType: null,
      };
    }

    // Determine if we need to generate a full response or a generic action response
    let outputText = ""; // Initialize with empty string
    let openaiResponseId = (classifierCompletion as any)?.id || null;
    console.log("RESPONSE ID SETUP:", {
      incomingResponseId,
      initialOpenAIResponseId: openaiResponseId,
    });
    let fullCompletion: any = null;

    // Convert classifier result to QuestionClassification type for Pinecone search
    const pineconeClassification: QuestionClassification = {
      type: classifierResult.category || "sales", // Use AI classifier category
      category: classifierResult.category || "sales",
      "sub-category": classifierResult.category || "sales",
      interaction_type:
        classifierResult.category === "sales"
          ? "sales"
          : classifierResult.category === "support"
          ? "support"
          : "sales",
      action_intent: mapActionToActionIntent(classifierResult.action),
    };

    console.log("[PINECONE] Using classification:", pineconeClassification);

    // Always perform Pinecone search
    let searchResults = [];
    try {
      console.log("[PINECONE] Performing search");
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
      const { denseScaled: queryDense, sparseScaled: querySparse } =
        await buildHybridQueryVectors(question, {
          alpha: 0.6,
          featureSpace: 2_000_003,
        });

      // Perform search
      const timeMarks: Record<string, number> = {};
      const useAllNamespaces = false;
      searchResults = await performMainSearch(
        pinecone,
        website,
        question,
        queryDense,
        querySparse,
        pineconeClassification,
        useAllNamespaces,
        timeMarks
      );

      console.log(`[PINECONE] Search returned ${searchResults.length} results`);
    } catch (error) {
      console.error("[PINECONE] Search error:", error);
      // Continue execution even if search fails
    }

    if (classifierResult.action !== "none") {
      // For now, respond that actions cannot be performed
      console.log(
        "[ACTION] Action detected but not supported:",
        classifierResult.action
      );

      outputText =
        "I'm sorry, but I cannot perform actions like orders, cart management, or other transactions right now. However, I'm here to help answer questions about the website content, pages, and provide information. Is there something specific about the website I can help you with instead?";

      console.log(
        "[ACTION] Skipping action processing, returning generic message for:",
        classifierResult.action
      );

      // Skip all the specific action processing since we're not supporting actions
      // Just return the generic "cannot perform actions" message
    }
    if (classifierResult.action === "none") {
      // Add search results context to the content parts if available
      if (searchResults && searchResults.length > 0) {
        // Extract relevant information from top search results (max 3)
        const topResults = searchResults.slice(0, 3);

        // Log search results details for debugging
        console.log("[PINECONE] Top 3 search results being sent to AI:");
        topResults.forEach((result, index) => {
          const metadata = result.metadata || {};
          const handle = metadata.handle || "no-handle";
          const name = metadata.title || metadata.question || "no-name";
          const body = metadata.content || metadata.answer || "no-body";
          const contentType = metadata.contentType || "unknown";
          const firstBit =
            body.substring(0, 100) + (body.length > 100 ? "..." : "");

          console.log(`[${index + 1}] Handle: ${handle}`);
          console.log(`[${index + 1}] Name: ${name}`);
          console.log(`[${index + 1}] Content Type: ${contentType}`);
          console.log(`[${index + 1}] First 100 chars: ${firstBit}`);
          console.log(`[${index + 1}] ---`);
        });
        const searchContext = topResults
          .map((result, index) => {
            const metadata = result.metadata || {};
            // Extract url if available
            let urlValue =
              metadata.url || metadata.handle || metadata.path || "";
            let imageUrlValue =
              metadata.image_url || metadata.imageUrl || metadata.image || "";

            // Format depends on the type of content
            let resultText = "";
            if (metadata.question && metadata.answer) {
              resultText = `[${index + 1}] Q: ${metadata.question}\nA: ${
                metadata.answer
              }`;
            } else if (metadata.title && metadata.content) {
              resultText = `[${index + 1}] ${metadata.title}:\n${
                metadata.content
              }`;
            } else if (metadata.title) {
              resultText = `[${index + 1}] ${metadata.title}`;
            } else {
              resultText = `[${index + 1}] ${JSON.stringify(metadata)}`;
            }

            // For custom pages, use the URL directly from the database
            if (urlValue) {
              // If it's a relative URL and we have a baseUrl, make it absolute
              if (!urlValue.startsWith("http") && baseUrl) {
                if (urlValue.startsWith("/")) {
                  urlValue = `${baseUrl}${urlValue}`;
                } else {
                  urlValue = `${baseUrl}/${urlValue}`;
                }
              }
            }

            if (imageUrlValue && !imageUrlValue.startsWith("http") && baseUrl) {
              // If imageUrl starts with /, just append it to baseUrl
              if (imageUrlValue.startsWith("/")) {
                imageUrlValue = `${baseUrl}${imageUrlValue}`;
              } else {
                imageUrlValue = `${baseUrl}/${imageUrlValue}`;
              }
            }

            // Add URL and image information if available
            if (urlValue) {
              resultText += `\nURL: ${urlValue}`;
            }
            if (imageUrlValue) {
              resultText += `\nImage: ${imageUrlValue}`;
            }

            return resultText;
          })
          .join("\n\n");

        // Add search results as context
        if (searchContext) {
          // Log the search context being added to the prompt
          console.log("[PINECONE] Adding search context to prompt:");
          console.log(searchContext);

          contentParts.unshift({
            type: "input_text",
            text: `Search Results:\n${searchContext}\n\nIMPORTANT: If you see any URLs or Image links in the search results above, include them in your response using proper markdown formatting: [link text](URL) for links and ![alt text](image_url) for images.\n\n`,
          });
        }
      }

      // Get previous context for better continuity
      let previousUserEmail = null;
      let previousOrderId = null;

      // Extract email and order ID from previous messages
      try {
        // Check if we have an email in the current message
        const emailMatch = userText.match(
          /email\s+(?:is|:)?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i
        );
        if (emailMatch && emailMatch[1]) {
          previousUserEmail = emailMatch[1];
          console.log(
            "[CONTEXT] Found email in current message:",
            previousUserEmail
          );
        }

        // Check if we have an order ID in the current message
        const orderIdMatch = userText.match(/order(?:\s+number)?\s+(\d+)/i);
        if (orderIdMatch && orderIdMatch[1]) {
          previousOrderId = orderIdMatch[1];
          console.log(
            "[CONTEXT] Found order ID in current message:",
            previousOrderId
          );
        }

        // If we don't have both, check previous messages
        if (
          (!previousUserEmail || !previousOrderId) &&
          previousResponseIdForOpenAI
        ) {
          const [prevMessages] = await connection.execute(
            "SELECT content FROM TextChats WHERE textConversationId = ? AND messageType = 'user' ORDER BY createdAt DESC LIMIT 5",
            [conversationIdToUse]
          );

          if (prevMessages && (prevMessages as any[]).length > 0) {
            for (const msg of prevMessages as any[]) {
              const content = msg.content || "";

              // Extract email if we don't have it yet
              if (!previousUserEmail) {
                const emailMatch = content.match(
                  /email\s+(?:is|:)?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i
                );
                if (emailMatch && emailMatch[1]) {
                  previousUserEmail = emailMatch[1];
                  console.log(
                    "[CONTEXT] Found email in previous message:",
                    previousUserEmail
                  );
                  break;
                }
              }

              // Extract order ID if we don't have it yet
              if (!previousOrderId) {
                const orderIdMatch = content.match(
                  /order(?:\s+number)?\s+(\d+)/i
                );
                if (orderIdMatch && orderIdMatch[1]) {
                  previousOrderId = orderIdMatch[1];
                  console.log(
                    "[CONTEXT] Found order ID in previous message:",
                    previousOrderId
                  );
                  break;
                }
              }
            }
          }
        }
      } catch (err) {
        console.error(
          "[CONTEXT] Error extracting context from previous messages:",
          err
        );
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
          "IMPORTANT: You are here to help users navigate and understand the website content. Answer questions about pages, articles, and site information.",
          "IMPORTANT: When users ask about website features or content, provide helpful guidance based on the available information.",
          previousUserEmail ? `User's email is ${previousUserEmail}.` : "",
          previousOrderId ? `User's order number is ${previousOrderId}.` : "",
          attachedImage
            ? "If an image is attached, first describe clearly what you see (objects, text, colors, layout), then answer the user's request using the image."
            : "",
          attachedFile
            ? "If a file is attached (e.g., a PDF), summarize the most relevant points for the user's request. If it's long, give a concise overview first, then key details."
            : "",
          pageContent
            ? "Use provided page context to give precise, relevant guidance."
            : "",
          baseUrl
            ? `EXTREMELY IMPORTANT: All URLs and links in your response MUST be relative to the user's site: ${baseUrl}. Do NOT link to external sites unless absolutely necessary.`
            : "",
          "Format the response using proper markdown formatting.",
          "ALWAYS include relevant links in your response using proper markdown formatting like [link text](URL).",
          "When referring to products, pages, or resources that might have URLs, include them as markdown links.",
          baseUrl
            ? `IMPORTANT: Always follow these URL format conventions:
            - For pages: ${baseUrl}/pages/[page-name]
            - For blog articles: ${baseUrl}/blog/[category]/[post-name]
            - For policy pages: ${baseUrl}/policies/[policy-name]
            - For other content: ${baseUrl}/[path-name]`
            : "IMPORTANT: Always follow these URL format conventions for websites:\\n- For pages: /pages/[page-name]\\n- For blog articles: /blog/[category]/[post-name]\\n- For policy pages: /policies/[policy-name]\\n- For other content: /[path-name]",
          "If images are available, include them in markdown format using ![alt text](image_url).",
          "When referencing search results, use their URLs and include them as markdown links.",
          "NEVER refer users to external websites - keep them on the original site.",
          "NEVER mention 'other sites' or suggest leaving the current website - all helpful resources should be on THIS website.",
          "EXTREMELY IMPORTANT: Your response MUST directly answer the user's specific question. DO NOT provide generic information unless explicitly asked.",
          "NEVER make up information - only use what's provided in the context, search results, or what the user has told you.",
          "CRITICAL: When formatting website links, ALWAYS use appropriate prefixes for URLs based on content type:",
          "  - Use /pages/ for informational pages",
          "  - Use /blog/ for blog articles",
          "  - Use /policies/ for policy pages",
          "  - Use the root path (/) for other content types",
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

    // Only extract text from the full completion if we don't already have an action-based response
    // outputText might be set already if we have an action-based response
    if (outputText === undefined || outputText === null || outputText === "") {
      outputText =
        (fullCompletion as any)?.output_text ??
        (Array.isArray((fullCompletion as any)?.output)
          ? (fullCompletion as any).output
              .map((p: any) =>
                (p.content ?? []).map((c: any) => c.text?.value ?? "").join("")
              )
              .join("")
          : "");
    }

    // Update response ID from the full completion
    openaiResponseId = (fullCompletion as any)?.id || openaiResponseId;
    console.log("FINAL RESPONSE ID STATUS:", {
      incomingResponseId,
      finalOpenAIResponseId: openaiResponseId,
      usedExistingResponseId:
        incomingResponseId !== null && incomingResponseId !== undefined,
    });

    if (fullCompletion) {
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
      "INSERT INTO TextChats (id, textConversationId, messageType, content, createdAt, responseId, action, actionType) VALUES (UUID(), ?, 'ai', ?, CURRENT_TIMESTAMP(3), ?, ?, ?)",
      [
        conversationIdToUse,
        outputText || "No response",
        openaiResponseId || null,
        classifierResult.action || null,
        classifierResult.actionType || null,
      ]
    );

    // Make sure we're using the action-based response if it was generated
    // This ensures the response from line 790 is actually used
    const finalResponse = outputText || "No response";

    // Log the final response being sent to the client
    console.log(
      "[FINAL] Sending response to client:",
      finalResponse.substring(0, 100)
    );

    console.log("SENDING FINAL RESPONSE WITH IDs:", {
      responseId: openaiResponseId,
      sessionId: sessionIdToUse,
      conversationId: conversationIdToUse,
    });

    return NextResponse.json(
      {
        answer: finalResponse,
        responseId: openaiResponseId,
        sessionId: sessionIdToUse,
        conversationId: conversationIdToUse,
        classification: classifierResult,
        action: classifierResult.action || null,
        actionType: classifierResult.actionType || null,
        searchResults:
          searchResults && searchResults.length > 0
            ? searchResults.slice(0, 5).map((r) => {
                // Log what's being included in the response
                console.log(
                  `[PINECONE] Including in response: ${
                    r.metadata?.title ||
                    r.metadata?.question ||
                    r.id ||
                    "unknown"
                  }`
                );
                return {
                  score: r.rerankScore || r.score || 0,
                  metadata: r.metadata || {},
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
