import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import * as mysql from "mysql2/promise";
import {
  verifyToken,
  getWebsiteIdFromToken,
} from "../../../../lib/token-verifier";
import Stripe from "stripe";

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

    // ------- Stripe usage metering (parallel, same as other route) -------
    // Determine if this is the first user message in this conversation
    let shouldBillForStripe = false;
    try {
      const [cntRows] = await connection.execute(
        "SELECT COUNT(*) as cnt FROM VoiceChats WHERE voiceConversationId = ? AND messageType = 'user'",
        [conversationIdToUse]
      );
      const userMsgCount = (cntRows as any[])[0]?.cnt ?? 0;
      shouldBillForStripe = userMsgCount === 1;
    } catch (e) {
      console.error("Billing Debug: failed to count user messages (voice)", e);
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
      console.error("Billing Debug: failed to resolve websiteId (voice)", e);
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
        console.error("Billing Debug: failed to load website/user (voice)", e);
      }
    }

    // ----- Pre-check and auto-upgrade behavior (mirror Shopify route) -----
    if (websiteForBilling) {
      if (websiteForBilling.plan === "Beta") {
        // Beta plan billing handled elsewhere; skip limit check here
      } else {
        const queryLimit = 100; // Starter plan limit
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
                "Failed to auto-upgrade to Enterprise plan (beta chat):",
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

    // Increment monthly queries for first user message (per-thread style)
    if (shouldBillForStripe && websiteForBilling?.id) {
      try {
        await connection.execute(
          "UPDATE Website SET monthlyQueries = monthlyQueries + 1 WHERE id = ?",
          [websiteForBilling.id]
        );
      } catch (e) {
        console.error(
          "Billing Debug: failed to increment monthlyQueries (voice)",
          e
        );
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
                "Billing Debug: failed to retrieve subscription for customer id (voice)",
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
                "Stripe: Successfully recorded meter event (beta chat)",
                meterEvent
              );
            } catch (e) {
              console.error(
                "Stripe: failed to record meter event (beta chat)",
                e
              );
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
                  "Billing Debug: failed to persist stripeCustomerId on user (voice)",
                  e
                );
              }
            }
          } else {
            console.log(
              "Stripe: No stripeCustomerId available for metering (beta chat)"
            );
          }
        } else if (!shouldBillForStripe) {
          console.log(
            "Stripe: Not billing for follow-up message in this conversation (beta chat)"
          );
        } else {
          console.log(
            "Stripe: Not billing - missing subscription IDs or website context (beta chat)"
          );
        }
      } catch (e) {
        console.error("Stripe metering unexpected error (beta chat)", e);
      }
    })();

    const idIn =
      typeof incomingResponseId === "string" ? incomingResponseId : undefined;
    console.log("doing responses", { id: idIn || "new" });

    // Only forward a previous_response_id if it looks like an OpenAI Responses ID
    const previousResponseIdForOpenAI =
      typeof incomingResponseId === "string" &&
      incomingResponseId.startsWith("resp_")
        ? incomingResponseId
        : undefined;

    const completion = await openai.responses.create({
      model: "gpt-4.1-mini",
      instructions: [
        // ROLE & PURPOSE
        "You are a friendly, helpful AI assistant that navigates websites and finds information for users.",
        "Your sole job is to help users move around, locate content, and complete tasks on the site.",
        "Be warm, encouraging, and helpful — like a friendly tour guide.",
        "Always be conversational, direct, and approachable.",
        language ? `Respond in ${language}.` : "Respond in English.",

        // LENGTH LIMIT
        "All responses must be 30 words or fewer.",

        // ACTION OWNERSHIP (CRITICAL)
        "NEVER tell users to do anything themselves — you take all actions.",
        "You decide all actions and research — do not wait for instructions.",
        "If user asks to find/go/click/scroll/navigate, respond as if you will take them there.",
        "If user asks about pricing, plans, or content location, respond as if you will find it for them.",
        "ALWAYS consider page context to give relevant help.",

        // ACTION TYPE EXAMPLES
        "When user says 'go to ...' → actionType: 'navigate'",
        "When user says 'click the button' → actionType: 'click'",
        "When user says 'scroll down' → actionType: 'scroll'",
        "When user says 'fill out the form' → actionType: 'fill_form'",
        "When user says 'highlight that text' → actionType: 'highlight'",

        // DECISION LOGIC
        "Set either takeAction=true OR research=true, never both.",
        "takeAction=true, research=false → for navigation/click/scroll/fill_form/highlight requests.",
        "Use 'navigate' for page navigation (go to, navigate to, visit, etc.)",
        "Use 'click' only for clicking buttons/links on current page",
        "Use 'scroll' for scrolling up/down on current page",
        "Use 'fill_form' for form inputs",
        "Use 'highlight' for highlighting text/content",
        "research=true, takeAction=false → for information/content requests not answerable from current page.",
        "If answerable from current page → research=false.",
        "Only set research=true if info is NOT on current page.",
        "For research: respond with a short confirmation (5–10 words) that you're finding it.",
        "For navigation: briefly confirm what you're doing.",

        // JSON RESPONSE FORMAT
        "Respond in JSON with these fields:",
        "answer: your helpful response (≤30 words)",
        "takeAction: true/false",
        "research: true/false",
        "actionType: click, scroll, navigate, search, etc. or empty string",
        "researchContext: topic to find or empty string",

        // TTS RULES
        "Write for clear text-to-speech.",
        "Use short, simple sentences — max 10 words each.",
        "Avoid complex punctuation and abbreviations.",
        "Separate ideas into distinct sentences.",
        "If listing, use 'and' or separate into short sentences.",
        "Example: 'The Starter plan costs one dollar per query. It includes up to one hundred chat interactions. You get returns management and order management. Plus page navigation and tracking.'",

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
      previous_response_id: previousResponseIdForOpenAI,
    });

    const outputText =
      (completion as any).output_text ??
      (Array.isArray((completion as any).output)
        ? (completion as any).output
            .map((p: any) =>
              (p.content ?? []).map((c: any) => c.text?.value ?? "").join("")
            )
            .join("")
        : "");

    const openaiResponseId: string | undefined = (completion as any)?.id;
    console.log("done responses", {
      id: openaiResponseId || idIn || "unknown",
    });

    console.log("answer", outputText);

    // Parse AI's JSON response to extract the fields
    let takeAction = false;
    let research = false;
    let actionType = "";
    let researchContext = "";
    let aiAnswer = outputText;

    try {
      // Try to parse the AI's response as JSON
      const aiResponse = JSON.parse(outputText);

      // Extract the fields from AI's response
      aiAnswer = aiResponse.answer || outputText;
      takeAction = Boolean(aiResponse.takeAction) || false;
      research = Boolean(aiResponse.research) || false;
      actionType = aiResponse.actionType || "";
      researchContext = aiResponse.researchContext || "";

      // Ensure takeAction and research are mutually exclusive
      if (takeAction && research) {
        // If both are true, prioritize takeAction for navigation/action requests
        research = false;
        researchContext = "";
        console.log("Fixed: Both flags were true, prioritizing takeAction");
      }

      console.log("Successfully parsed AI JSON response");
    } catch (error) {
      // If parsing fails, use the original text as answer and default values
      console.log("AI response is not valid JSON, using defaults");
      aiAnswer = outputText;
      takeAction = false;
      research = false;
      actionType = "";
      researchContext = "";
    }

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
