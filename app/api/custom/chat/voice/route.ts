import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import * as mysql from "mysql2/promise";
import {
  verifyToken,
  getWebsiteIdFromToken,
} from "../../../../../lib/token-verifier";
import Stripe from "stripe";
import { Pinecone } from "@pinecone-database/pinecone";
import {
  performMainSearch,
  QuestionClassification,
} from "../../../../../lib/pinecone-search";
import { buildHybridQueryVectors } from "../../../../../lib/sparse/hybrid_query_tuning";

export const dynamic = "force-dynamic";

// Database connection
const dbConfig = {
  host: process.env.DATABASE_HOST!,
  user: process.env.DATABASE_USER!,
  password: process.env.DATABASE_PASSWORD!,
  database: process.env.DATABASE_NAME!,
  port: parseInt(process.env.DATABASE_PORT!) || 3306,
  charset: "utf8mb4",
};

/**
 * Beta Chat API Route
 *
 * This endpoint processes chat messages and returns structured JSON responses for a friendly website navigation AI assistant.
 * The AI helps users navigate websites, find information, and get things done with a warm, helpful personality.
 *
 * Expected JSON Response Format:
 * {
 *   answer: string,           // AI-generated friendly response (max 30 words)
 *   responseId: string,       // OpenAI response ID for conversation continuity
 *   takeAction: boolean,      // Whether user needs help navigating or finding something
 *   research: boolean,        // Whether user needs help locating information or content
 *   actionType: string,       // Type of navigation help needed (click, scroll, fill_form, etc.)
 *   researchContext: string   // What the user is trying to find or learn about
 *   conversationId: string    // ID of the conversation for other routes to use
 * }
 *
 * Navigation Help Detection:
 * - takeAction: triggered by keywords like "find", "click", "scroll", "navigate", "go to", "where is", etc.
 * - research: triggered by keywords like "explain", "what is", "more information", "details", "help me find", etc.
 *
 * Context Handling:
 * - Uses pageContent when available to provide helpful guidance about what's on the current page
 * - Automatically detects user intent from question keywords
 * - Provides encouraging, helpful responses for navigation assistance
 * - Gives warm guidance for finding information and content
 */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Pinecone client
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function POST(request: NextRequest) {
  let connection;
  try {
    const {
      question,
      message,
      responseId: incomingResponseId,
      language,
      pageContent,
      sessionId, // Session ID for session management
      conversationId, // Conversation ID - if empty string, create new one
    } = await request.json();

    // Verify the Bearer token
    const authHeader = request.headers.get("authorization");
    console.log("authHeader", authHeader);
    const isTokenValid = await verifyToken(authHeader);

    if (!isTokenValid) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid token" },
        { status: 401 }
      );
    }

    // keep logs minimal per preference
    console.log("doing chat request", {
      sessionId: sessionId || "new",
      conversationId: conversationId || "new",
    });

    const userText = question || message;

    if (!userText) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Connect to database
    connection = await mysql.createConnection(dbConfig);

    // Find or create Session
    let sessionIdToUse = sessionId;
    if (!sessionIdToUse || sessionIdToUse === "") {
      // Get the website ID from the verified token
      const websiteId = await getWebsiteIdFromToken(authHeader);

      if (!websiteId) {
        return NextResponse.json(
          { error: "Could not determine website ID from token" },
          { status: 400 }
        );
      }

      // Create new session with the website ID from the token
      const [sessionResult] = await connection.execute(
        "INSERT INTO Session (id, websiteId, textOpen) VALUES (UUID(), ?, ?)",
        [websiteId, false]
      );

      // Get the actual Session ID that was created
      const [newSessionResult] = await connection.execute(
        "SELECT id FROM Session WHERE websiteId = ? ORDER BY createdAt DESC LIMIT 1",
        [websiteId]
      );

      sessionIdToUse = (newSessionResult as any[])[0].id;
      console.log("created new session", { id: sessionIdToUse, websiteId });
    }

    // Handle conversationId - if empty string, create new conversation
    let conversationIdToUse = conversationId;
    if (conversationIdToUse === "" || !conversationIdToUse) {
      // Create new conversation
      const [newConversationResult] = await connection.execute(
        "INSERT INTO VoiceConversations (id, sessionId, createdAt, mostRecentConversationAt, firstConversationAt) VALUES (UUID(), ?, NOW(3), NOW(3), NOW(3))",
        [sessionIdToUse]
      );

      // Get the actual VoiceConversation ID that was created
      const [newConversationIdResult] = await connection.execute(
        "SELECT id FROM VoiceConversations WHERE sessionId = ? ORDER BY createdAt DESC LIMIT 1",
        [sessionIdToUse]
      );

      conversationIdToUse = (newConversationIdResult as any[])[0].id;
      console.log("created new conversation", { id: conversationIdToUse });
    } else {
      // Use existing conversation and update stats
      await connection.execute(
        "UPDATE VoiceConversations SET mostRecentConversationAt = NOW(3), totalMessages = totalMessages + 1 WHERE id = ?",
        [conversationIdToUse]
      );
    }

    // Store user message
    await connection.execute(
      "INSERT INTO VoiceChats (id, voiceConversationId, messageType, content, createdAt) VALUES (UUID(), ?, 'user', ?, NOW(3))",
      [conversationIdToUse, userText]
    );

    // ------- Simplified billing - just increment monthlyQueries -------
    // Comment out complex Stripe billing logic and just count queries
    // let shouldBillForStripe = false;
    // try {
    //   const [cntRows] = await connection.execute(
    //     "SELECT COUNT(*) as cnt FROM VoiceChats WHERE voiceConversationId = ? AND messageType = 'user'",
    //     [conversationIdToUse]
    //   );
    //   const userMsgCount = (cntRows as any[])[0]?.cnt ?? 0;
    //   shouldBillForStripe = userMsgCount === 1;
    // } catch (e) {
    //   console.error("Billing Debug: failed to count user messages (voice)", e);
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
      console.error("Billing Debug: failed to resolve websiteId (voice)", e);
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
    //     console.error("Billing Debug: failed to load website/user (voice)", e);
    //   }
    // }

    // Comment out complex Stripe billing and plan logic
    // ----- Pre-check and auto-upgrade behavior (mirror Shopify route) -----
    // if (websiteForBilling) {
    //   if (websiteForBilling.plan === "Beta") {
    //     // Beta plan billing handled elsewhere; skip limit check here
    //   } else {
    //     const queryLimit = 100; // Starter plan limit
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
    //             "Failed to auto-upgrade to Enterprise plan (beta chat):",
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
    // Increment monthly queries for first user message (per-thread style)
    // if (shouldBillForStripe && websiteForBilling?.id) {
    //   try {
    //     await connection.execute(
    //       "UPDATE Website SET monthlyQueries = monthlyQueries + 1 WHERE id = ?",
    //       [websiteForBilling.id]
    //     );
    //   } catch (e) {
    //     console.error(
    //       "Billing Debug: failed to increment monthlyQueries (voice)",
    //       e
    //     );
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
    //             "Billing Debug: failed to retrieve subscription for customer id (voice)",
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
    //             "Stripe: Successfully recorded meter event (beta chat)",
    //             meterEvent
    //           );
    //         } catch (e) {
    //           console.error(
    //             "Stripe: failed to record meter event (beta chat)",
    //             e
    //           );
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
    //               "Billing Debug: failed to persist stripeCustomerId on user (voice)",
    //               e
    //             );
    //           }
    //         }
    //       } else {
    //         console.log(
    //           "Stripe: No stripeCustomerId available for metering (beta chat)"
    //         );
    //       }
    //     } else if (!shouldBillForStripe) {
    //       console.log(
    //         "Stripe: Not billing for follow-up message in this conversation (beta chat)"
    //       );
    //     } else {
    //       console.log(
    //         "Stripe: Not billing - missing subscription IDs or website context (beta chat)"
    //       );
    //     }
    //   } catch (e) {
    //     console.error("Stripe metering unexpected error (beta chat)", e);
    //   }
    // })();

    const idIn =
      typeof incomingResponseId === "string" ? incomingResponseId : undefined;
    console.log("doing classifier", { id: idIn || "new" });

    // Only forward a previous_response_id if it looks like an OpenAI Responses ID
    const previousResponseIdForOpenAI =
      typeof incomingResponseId === "string" &&
      incomingResponseId.startsWith("resp_")
        ? incomingResponseId
        : undefined;

    const classifierCompletion = await openai.responses.create({
      model: "gpt-4.1-mini",
      instructions: [
        "You are a classifier AI tasked with analyzing user queries for a website navigation assistant.",
        "DO NOT answer the query directly. Instead, classify it according to the requested categories.",
        "Your response must be valid JSON with the following structure:",
        "{",
        '  "takeAction": boolean indicating if the user EXPLICITLY needs help with navigation or interaction on the website,',
        '  "research": boolean indicating if the user needs information NOT available on the current page,',
        '  "actionType": one of ["navigate", "click", "scroll", "fill_form", "highlight", ""] - empty string if takeAction is false,',
        '  "researchContext": specific context of what to research if research is true, otherwise empty string',
        '  "contentType": one of ["sales", "support", "discounts"] - classify what type of content the user is asking about',
        '  "language": the language detected in the user query (e.g., "english", "spanish")',
        "}",

        // DECISION RULES - BE EXTREMELY STRICT ABOUT THESE
        "Set research=true ONLY IF the information requested is NOT on the current page.",
        "Use the provided page content to determine whether the answer is already available.",
        "If the user asks for information (e.g., contact details, pricing specifics, hours, policies), and it is not explicitly present in page content, set research=true and set researchContext clearly (what to find).",

        "Set takeAction=true ONLY IF the user clearly asks for navigation or direct interaction (go to, click, scroll, fill form, highlight).",
        "If the user is asking for information or explanation, set takeAction=false (even if the question mentions a page or a button).",

        "NEVER set both takeAction=true AND research=true - they are mutually exclusive.",

        "Action Types - ONLY use when takeAction=true:",
        "- navigate: for explicit requests to go to another page",
        "- click: for explicit requests to click on something visible",
        "- scroll: for explicit requests to scroll up/down",
        "- fill_form: for explicit requests to fill out forms",
        "- highlight: for explicit requests to highlight content",

        "CRITICAL: DEFAULT TO BOTH takeAction=false AND research=false for most queries.",
        "If the information appears to be on the current page, DO NOT set research=true.",
        "If the user isn't explicitly asking for navigation or interaction, DO NOT set takeAction=true.",
        "Never rely on the main assistant to instruct the user to click or navigate; your job is only to set the correct flags for action vs research.",

        "Analyze the query carefully with page context before classifying.",
        "ALWAYS consider page context when deciding if research is needed.",
        "",
        "Content Type Classification:",
        '- "sales": Questions about services, pricing, features, information requests, recommendations',
        '- "support": Questions about troubleshooting, how-to guides, technical help, customer service',
        '- "discounts": ONLY if user specifically asks about promotions, deals, discounts, or special offers',
      ]
        .filter(Boolean)
        .join(" "),
      input: `${
        pageContent ? `Page Context: ${pageContent}\n\n` : ""
      }Question: ${userText}`,
      previous_response_id: previousResponseIdForOpenAI,
    });

    // Parse the classifier result
    let takeAction = false;
    let research = false;
    let actionType = "";
    let researchContext = "";
    let detectedLanguage = "english";
    let contentType = "sales"; // Default fallback

    try {
      const classifierText = (classifierCompletion as any).output_text || "{}";
      console.log("[CLASSIFIER] Raw output:", classifierText);

      // Parse the JSON response
      let classifierResult;
      if (
        classifierText.startsWith("```json") &&
        classifierText.endsWith("```")
      ) {
        classifierResult = JSON.parse(classifierText.slice(7, -3).trim());
      } else {
        classifierResult = JSON.parse(classifierText);
      }

      // Extract the classification
      takeAction = Boolean(classifierResult.takeAction) || false;
      research = Boolean(classifierResult.research) || false;
      actionType = classifierResult.actionType || "";
      researchContext = classifierResult.researchContext || "";
      detectedLanguage = classifierResult.language || "english";
      contentType = classifierResult.contentType || "sales";

      // Ensure takeAction and research are mutually exclusive
      if (takeAction && research) {
        // If both are true, we don't want either (being more conservative)
        takeAction = false;
        research = false;
        actionType = "";
        researchContext = "";
        console.log(
          "Fixed: Both flags were true, setting both to false for conservative approach"
        );
      }

      // Remove hard-coded action phrase validation; rely on classifier + page context

      // For research, make sure it's only when we're certain info isn't on page
      if (research && pageContent) {
        // If we have page content, be very conservative about research
        // Simple heuristic: if query terms appear in the page content, likely answerable from page
        const queryTerms = userText
          .toLowerCase()
          .split(/\s+/)
          .filter((term: string) => term.length > 3);

        // Count how many key query terms appear in the page content
        const pageContentLower = pageContent.toLowerCase();
        const matchingTerms = queryTerms.filter((term: string) =>
          pageContentLower.includes(term)
        );

        // If more than half of key terms are on page, assume research isn't needed
        // But do not undo research for contact-intent queries
        const lowerQ2 = (userText || "").toLowerCase();
        const isContactIntent =
          lowerQ2.includes("contact") ||
          lowerQ2.includes("support") ||
          lowerQ2.includes("reach you") ||
          lowerQ2.includes("reach out") ||
          lowerQ2.includes("email you") ||
          lowerQ2.includes("call you") ||
          lowerQ2.includes("customer service");

        if (
          !isContactIntent &&
          queryTerms.length > 0 &&
          matchingTerms.length > queryTerms.length / 2
        ) {
          research = false;
          researchContext = "";
          console.log(
            "Fixed: Key query terms found on page, setting research=false"
          );
        }
      }

      console.log("[CLASSIFIER] Parsed result:", {
        takeAction,
        research,
        actionType,
        researchContext,
        contentType,
        language: detectedLanguage,
      });
    } catch (error) {
      console.error("[CLASSIFIER] Error parsing classifier result:", error);
      // Default to no action/research on parse error
      takeAction = false;
      research = false;
      actionType = "";
      researchContext = "";
      detectedLanguage = "english";
      contentType = "sales";
    }

    // Get OpenAI response ID from the classifier completion
    let openaiResponseId = (classifierCompletion as any)?.id || null;

    // Variable to store our final answer
    let aiAnswer = "";

    // Perform vector search if research is needed
    let searchResults = [];
    if (research) {
      try {
        console.log("[PINECONE] Research needed, performing search");
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
          await buildHybridQueryVectors(userText, {
            alpha: 0.6,
            featureSpace: 2_000_003,
          });

        // Perform search
        searchResults = await performMainSearch(
          pinecone,
          website,
          userText,
          queryDense,
          querySparse,
          {
            type: contentType,
            category: contentType,
            "sub-category": contentType,
            interaction_type: contentType as "sales" | "support" | "discounts",
            action_intent: "none",
          } as QuestionClassification, // Use AI classifier results
          false, // useAllNamespaces - only search in namespace from classification
          {} // timeMarks
        );

        console.log(
          `[PINECONE] Search returned ${searchResults.length} results`
        );

        // Log top results for debugging
        if (searchResults.length > 0) {
          searchResults.slice(0, 3).forEach((result, index) => {
            console.log(`[PINECONE] Result #${index + 1}:`);
            if (result.metadata?.title) {
              console.log(`  Title: ${result.metadata.title}`);
            }
            if (result.metadata?.content) {
              console.log(
                `  Content preview: ${result.metadata.content.substring(
                  0,
                  100
                )}...`
              );
            }
          });
        }
      } catch (error) {
        console.error("[PINECONE] Search error:", error);
      }
    }

    // Either generate action-based response or call main completion
    let completion;

    if (takeAction) {
      // For takeAction=true, we can generate the response directly without a second AI call
      const actionResponseMap: Record<string, string> = {
        navigate: "I'll navigate to that for you.",
        click: "I'll click on that for you.",
        scroll: "I'll scroll to that section.",
        fill_form: "I'll help you fill out that form.",
        highlight: "I'll highlight that for you.",
      };

      aiAnswer =
        actionType && actionResponseMap[actionType]
          ? actionResponseMap[actionType]
          : "I'll help you with that right away.";
      console.log("[ACTION] Using direct action response:", aiAnswer);
    } else if (research && searchResults.length > 0) {
      // For research=true with search results, call the main completion
      console.log("[RESEARCH] Calling main completion with search results");

      // Extract search context from results to include in prompt
      const searchContext = searchResults
        .slice(0, 3)
        .map((result, index) => {
          const metadata = result.metadata || {};
          if (metadata.title && metadata.content) {
            return `[${index + 1}] ${metadata.title}:\n${metadata.content}`;
          } else if (metadata.content) {
            return `[${index + 1}] ${metadata.content}`;
          } else {
            return `[${index + 1}] ${JSON.stringify(metadata)}`;
          }
        })
        .join("\n\n");

      completion = await openai.responses.create({
        model: "gpt-4.1-mini",
        instructions: [
          // ROLE & PURPOSE
          "You are a friendly, helpful AI assistant that helps users with information and questions.",
          "Your job is to provide helpful answers based on the search results provided.",
          "Be warm, encouraging, and helpful — like a friendly guide.",
          "Always be conversational, direct, and approachable. It may not seem like it but they are TALKING TO YOU SO YOU CAN HEAR THEM, and should respond as if you are talking to them.",
          `Respond in ${detectedLanguage}.`,

          // LENGTH LIMIT
          "All responses must be 30 words or fewer.",

          // IMPORTANT: STRICTLY NO ACTION PROMISES
          "Do NOT say you will navigate, click, scroll, open, or fill forms.",
          "Do NOT tell the user to do anything. Present the information directly.",
          "If asked about navigation, say what you found instead of promising actions.",
          "Always use the search results provided to craft your response.",

          // TTS RULES
          "Write for clear text-to-speech.",
          "Use short, simple sentences — max 10 words each.",
          "Avoid complex punctuation and abbreviations.",
          "Separate ideas into distinct sentences.",
          "If listing, use 'and' or separate into short sentences.",
        ]
          .filter(Boolean)
          .join(" "),
        input: `Search Results:\n${searchContext}\n\nQuestion: ${userText}`,
        previous_response_id: openaiResponseId, // Chain from the classifier completion
      });

      // Extract the text from the completion
      aiAnswer =
        (completion as any).output_text ||
        (Array.isArray((completion as any).output)
          ? (completion as any).output
              .map((p: any) =>
                (p.content ?? []).map((c: any) => c.text?.value ?? "").join("")
              )
              .join("")
          : "I'll find that information for you.");

      // Update response ID
      openaiResponseId = (completion as any)?.id || openaiResponseId;
    } else {
      // For non-research, non-action queries, or if search failed, call the main completion
      console.log("[GENERAL] Calling main completion for regular response");

      completion = await openai.responses.create({
        model: "gpt-4.1-mini",
        instructions: [
          // ROLE & PURPOSE
          "You are a friendly, helpful AI assistant that helps users with information and questions.",
          "Your job is to provide helpful answers based on available context.",
          "Be warm, encouraging, and helpful — like a friendly guide.",
          "Always be conversational, direct, and approachable.",
          `Respond in ${detectedLanguage}.`,

          // LENGTH LIMIT
          "All responses must be 30 words or fewer.",

          // IMPORTANT: STRICTLY NO ACTION PROMISES
          "Do NOT say you will navigate, click, scroll, open, or fill forms.",
          "Do NOT tell the user to do anything. Present the information directly.",
          "If asked about navigation, say what you found instead of promising actions.",
          "ALWAYS consider page context to give relevant help.",

          // TTS RULES
          "Write for clear text-to-speech.",
          "Use short, simple sentences — max 10 words each.",
          "Avoid complex punctuation and abbreviations.",
          "Separate ideas into distinct sentences.",
          "If listing, use 'and' or separate into short sentences.",

          // PAGE CONTEXT
          pageContent
            ? "Use provided page context to give precise, relevant guidance."
            : "",
        ]
          .filter(Boolean)
          .join(" "),
        input: `${
          pageContent ? `Page Context: ${pageContent}\n\n` : ""
        }Question: ${userText}`,
        previous_response_id: openaiResponseId, // Chain from the classifier completion
      });

      // Extract the text from the completion
      aiAnswer =
        (completion as any).output_text ||
        (Array.isArray((completion as any).output)
          ? (completion as any).output
              .map((p: any) =>
                (p.content ?? []).map((c: any) => c.text?.value ?? "").join("")
              )
              .join("")
          : "I'll help you with that.");

      // Update response ID
      openaiResponseId = (completion as any)?.id || openaiResponseId;
    }

    console.log("done responses", {
      id: openaiResponseId || idIn || "unknown",
    });

    console.log("answer", aiAnswer);

    // Store AI response
    await connection.execute(
      "INSERT INTO VoiceChats (id, voiceConversationId, messageType, content, createdAt, responseId, action, actionType, research, researchContext, foundAnswer) VALUES (UUID(), ?, 'ai', ?, NOW(3), ?, ?, ?, ?, ?, ?)",
      [
        conversationIdToUse,
        aiAnswer,
        openaiResponseId || null,
        takeAction ? "true" : null,
        actionType || null,
        research ? "true" : null,
        researchContext || null,
        research ? 1 : 0,
      ]
    );

    console.log("takeAction", takeAction);
    console.log("research", research);
    console.log("actionType", actionType);
    console.log("researchContext", researchContext);

    return NextResponse.json(
      {
        answer: aiAnswer || "No response",
        responseId: openaiResponseId,
        takeAction: takeAction,
        research: research,
        actionType: takeAction ? actionType : "",
        researchContext: research ? researchContext : "",
        sessionId: sessionIdToUse,
        conversationId: conversationIdToUse,
        searchResults:
          research && searchResults && searchResults.length > 0
            ? searchResults.slice(0, 5).map((r) => ({
                score: r.score || r.rerankScore,
                metadata: r.metadata,
              }))
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
    console.error("Error in chat route:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        takeAction: false,
        research: false,
        researchContext: "",
      },
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
