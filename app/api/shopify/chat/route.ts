import { NextRequest, NextResponse } from "next/server";
import { AiThread, AiMessage } from "@prisma/client";
import { Pinecone } from "@pinecone-database/pinecone";
import {
  buildHybridQueryVectors,
  shouldFallbackToCollections,
} from "../../../../lib/sparse/hybrid_query_tuning";
// Removed OpenSearch; using deterministic sparse generator for documents only
import { generateSparseVectorsStable } from "../../../../lib/sparse/stable";
import { cors } from "../../../../lib/cors";
import OpenAI from "openai";
import {
  FINAL_MAIN_PROMPT,
  MAIN_PROMPT,
  SHOPIFY_SALES_PROMPT,
  SHOPIFY_SUPPORT_PROMPT,
  SHOPIFY_GENERAL_PROMPT,
  PAGE_BLOG_PROMPT,
  PRODUCT_COLLECTION_PROMPT,
  DISCOUNT_PROMPT,
  LOGIN_LOGOUT_PROMPT,
  ACCOUNT_EDITING_PROMPT,
  ORDER_MANAGEMENT_PROMPT,
  FORM_FILLING_OUT_PROMPT,
  BUTTON_CLICK_PROMPT,
  SCROLL_AND_HIGHLIGHT_PROMPT,
  GENERATE_IMAGE_PROMPT,
  PURCHASE_PROMPT,
  RETURN_ORDERS_PROMPT,
} from "../../../../lib/systemPrompts";
import {
  normalizeReturnReason,
  coerceReturnReasonNote,
  ALLOWED_RETURN_REASONS,
} from "../../../../lib/returns";
import Stripe from "stripe";
import { query } from "../../../../lib/db";
export const dynamic = "force-dynamic";

// Use the imported prisma client instead of creating a new one
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});
const openai = new OpenAI();

// OpenSearch removed

// Hybrid scaling is handled within buildHybridQueryVectors for query path

// Helper function to check if this is the first user message in thread (for per-thread billing)
async function isFirstUserMessageInThread(threadId: string): Promise<boolean> {
  console.log(
    `🔍 isFirstUserMessageInThread - Checking messages for thread ID: ${threadId}`
  );

  const countRows = (await query(
    `SELECT COUNT(*) as cnt FROM AiMessage WHERE threadId = ? AND role = 'user'`,
    [threadId]
  )) as { cnt: number }[];
  const existingUserMessages = countRows[0]?.cnt ?? 0;

  console.log(
    `🔍 isFirstUserMessageInThread - Found ${existingUserMessages} existing user messages`
  );
  return existingUserMessages === 0;
}

// Add type for thread with messages
type ThreadWithMessages = AiThread & {
  messages: AiMessage[];
};

// Add type for formatted response
type FormattedResponse = {
  action:
    | "redirect"
    | "scroll"
    | "click"
    | "fill_form"
    | "purchase"
    | "track_order"
    | "get_orders"
    | "return_order"
    | "cancel_order"
    | "exchange_order"
    | "login"
    | "logout"
    | "account_reset"
    | "account_management"
    | "scheduler"
    | "highlight_text"
    | "generate_image"
    | "contact"
    | "none";
  answer: string;
  category: "discovery" | "pricing" | "navigation" | "product_info";
  pageId: string;
  pageTitle: string;
  question: string;
  scrollText: string;
  subcategory:
    | "content_overview"
    | "price_details"
    | "location"
    | "product_details";
  type: "text" | "voice";
  url: string;
  action_context?: Record<string, any>;
};

// Add type for website with auto-allow settings
type WebsiteWithAutoSettings = {
  id: string;
  url: string;
  plan: string;
  monthlyQueries: number;
  queryLimit?: number;
  customInstructions: string | null;
  allowAutoCancel: boolean;
  allowAutoReturn: boolean;
  allowAutoExchange: boolean;
  allowAutoClick: boolean;
  allowAutoScroll: boolean;
  allowAutoHighlight: boolean;
  allowAutoRedirect: boolean;
  allowAutoGetUserOrders: boolean;
  allowAutoUpdateUserInfo: boolean;
  allowAutoFillForm: boolean;
  allowAutoTrackOrder: boolean;
  allowAutoLogout: boolean;
  allowAutoLogin: boolean;
  allowAutoGenerateImage: boolean;
  newAiSynced?: boolean;
  stripeSubscriptionId?: string | null;
  stripeSubscriptionItemId?: string | null;
  userId?: string;
};

// Add type for question classification
type QuestionClassification = {
  type: string;
  category: string;
  "sub-category": string;
  page?: string;
  context_dependency?: "high" | "low";
  interaction_type?: "sales" | "support" | "discounts" | "noneSpecified";
  action_intent?:
    | string
    | "redirect"
    | "click"
    | "scroll"
    | "fill_form"
    | "purchase"
    | "track_order"
    | "get_orders"
    | "return_order"
    | "cancel_order"
    | "exchange_order"
    | "login"
    | "logout"
    | "highlight_text"
    | "generate_image"
    | "account_reset"
    | "account_management"
    | "scheduler"
    | "none";
  content_targets?: {
    button_id?: string;
    button_text?: string;
    link_text?: string;
    url?: string;
    form_id?: string;
    process_return?: string;
    getOrders?: boolean;
    input_fields?: Array<{ name: string; value: string }>;
    dropdown_name?: string;
    dropdown_value?: string;
    images?: string[];
    section_id?: string;
    css_selector?: string;
    exact_text?: string;
    product_name?: string;
    product_id?: string;
    account_field?: string;
    change_type?: string;
    order_id?: string;
    order_email?: string;
  };
};

// Add type for previous context structure at the top with other types
type PreviousContext = {
  question?: string;
  answer?: string | { answer: string } | any;
  role?: "user" | "assistant";
  createdAt?: string;
  pageUrl?: string;
  id?: string;
  threadId?: string;
  content?: string; // Added content property to handle messages
  previousAction?: string; // Add this for action continuity
  isConversationContinuation?: boolean; // Add this to track conversation flow
};

// Deterministic sparse vector generator wrapper (optionally augments with classification terms)
function generateSparseVectors(
  text: string,
  classification: QuestionClassification | null = null
) {
  const augmented = classification
    ? `${text} ${classification.type} ${classification.type} ${classification.category} ${classification.category} ${classification["sub-category"]}`
    : text;
  return generateSparseVectorsStable(augmented);
}

// Function to classify question using two specialized classifiers
async function classifyQuestion(
  question: string,
  previousContext: PreviousContext | null = null,
  pageData: any = null,
  responseId?: string
): Promise<QuestionClassification | null> {
  const tClassifyTotalStart = Date.now();
  // We'll run two specialized classifiers in parallel for better performance
  // Check if the question is ambiguous and could benefit from previous context
  const ambiguousWords = [
    "it",
    "this",
    "that",
    "them",
    "these",
    "those",
    "one",
    "ones",
    "yes",
    "sure",
    "ok",
    "okay",
    "no",
    "here",
    "there",
  ];

  // hybrid weighting defined at module scope

  const confirmationResponses = [
    "yes",
    "yeah",
    "sure",
    "ok",
    "okay",
    "correct",
    "that's right",
    "exactly",
    "confirmed",
    "please",
    "go ahead",
  ];
  const isLikelyConfirmation = confirmationResponses.some(
    (term) =>
      question.toLowerCase().trim() === term ||
      question
        .toLowerCase()
        .trim()
        .startsWith(term + " ") ||
      question
        .toLowerCase()
        .trim()
        .endsWith(" " + term)
  );

  // Check if this is a very short response that is likely a continuation
  const isShortResponse = question.split(" ").length <= 5;

  // Check if this appears to be an email address or order number response
  const appearsToBeEmail =
    /^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+$/.test(question.trim());
  const appearsToBeOrderNumber = /^#?\d{4,}$/.test(question.trim());

  const hasAmbiguousReference =
    ambiguousWords.some((word) =>
      new RegExp(`\\b${word}\\b`, "i").test(question)
    ) ||
    isLikelyConfirmation ||
    (isShortResponse && (appearsToBeEmail || appearsToBeOrderNumber));

  // Check if this is a direct highlight request
  const isHighlightRequest = /\b(?:highlight|scroll to)\s+([^\.!?]+)/i.test(
    question
  );
  let userSpecifiedText = "";

  if (isHighlightRequest) {
    // Extract the exact text the user wants to highlight
    const match = question.match(/\b(?:highlight|scroll to)\s+([^\.!?]+)/i);
    if (match && match[1]) {
      userSpecifiedText = match[1].trim();
    }
  }

  // Enhance the question with previous context if:
  // 1. The question has ambiguous references, or
  // 2. It's a very short response (likely a continuation), or
  // 3. It appears to be just an email or order number (likely a response to a previous request)
  let enhancedQuestion = question;
  let contextDependency = hasAmbiguousReference ? "high" : "low";

  if (previousContext) {
    if (
      hasAmbiguousReference ||
      isShortResponse ||
      appearsToBeEmail ||
      appearsToBeOrderNumber ||
      isLikelyConfirmation
    ) {
      enhancedQuestion = `${question} (regarding previous context: ${
        previousContext.question
      } ${previousContext.previousAction || ""})`;
      contextDependency = "high";
    }

    // Check for a previous action that might indicate continuation
    const previousAction =
      previousContext.previousAction ||
      (previousContext.answer &&
        typeof previousContext.answer === "object" &&
        previousContext.answer.action) ||
      "none";

    // If previous action was about orders or form filling, and this is a short response, email, or number
    // We should treat this as a high context dependency continuation
    if (
      [
        "get_orders",
        "track_order",
        "return_order",
        "cancel_order",
        "exchange_order",
        "fill_form",
      ].includes(previousAction) &&
      (isShortResponse ||
        appearsToBeEmail ||
        appearsToBeOrderNumber ||
        isLikelyConfirmation)
    ) {
      contextDependency = "high";
      // Add explicit continuation marker for classification
      enhancedQuestion = `${question} (IMPORTANT: This is a CONTINUATION of the previous ${previousAction} action)`;
    }
  }

  // Format previous context to include action information
  let enhancedPreviousContext = previousContext;
  if (previousContext?.answer) {
    // Try to extract action from previous answer if it's in JSON format
    let previousAction = "none";
    // Handle both string and object answers for JSON parsing
    const answerText =
      typeof previousContext.answer === "string" ? previousContext.answer : "";

    if (
      typeof previousContext.answer === "string" &&
      answerText.startsWith("{")
    ) {
      try {
        const parsedAnswer = JSON.parse(previousContext.answer);
        previousAction = parsedAnswer.action || "none";
      } catch (e) {
        // If parsing fails, use none as default
      }
    } else if (
      typeof previousContext.answer === "object" &&
      previousContext.answer.action
    ) {
      previousAction = previousContext.answer.action;
    }

    // Create enhanced context object
    enhancedPreviousContext = {
      ...previousContext,
      previousAction,
      isConversationContinuation: true,
    };
  }

  const CONTENT_CLASSIFIER_PROMPT = `You are an AI assistant specializing in classifying the CONTENT TYPE of e-commerce questions.

When a user asks a question, you must respond with a JSON object containing ONLY these fields:
- type: one of ["product", "post", "collection", "discount", "page"]
- category: depends on the type
- sub-category: depends on the type and category
- interaction_type: one of ["sales", "support", "discounts", "noneSpecified"] - determines which vector index to search

Your task is to FOCUS EXCLUSIVELY on classifying what the question is ABOUT, not what action should be taken.

PRODUCT:
- discovery: use_case, experience_level 
- on-page: fit_sizing, quality_durability, feature_specific
- statement: intent_signal, objection, concern_hesitation
- clarifying: unclear_intent, missing_info
- objection_handling: price_value, trust_quality
- cart_action: add_remove_update

COLLECTION:
- discovery: general
- on-page: products
- filter_sort: price, availability, sort, general

POST:
- discovery: search
- content: tips, instructions
- topic: background, next_steps

PAGE:
- discovery: page_purpose, content_overview
- on-page: section_content, navigation
- statement: intent, clarification

DISCOUNT:
- discount: eligibility, usage, value
- discovery: search
- on-page: products
- filter_sort: price, availability, sort

INTERACTION TYPE CLASSIFICATION RULES:
1. "sales" - Use when the user is:
   - Asking about products or collections
   - Inquiring about pricing, availability, features
   - Requesting product recommendations
   - Asking product comparison questions
   - Showing purchase intent
   - Asking about sales, discounts, promotions
   - Example queries: "Do you have red shirts?", "What's the price of this?", "Tell me about this product", "Do you have this in blue?"

2. "support" - Use when the user is:
   - Asking about existing orders (tracking, cancellations, returns)
   - Requesting help with product issues
   - Needing assistance with accounts/login
   - Asking about shipping/delivery issues
   - Mentioning problems with products/services
   - Example queries: "Where's my order?", "How do I return this?", "My product isn't working", "Can I cancel my order?", "How do I track my package?"

3. "discounts" - Use when the user is:
   - Asking general questions about the store/company
   - Asking about store policies, locations, hours
   - Making small talk or greeting
   - Asking about topics not specific to sales or support
   - Example queries: "What are your store hours?", "Tell me about your company", "Do you have a privacy policy?", "Hello", "Thanks for your help"

4. "noneSpecified" - Only use when:
   - The query is extremely ambiguous with insufficient context
   - The query could equally belong to multiple categories
   - The query is very short with no clear intent
   - Example queries: "Yes", "No", "Ok", very short ambiguous responses

PRODUCT vs COLLECTION:
- Classify as PRODUCT if:
  * Query mentions a specific product by name (e.g., "Tell me about the Burton Custom Flying V snowboard")
  * Query uses "this" or "the" with a singular noun (e.g., "What's the price of this snowboard?")
  * Query asks about specific features of a single item (e.g., "What's the flex rating of this snowboard?")
  * Query is about a single item's maintenance/use (e.g., "How do I maintain this snowboard?")
  * Query uses "Tell me about" or "What is" with a product name (e.g., "Tell me about the Collection Snowboard")
  * Query uses "Show me" with a specific product name
  * Query uses "I want to know about" with a specific product name
- Classify as COLLECTION if:
  * Query uses plural forms (e.g., "What products do you have?")
  * Query asks about multiple items (e.g., "Show me all your products")
  * Query uses filtering/sorting terms (e.g., "What products do you have for beginners?")
  * Query asks about a category/type of items (e.g., "What products do you have?")
  * Query uses "Tell me about" or "What is" with a category/type (e.g., "Tell me about your products")
  * Query uses "Show me" with a category/type
  * Query uses "I want to know about" with a category/type
  * ANY query with plural forms like "products", "items", "collections", "categories", etc.

PRODUCT vs POST:
- Classify as PRODUCT if:
  * Query is about maintaining/using a specific product (e.g., "How do I maintain this product?")
  * Query includes "this" or "the" with a specific item
  * Query asks about specific features of a product
- Classify as POST if:
  * Query is about general maintenance (e.g., "How do I maintain a product?")
  * Query is about general tips/instructions
  * Query uses generic terms without specific product references

COLLECTION vs DISCOUNT:
- Classify as DISCOUNT if:
  * Query mentions specific discount codes
  * Query asks about sales/promotions
  * Query uses terms like "on sale", "discounted", "promo"
- Classify as COLLECTION if:
  * Query is about browsing/filtering products
  * Query asks about product categories/types
  * Query uses plural forms without discount terms`;

  const ACTION_CLASSIFIER_PROMPT = `You are an AI assistant specializing in determining the appropriate ACTION for e-commerce questions.

When a user asks a question, you must respond with a JSON object containing ONLY these fields:
- action_intent: one of ["redirect", "click", "scroll", "fill_form", "purchase", "track_order", "get_orders", "return_order", "cancel_order", "refund_order", "exchange_order", "login", "logout", "account_reset", "account_management", "scheduler", "highlight_text", "generate_image", "contact", "none"]
- context_dependency: "high" or "low"
- language: ISO 639-1 language code (e.g., "en", "es", "fr", "de", etc.)
- content_targets: an object containing relevant targets for the action

Your task is to FOCUS EXCLUSIVELY on determining what ACTION should be taken, not what the question is about.

  MINIMAL ACTIONS POLICY (VERY IMPORTANT):
  - Default to "none" unless there is an EXPLICIT user request or a clearly necessary multi-step flow.
  - Prefer simple, friendly answers without actions for basic informational questions.
  - Only use UI actions when the user clearly asks you to do something (e.g., "highlight", "scroll", "show me", "take me", "go to", "open", "click", "add to cart", "buy", "log in", "log out", "track", "return", "cancel", "exchange").
  - Do NOT use "scroll" or "highlight_text" unless the user explicitly asks to find/locate/show something on THIS page, or says "where on this page...". Otherwise choose "none".
  - Use "redirect" ONLY when the user explicitly asks to navigate (e.g., "take me to", "show me the refund policy", "open my orders"). Otherwise choose "none".
  - Use "purchase" ONLY when the user explicitly asks to buy/add to cart.
  - Preserve ongoing flows (orders/account/forms) when the user is providing requested details (see continuity rules below).

CONVERSATIONAL CONTEXT AND ACTION CONTINUITY (EXTREMELY CRITICAL):
- ALWAYS thoroughly analyze the ENTIRE conversation history for context, not just the current message
- You MUST maintain continuity of user intentions across multiple messages
- Pay special attention to the immediate previous messages for context clues
- When a user responds to a prompt for specific information (e.g., providing an email after being asked for it), MAINTAIN the previous action_intent
- If the previous assistant message was about orders and had "get_orders" action_intent, and the user responds with email/confirmation/details, you MUST:
  * Keep the "get_orders" action_intent 
  * DO NOT switch to "none" action_intent
  * Set context_dependency to "high"
  * Include the email or identifying information in content_targets
- Action flows that must maintain continuity:
  * "get_orders" → [user provides email/confirmation] → KEEP "get_orders"
  * "track_order" → [user provides order number/details] → KEEP "track_order"
  * "return_order" → [user provides order details] → KEEP "return_order"
  * "cancel_order" → [user provides order details] → KEEP "cancel_order"
  * "refund_order" → [user provides order details] → KEEP "refund_order"
  * "exchange_order" → [user provides order details] → KEEP "exchange_order"
  * "fill_form" → [user provides form inputs] → KEEP "fill_form"
- Detect email addresses, order numbers, confirmation codes, and affirmative responses ("yes", "sure", etc.) as continuations of previous actions
- The previous action_intent should be preserved when user is responding with requested information
- This action continuity is EXTREMELY important as breaking it creates a poor user experience
- NEVER lose context between messages in a conversation flow

  CRITICAL CLASSIFICATION PRIORITIES:
  1. If the answer is on the current page, ONLY use "highlight_text" or "scroll" when the user explicitly asks you to find/locate/show the information on the page. Otherwise prefer action_intent="none" and reply simply.
   - When you do highlight/scroll, use exact text from page data and keep the text very short.

CATEGORY AND ACTION INTENT RULES (CRITICAL):
   - For "discovery" category (when answer isn't on current page):
     * Consider "redirect" only if the user explicitly asks to navigate; otherwise prefer "none".
     * NEVER use "scroll" or "highlight_text" for discovery.
   - For "on-page" category (when answer is on current page):
     * ONLY use "scroll" or "highlight_text" when explicitly requested; otherwise prefer "none".
     * NEVER use "redirect" for purely on-page answers.

SCROLL AND HIGHLIGHT TEXT RULES (CRITICAL):
 - When selecting text for highlighting or scrolling:
   * Use SMALL chunks (3-5 words maximum)
   - you must only choose exact text inside of the full_text part of the relevantPageData
   - your only allowed to highlight a word 5 sequence maximum
   - When user EXPLICITLY requests "highlight [text]" or "scroll to [text]", use EXACTLY the text they specified
   - DO NOT automatically expand product names or add additional information to the highlight text the user requested
   - NEVER include newline characters (\\n) in the exact_text field as they don't render on webpages
   - Break longer content into separate, smaller logical chunks
   - Choose focused text that directly answers the user's question
   - For lists, select only one specific item rather than the entire list
   - Always verify the text exists exactly as copied in the page data
   * Use titles, headers, or key sentences when possible
   * Ensure the exact_text field is a continuous string with no line breaks

ORDER HANDLING (CRITICAL):
 - use "get_orders" action_intent when user asks to see all orders
 - use "track_order" action_intent when user asks to track an order
 - use "return_order" action_intent when user asks to return an order
 - use "cancel_order" action_intent when user asks to cancel an order
 - use "refund_order" action_intent when user asks for a refund
 - use "exchange_order" action_intent when user asks to exchange an order
 
 - For all order action types (cancel_order, return_order, refund_order, exchange_order):
   * ALWAYS include order_id in content_targets when available
   * ALWAYS include order_email in content_targets when available
   * Capture these details from user messages and maintain them in the conversation
   * DO NOT use "redirect" when any of these order actions are appropriate

REFUND AND RETURN HANDLING (CRITICAL):
 - ALWAYS use specific order action intent when user mentions:
   * "cancel" or "cancel my order" → use "cancel_order"
   * "refund" or "get money back" or "get a refund" → use "refund_order"
   * "return" or "send back" → use "return_order"
   * "exchange" or "swap" or "replace with" → use "exchange_order"
   * Any questions about returns, refunds, cancellations or exchanges policy
 - NEVER classify these as "redirect" - they MUST be the appropriate order action
 - This takes precedence over other classifications
 - For action_context, search for refund-policy or return-policy pages if policy information is requested
 - If on refund or return policy page, use "highlight_text" instead

LOGIN HANDLING (CRITICAL):
 - for "login" action_intent, use when user asks to log in to their account
 - for "logout" action_intent, use when user asks to log out of their account

ACCOUNT MANAGEMENT HANDLING (CRITICAL):
 - for "account_reset" action_intent, use when user asks to reset their account
 - for "account_management" action_intent, use when user wants to modify their account information
 - IMPORTANT: ANY query about changing, updating, modifying, or editing account information MUST use "account_management" action_intent
 - This includes ALL requests related to:
   * Updating first name, last name, email, or phone
   * Changing address information
   * Any mention of "update my account", "change my account details", "edit my profile", etc.
 - NEVER use "redirect" action_intent for account modification requests - always use "account_management"
 - The action_context should be empty initially, not containing URL information
 - Account updates should be handled directly through the action_context, NOT through navigation

PURCHASE vs CLICK ACTIONS (CRITICAL):
1. Use "purchase" action_intent ONLY when:
   - User explicitly wants to add a product to cart
   - User is on a product page and says "buy this", "add to cart", "purchase", etc.
   - Never do a "purchase" action_intent if its not incredibly clear that the user wants to purchase the product
   - Button text contains "Add to Cart", "Buy Now", "Purchase", etc.
2. ALWAYS include the exact product_name in content_targets for purchase actions
3. ALWAYS include product_id in content_targets for purchase actions when available
4. Use "click" action_intent for all other button clicks that aren't purchases

FORM SUBMISSION HANDLING (CRITICAL):
1. When a user responds with "yes", "ok", "sure", "submit", etc. to a form filling interaction:
   - This should be classified as a "click" action_intent
   - Find the submit button from buttons array that relates to the form (e.g., "Submit", "Subscribe", "Send")
   - Include this button in content_targets
   - This applies even if the user's response is just a single word like "yes"
2. ALWAYS check the previous context for form filling interactions before determining action_intent
3. If there was a form-filling interaction and user responds affirmatively, this is a submit/click action
4. Look for any "Submit", "Subscribe", "Send", "Continue", or similar buttons in the page data

GET_ORDERS vs TRACK_ORDER vs ORDER ACTIONS:
- Classify as GET_ORDERS if:
  * Query asks about ALL orders (e.g., "show me my orders", "what orders do I have")
  * Query uses plural form "orders" without specifying a particular order
  * Query asks for order history or past orders list
  * No specific order identifier is mentioned
  * User wants a general overview of all orders
- Classify as TRACK_ORDER if:
  * Query mentions tracking or checking status of order(s)
  * Query includes specific order number(s) or identifier(s)
  * Query is about the status or location of order(s)
  * User is looking for specific order information
  * The query indicates the user wants to track or locate specific orders, even if multiple`;

  try {
    // Run both classifiers in parallel for better performance
    console.log("doing classify (2x gpt-5-nano)", { responseId });
    const tNanoStart = Date.now();
    const [contentClassifierCompletion, actionClassifierCompletion] =
      await Promise.all([
        // Content classifier - focuses on what the question is about
        openai.chat.completions.create({
          model: "gpt-5-nano",
          messages: [
            { role: "system", content: CONTENT_CLASSIFIER_PROMPT },
            {
              role: "user",
              content: pageData
                ? `Question: ${enhancedQuestion}\n\nPage Snapshot: ${JSON.stringify(
                    pageData,
                    null,
                    2
                  )}`
                : enhancedQuestion,
            },
          ],
        }),

        // Action classifier - focuses on what action should be taken
        openai.chat.completions.create({
          model: "gpt-5-nano",
          messages: [
            { role: "system", content: ACTION_CLASSIFIER_PROMPT },
            {
              role: "user",
              content: pageData
                ? `Question: ${enhancedQuestion}\n\nPage Snapshot: ${JSON.stringify(
                    pageData,
                    null,
                    2
                  )}\n\nPrevious context: ${JSON.stringify(
                    previousContext || {}
                  )}`
                : `${enhancedQuestion}\n\nPrevious context: ${JSON.stringify(
                    previousContext || {}
                  )}`,
            },
          ],
        }),
      ]);
    const nanoMs = Date.now() - tNanoStart;
    console.log("done classify (2x gpt-5-nano)", { ms: nanoMs, responseId });

    // Extract content from both completions
    const contentClassifierContent =
      contentClassifierCompletion.choices[0].message.content;
    const actionClassifierContent =
      actionClassifierCompletion.choices[0].message.content;

    if (!contentClassifierContent || !actionClassifierContent) {
      throw new Error("No content returned from classification models");
    }

    // Parse both responses
    const contentClassification = JSON.parse(contentClassifierContent);
    const actionClassification = JSON.parse(actionClassifierContent);

    // Combine the results from both classifiers
    const classification = {
      // Content classification results
      type: contentClassification.type,
      category: contentClassification.category,
      "sub-category": contentClassification["sub-category"],
      interaction_type: contentClassification.interaction_type,

      // Action classification results
      action_intent: actionClassification.action_intent,
      context_dependency: actionClassification.context_dependency,
      language: actionClassification.language,
      content_targets: actionClassification.content_targets || {},
    } as QuestionClassification;

    console.log("Content classification:", contentClassification);
    console.log("Action classification:", actionClassification);

    // If context_dependency isn't provided by the model, infer it based on ambiguous references
    if (!classification.context_dependency) {
      classification.context_dependency = hasAmbiguousReference
        ? "high"
        : "low";
    }

    // Ensure action_intent is always present
    if (!classification.action_intent) {
      classification.action_intent = "none";
    }

    // Ensure content_targets is initialized
    if (!classification.content_targets) {
      classification.content_targets = {};
    }

    // If this is a highlight/scroll request and we have user-specified text, use it
    if (
      isHighlightRequest &&
      userSpecifiedText &&
      (classification.action_intent === "highlight_text" ||
        classification.action_intent === "scroll")
    ) {
      classification.content_targets.exact_text = userSpecifiedText;
    }

    const totalMs = Date.now() - tClassifyTotalStart;
    console.log("done classify (total)", { ms: totalMs, responseId });
    return classification;
  } catch (error) {
    console.error("Error classifying question:", error);
    return null;
  }
}

// Helper function to extract potential entities from previous context
function extractEntitiesFromPreviousContext(
  previousContext: PreviousContext | null
): string[] {
  if (!previousContext?.answer) return [];

  const answer = previousContext.answer;
  const words = answer.split(/\s+/);
  const potentialEntities: string[] = [];

  // Look for capitalized terms that are likely product or page names
  for (let i = 0; i < words.length; i++) {
    // Check for capitalized words that might be part of a multi-word entity
    if (/^[A-Z]/.test(words[i])) {
      // Try to capture multi-word entities (up to 4 words)
      for (let length = 4; length >= 1; length--) {
        if (i + length <= words.length) {
          const entity = words.slice(i, i + length).join(" ");
          potentialEntities.push(entity);
        }
      }
    }
  }

  return potentialEntities;
}

// Separate reranking function for main content
function rerankMainResults(
  results: any[],
  classification: QuestionClassification,
  query: string,
  previousContext: PreviousContext | null = null
) {
  // Enhance query with classification data but EXCLUDE type
  const enhancedQuery = `${query} ${classification.category} ${
    classification["sub-category"] || "general"
  }`;

  // If we have previous context, extract the product name from it
  let previousProductName = null;
  if (previousContext?.answer) {
    // Handle both string and object answers
    const answerText =
      typeof previousContext.answer === "string"
        ? previousContext.answer
        : previousContext.answer.answer || "";

    // Check for product name without using a specific regex that could be null
    const match = answerText.match(/The 3p Fulfilled Snowboard/i);
    if (match && match[0]) {
      previousProductName = match[0];
    }
  }

  // Deduplicate results by handle
  const seenHandles = new Set();
  const dedupedResults = results.filter((result) => {
    if (seenHandles.has(result.metadata?.handle)) return false;
    seenHandles.add(result.metadata?.handle);
    return true;
  });

  // Calculate classification match scores
  const rerankedResults = dedupedResults.map((result) => {
    let classificationMatch = 0;
    let totalFields = 3;

    // Type match is most important
    if (result.metadata?.type === classification.type) {
      classificationMatch = 1; // Start with 1 for type match (instead of 2)

      // Only check category/subcategory if type matches
      if (result.metadata?.category === classification.category) {
        classificationMatch++;
      }
      if (
        result.metadata?.["sub-category"] === classification["sub-category"] ||
        classification["sub-category"] === "general" ||
        !result.metadata?.["sub-category"]
      ) {
        classificationMatch++;
      }
    }

    // Calculate base score
    let score = result.score || 0;

    // Apply type-based multipliers FIRST
    if (
      classification.type === "collection" &&
      result.metadata?.type === "collection"
    ) {
      score *= 30; // Strong boost for collections in collection queries
    } else if (result.metadata?.type === classification.type) {
      score *= 3; // Standard type match bonus
    }

    // Add classification match bonus
    score *= 1 + (classificationMatch / totalFields) * 2;

    // Add strong boost for exact product name matches
    if (result.metadata?.type === "product") {
      const productName = result.metadata?.title?.toLowerCase() || "";
      const queryName = query.toLowerCase();

      // Check for exact name match
      if (productName === queryName) {
        score *= 100; // Strong boost for exact name match
      } else if (
        productName.includes(queryName) ||
        queryName.includes(productName)
      ) {
        score *= 10; // Moderate boost for partial name match
      }

      // Add boost for products mentioned in previous context
      if (previousProductName) {
        const previousProductNameLower = previousProductName.toLowerCase();
        if (productName === previousProductNameLower) {
          // If this is a direct product follow-up, use moderate boost
          if (
            classification.type === "product" &&
            (classification.category === "statement" ||
              classification.category === "cart_action")
          ) {
            score *= 50; // Moderate boost for direct product follow-ups
          } else {
            score *= 10; // Standard boost for other contexts
          }
        }
      }
    }

    return {
      ...result,
      rerankScore: score,
      classificationMatch: `${classificationMatch}/${totalFields}`,
    };
  });

  // Sort by rerank score
  return rerankedResults.sort((a, b) => b.rerankScore - a.rerankScore);
}

// Separate reranking function for QAs
function rerankQAResults(
  results: any[],
  classification: QuestionClassification,
  query: string,
  previousContext: PreviousContext | null = null
) {
  // Enhance query with classification data but EXCLUDE type
  const enhancedQuery = `${query} ${classification.category} ${
    classification["sub-category"] || "general"
  }`;

  // If we have previous context, extract the product name from it
  let previousProductName = null;
  if (previousContext?.answer) {
    // Handle both string and object answers
    const answerText =
      typeof previousContext.answer === "string"
        ? previousContext.answer
        : previousContext.answer.answer || "";

    // Check for product name without using a specific regex that could be null
    const match = answerText.match(/The 3p Fulfilled Snowboard/i);
    if (match && match[0]) {
      previousProductName = match[0];
    }
  }

  // Deduplicate results by question
  const seenQuestions = new Set();
  const dedupedResults = results.filter((result) => {
    if (seenQuestions.has(result.metadata?.question)) return false;
    seenQuestions.add(result.metadata?.question);
    return true;
  });

  // Calculate classification match scores
  const rerankedResults = dedupedResults.map((result) => {
    let classificationMatch = 0;
    let totalFields = 3;

    // Since we forced the metadata to match earlier, we can directly compare
    if (result.metadata.type === classification.type) {
      classificationMatch = 1; // Start with 1 for type match (instead of 2)
      if (result.metadata.category === classification.category) {
        classificationMatch++;
      }
      if (
        result.metadata["sub-category"] === classification["sub-category"] ||
        classification["sub-category"] === "general"
      ) {
        classificationMatch++;
      }
    }

    // Calculate base score
    let score = result.score || 0;

    // Apply classification match multiplier
    score *= 1 + (classificationMatch / totalFields) * 2;

    // Add query term matching for better relevance
    const queryTerms = query
      .toLowerCase()
      .split(" ")
      .filter(
        (term) =>
          ![
            "what",
            "how",
            "where",
            "when",
            "why",
            "do",
            "does",
            "is",
            "are",
            "the",
            "a",
            "an",
            "it",
            "this",
            "that",
          ].includes(term)
      );

    const qaText = `${result.metadata?.question || ""} ${
      result.metadata?.answer || ""
    }`.toLowerCase();
    const matchingTerms = queryTerms.filter((term) =>
      qaText.includes(term)
    ).length;
    const termMatchScore = matchingTerms / queryTerms.length;

    // Give more weight to content matching
    score *= 1 + termMatchScore * 2;

    // Special handling for purchase intent queries
    if (
      classification.type === "product" &&
      classification.category === "statement" &&
      classification["sub-category"] === "intent_signal" &&
      query.toLowerCase().includes("buy")
    ) {
      if (
        qaText.includes("buy") ||
        qaText.includes("purchase") ||
        qaText.includes("checkout") ||
        qaText.includes("order") ||
        qaText.includes("get it") ||
        qaText.includes("add to cart")
      ) {
        score *= 3;
      }

      if (result.metadata?.url || result.metadata?.productUrl) {
        score *= 2;
      }
    }

    // Add boost for QAs that reference products from previous context
    if (previousProductName) {
      if (qaText.includes(previousProductName.toLowerCase())) {
        if (
          classification.type === "product" &&
          (classification.category === "statement" ||
            classification.category === "cart_action")
        ) {
          score *= 5;
        } else {
          score *= 2;
        }
      }
    }

    // Normalize score
    score = Math.min(score, 1000);

    return {
      ...result,
      rerankScore: score,
      classificationMatch: `${classificationMatch}/${totalFields}`,
    };
  });

  return rerankedResults.sort((a, b) => b.rerankScore - a.rerankScore);
}

// Create function to dynamically build the system prompt based on classification
const buildSystemPrompt = (
  classification: QuestionClassification | null,
  websiteCustomInstructions?: string | null
) => {
  // Start with interaction-type based prompt instead of generic MAIN_PROMPT
  let prompt = "";

  if (classification?.interaction_type) {
    // Use specialized system prompts based on interaction type
    switch (classification.interaction_type) {
      case "sales":
        prompt = SHOPIFY_SALES_PROMPT + "\n\n";
        break;
      case "support":
        prompt = SHOPIFY_SUPPORT_PROMPT + "\n\n";
        break;
      case "discounts":
        prompt = SHOPIFY_GENERAL_PROMPT + "\n\n";
        break;
      default:
        // Fallback to main prompt for noneSpecified or unknown types
        prompt = MAIN_PROMPT + "\n\n";
        break;
    }
  } else {
    // Fallback to main prompt if no interaction type is classified
    prompt = MAIN_PROMPT + "\n\n";
  }

  // Add type-specific prompts based on classification (still needed for specialized content handling)
  if (classification) {
    // Add page/post specific prompt
    if (classification.type === "page" || classification.type === "post") {
      prompt += PAGE_BLOG_PROMPT + "\n\n";
    }

    // Add product/collection specific prompt
    if (
      classification.type === "product" ||
      classification.type === "collection"
    ) {
      prompt += PRODUCT_COLLECTION_PROMPT + "\n\n";
    }

    // Add discount specific prompt
    if (classification.type === "discount") {
      prompt += DISCOUNT_PROMPT + "\n\n";
    }

    // Add action-specific prompts based on classification's action_intent
    if (classification.action_intent) {
      // Login/logout actions
      if (
        classification.action_intent === "login" ||
        classification.action_intent === "logout"
      ) {
        prompt += LOGIN_LOGOUT_PROMPT + "\n\n";
      }

      // Account management actions
      if (
        classification.action_intent === "account_reset" ||
        classification.action_intent === "account_management"
      ) {
        prompt += ACCOUNT_EDITING_PROMPT + "\n\n";
      }

      // Order management actions
      if (
        classification.action_intent === "track_order" ||
        classification.action_intent === "get_orders"
      ) {
        prompt += ORDER_MANAGEMENT_PROMPT + "\n\n";
      }

      // Form filling actions
      if (
        classification.action_intent === "fill_form" ||
        classification.action_intent === "scheduler"
      ) {
        prompt += FORM_FILLING_OUT_PROMPT + "\n\n";
      }

      // Button click actions
      if (classification.action_intent === "click") {
        prompt += BUTTON_CLICK_PROMPT + "\n\n";
      }

      // Scroll and highlight actions
      if (
        classification.action_intent === "scroll" ||
        classification.action_intent === "highlight_text"
      ) {
        prompt += SCROLL_AND_HIGHLIGHT_PROMPT + "\n\n";
      }

      // Image generation actions
      if (classification.action_intent === "generate_image") {
        prompt += GENERATE_IMAGE_PROMPT + "\n\n";
      }

      // Purchase actions
      if (classification.action_intent === "purchase") {
        prompt += PURCHASE_PROMPT + "\n\n";
      }

      // Return order actions
      if (
        classification.action_intent === "return_order" ||
        classification.action_intent === "cancel_order" ||
        classification.action_intent === "exchange_order"
      ) {
        prompt += RETURN_ORDERS_PROMPT + "\n\n";
      }
    }
  }

  // Add website-specific custom instructions if they exist
  if (websiteCustomInstructions) {
    prompt +=
      "\n\nFollow these additional instructions from the website owner on what to do and how to act:\n";
    prompt += websiteCustomInstructions + "\n\n";
  }

  // Always end with the final prompt
  prompt += FINAL_MAIN_PROMPT;

  return prompt;
};

// Function to extract relevant page data based on action intent
const getRelevantPageData = (
  pageData: any,
  actionIntent: string | undefined
) => {
  // Instead of filtering page data based on action intent, just return the full page data
  return pageData;
};

// Add function to clean and prepare highlight/scroll text
function cleanHighlightText(
  text: string,
  isUserSpecified: boolean = false
): string {
  if (!text) return "";

  // Remove newlines and replace with spaces
  let cleaned = text.replace(/\n+/g, " ");

  // Remove extra spaces
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  // If user explicitly specified this text, be more conservative with truncation
  if (isUserSpecified) {
    // Just do basic cleanup and return their text
    return cleaned;
  }

  // If text is too long (more than 100 chars), truncate it
  if (cleaned.length > 100) {
    const words = cleaned.split(" ");
    // Take first ~10-15 words (roughly 100 chars)
    cleaned = words.slice(0, 15).join(" ");

    // Don't cut off mid-sentence if possible - end at punctuation
    const lastPunctIndex = cleaned.search(/[.!?](?:\s|$)/);
    if (lastPunctIndex > 30) {
      // Ensure we have reasonable text length
      cleaned = cleaned.substring(0, lastPunctIndex + 1);
    }
  }

  return cleaned;
}

// Update function to properly handle standard Shopify URLs like account pages and collections/all
function formatRedirectUrl(
  url: string,
  classification: QuestionClassification | null,
  queryText: string,
  availableData: any = null,
  skipValidation: boolean = false
): string {
  if (!url) return "";

  // Convert query text to lowercase once at the beginning
  const queryLower = queryText.toLowerCase();

  // Standard Shopify URLs that should always be valid without needing validation
  const standardShopifyPaths = {
    account: "/account",
    login: "/account/login",
    register: "/account/register",
    addresses: "/account/addresses",
    orders: "/account/orders",
    collections: "/collections/all",
    shop: "/collections/all",
    products: "/collections/all",
    cart: "/cart",
    checkout: "/checkout",
  };

  // Check if query is asking for a standard page
  for (const [key, path] of Object.entries(standardShopifyPaths)) {
    if (
      queryLower.includes(`my ${key}`) ||
      queryLower.includes(`to ${key}`) ||
      queryLower.includes(`the ${key}`) ||
      queryLower.includes(`your ${key}`) ||
      queryLower === key ||
      queryLower === `${key} page`
    ) {
      console.log(`Using standard Shopify path for ${key}: ${path}`);
      return path;
    }
  }

  // Check for generic blog queries - redirect to main blog page
  const genericBlogTerms = [
    "blogs do you have",
    "blog section",
    "what blogs",
    "show me your blogs",
    "blog posts",
    "your blog",
  ];

  if (genericBlogTerms.some((term) => queryLower.includes(term))) {
    // Find a main blog handle if available
    if (availableData) {
      const mainBlogHandle = findMainBlogHandle(availableData);
      if (mainBlogHandle) {
        console.log(
          `Generic blog query detected - redirecting to main blog: /blogs/${mainBlogHandle}`
        );
        return `/blogs/${mainBlogHandle}`;
      }
    }
  }

  // Check for policy URLs - correctly transform /pages/policy-name to /policies/policy-name
  const policyTerms = [
    "privacy-policy",
    "return-policy",
    "refund-policy",
    "contact-information",
    "terms-of-service",
    "shipping-policy",
  ];

  // If URL already has a proper format with path prefix, check for correct structure
  if (
    url.startsWith("/pages/") ||
    url.startsWith("/collections/") ||
    url.startsWith("/products/") ||
    url.startsWith("/blogs/") ||
    url.startsWith("/policies/") ||
    url.startsWith("/account") ||
    url === "/collections/all" ||
    url === "/cart" ||
    url === "/checkout"
  ) {
    // Check if this is a policy URL with incorrect path
    if (url.startsWith("/pages/")) {
      const handle = url.split("/").pop() || "";
      if (policyTerms.some((term) => handle.includes(term))) {
        return `/policies/${handle}`;
      }
    }

    // Check if this is a blog post URL missing the blogHandle
    if (url.startsWith("/blogs/") && !url.split("/")[2]) {
      // If blog URL is incomplete and we have available data with blogHandle
      const postHandle = url.split("/")[2] || "";
      if (availableData && postHandle) {
        // Try to find the correct blogHandle from the available data
        const blogHandle = findBlogHandleForPost(availableData, postHandle);
        if (blogHandle) {
          return `/blogs/${blogHandle}/${postHandle}`;
        }
      }
    }

    // Skip validation if requested
    if (skipValidation) {
      return url;
    }

    // Only return the URL if we can verify it exists
    if (availableData && !verifyUrlExists(url, availableData)) {
      // For standard Shopify paths, don't return empty even if validation fails
      if (
        url.startsWith("/account") ||
        url === "/collections/all" ||
        url === "/cart" ||
        url === "/checkout"
      ) {
        return url;
      }

      return ""; // Return empty string to prevent redirect to non-existent URL
    }

    return url;
  }

  // Handle standard paths that might be sent without the leading slash
  if (url === "account" || url.startsWith("account/")) {
    return "/" + url;
  }

  if (
    url === "collections/all" ||
    url === "collections" ||
    url === "shop" ||
    url === "products"
  ) {
    return "/collections/all";
  }

  // Strip any domain or protocol if present
  let cleanUrl = url;
  if (cleanUrl.includes("://")) {
    cleanUrl = cleanUrl.split("://")[1];
    if (cleanUrl.includes("/")) {
      cleanUrl = "/" + cleanUrl.split("/").slice(1).join("/");
    } else {
      cleanUrl = "/";
    }
  }

  // If URL doesn't start with slash, add it
  if (!cleanUrl.startsWith("/")) {
    cleanUrl = "/" + cleanUrl;
  }

  // Extract handle from URL
  const handle = cleanUrl.split("/").filter(Boolean).pop() || "";

  // Check for policy pages
  for (const term of policyTerms) {
    if (cleanUrl.includes(term)) {
      return `/policies/${handle}`;
    }
  }

  // Check available data to verify the correct URL type (collection vs page vs product)
  if (availableData) {
    // Check if this handle matches any collection handles
    const collectionHandles = extractHandles(availableData, "collection");
    if (collectionHandles.includes(handle)) {
      return `/collections/${handle}`;
    }

    // Check if this handle matches any product handles
    const productHandles = extractHandles(availableData, "product");
    if (productHandles.includes(handle)) {
      return `/products/${handle}`;
    }

    // Check if this handle matches any page handles
    const pageHandles = extractHandles(availableData, "page");
    if (pageHandles.includes(handle)) {
      return `/pages/${handle}`;
    }

    // Check if handle matches any blog post handles and find the associated blog handle
    const blogPostHandles = extractHandles(availableData, "post");
    if (blogPostHandles.includes(handle)) {
      // Find the blog handle for this post
      const blogHandle = findBlogHandleForPost(availableData, handle);
      if (blogHandle) {
        return `/blogs/${blogHandle}/${handle}`;
      }
      // If we can't find the blog handle, just use /blogs/handle as fallback
      return `/blogs/${handle}`;
    }

    // Additional step: check if we can confirm this handle exists in any form
    const allHandles = [
      ...collectionHandles,
      ...productHandles,
      ...pageHandles,
      ...blogPostHandles,
    ];

    // If the handle doesn't appear to exist in any form, don't redirect
    if (
      !allHandles.includes(handle) &&
      !hasUrlInPageData(handle, availableData)
    ) {
      console.warn(
        `Handle '${handle}' does not appear in any known data, not redirecting`
      );

      // Special case for collections/all when user is asking for products/shop
      if (
        queryLower.includes("product") ||
        queryLower.includes("shop") ||
        queryLower.includes("collection")
      ) {
        console.log(
          "User asked for products/shop - redirecting to collections/all"
        );
        return "/collections/all";
      }

      // Special case for account page when user is asking for account
      if (
        queryLower.includes("account") ||
        queryLower.includes("profile") ||
        queryLower.includes("my page")
      ) {
        console.log("User asked for account - redirecting to /account");
        return "/account";
      }

      // Special case for generic blog queries
      if (genericBlogTerms.some((term) => queryLower.includes(term))) {
        const mainBlogHandle = findMainBlogHandle(availableData);
        if (mainBlogHandle) {
          console.log(
            `User asked about blogs - redirecting to main blog: /blogs/${mainBlogHandle}`
          );
          return `/blogs/${mainBlogHandle}`;
        }
      }

      return ""; // Return empty string to prevent redirect to non-existent URL
    }
  }

  // If we couldn't find an exact match, use the classification as a guide
  const pluralProductTerms = [
    "products",
    "collections",
    "shop",
    "categories",
    "items",
  ];

  // If query has plural product terms, it's likely a collection
  if (pluralProductTerms.some((term) => queryLower.includes(term))) {
    if (handle && handle !== "all") {
      return `/collections/${handle}`;
    }
    return "/collections/all";
  }

  // If query contains "ball" or sports equipment terms, they're usually collections
  if (
    queryLower.includes("ball") ||
    queryLower.includes("equipment") ||
    queryLower.includes("gear") ||
    queryLower.includes("apparel")
  ) {
    return `/collections/${handle}`;
  }

  // Check for account-related queries
  if (
    queryLower.includes("account") ||
    queryLower.includes("profile") ||
    queryLower.includes("my page") ||
    queryLower.includes("my orders")
  ) {
    return "/account";
  }

  // Check for generic blog queries
  if (genericBlogTerms.some((term) => queryLower.includes(term))) {
    if (availableData) {
      const mainBlogHandle = findMainBlogHandle(availableData);
      if (mainBlogHandle) {
        return `/blogs/${mainBlogHandle}`;
      }
    }
  }

  // Determine the appropriate path prefix based on classification
  if (classification?.type === "product") {
    return `/products/${handle}`;
  } else if (classification?.type === "collection") {
    return `/collections/${handle}`;
  } else if (classification?.type === "post") {
    // For blog posts, check if it's a generic blog query
    if (genericBlogTerms.some((term) => queryLower.includes(term))) {
      if (availableData) {
        const mainBlogHandle = findMainBlogHandle(availableData);
        if (mainBlogHandle) {
          return `/blogs/${mainBlogHandle}`;
        }
      }
      // Default fallback if we can't find a specific blog handle
      return "/blogs";
    }

    // For specific blog posts, try to find the blog handle
    if (availableData) {
      const blogHandle = findBlogHandleForPost(availableData, handle);
      if (blogHandle) {
        return `/blogs/${blogHandle}/${handle}`;
      }
    }
    return `/blogs/${handle}`;
  } else if (classification?.type === "page") {
    // Check if this might be a policy page
    if (policyTerms.some((term) => handle.includes(term))) {
      return `/policies/${handle}`;
    }
    // For pages, be more cautious - check if it might be a collection first
    if (
      queryLower.includes("product") ||
      queryLower.includes("collection") ||
      queryLower.includes("shop")
    ) {
      return `/collections/${handle || "all"}`;
    }
    return `/pages/${handle}`;
  }

  // If we can't determine clearly, don't add a prefix - safer to return empty
  // to prevent navigating to non-existent pages
  return "";
}

// Helper function to find the main blog handle for generic blog queries
function findMainBlogHandle(data: any): string | null {
  // First check in mainContent for blogs
  if (data.mainContent && Array.isArray(data.mainContent)) {
    // Look for blog posts and collect their blog handles
    const blogHandles = new Set<string>();

    for (const item of data.mainContent) {
      if (item.type === "post" && item.blogHandle) {
        blogHandles.add(item.blogHandle);
      }
    }

    // Return the first blog handle found
    if (blogHandles.size > 0) {
      return Array.from(blogHandles)[0];
    }
  }

  // Check in relevantQAs for blog URLs
  if (data.relevantQAs && Array.isArray(data.relevantQAs)) {
    const blogHandles = new Set<string>();

    for (const qa of data.relevantQAs) {
      if (qa.url) {
        const urlParts = qa.url.split("/");
        // Check for URLs with structure /blogs/blogHandle or /blogs/blogHandle/postHandle
        if (urlParts.length >= 3 && urlParts[1] === "blogs") {
          blogHandles.add(urlParts[2]);
        }
      }
    }

    if (blogHandles.size > 0) {
      return Array.from(blogHandles)[0];
    }
  }

  // Check page data if available
  if (data.pageData) {
    // Look for blog URLs in the full text
    if (data.pageData.full_text) {
      const blogUrlRegex = /\/blogs\/([^\/]+)/i;
      const match = data.pageData.full_text.match(blogUrlRegex);
      if (match && match[1]) {
        return match[1];
      }
    }
  }

  return null;
}

// Helper function to find the blog handle for a post
function findBlogHandleForPost(data: any, postHandle: string): string | null {
  // First check in mainContent for blog posts
  if (data.mainContent && Array.isArray(data.mainContent)) {
    for (const item of data.mainContent) {
      if (
        item.type === "post" &&
        item.handle === postHandle &&
        item.blogHandle
      ) {
        return item.blogHandle;
      }
    }
  }

  // Check in relevantQAs for blog post URLs
  if (data.relevantQAs && Array.isArray(data.relevantQAs)) {
    for (const qa of data.relevantQAs) {
      if (qa.url) {
        const urlParts = qa.url.split("/");
        // Check for URLs with structure /blogs/blogHandle/postHandle
        if (
          urlParts.length >= 4 &&
          urlParts[1] === "blogs" &&
          urlParts[3] === postHandle
        ) {
          return urlParts[2];
        }
      }

      // Also check answer content for blog URLs
      if (qa.answer) {
        const blogUrlRegex = new RegExp(
          `\\/blogs\\/([^\\/]+)\\/${postHandle}`,
          "i"
        );
        const match = qa.answer.match(blogUrlRegex);
        if (match && match[1]) {
          return match[1];
        }
      }
    }
  }

  // Check page data if available
  if (data.pageData) {
    // Look for blog URLs in the full text
    if (data.pageData.full_text) {
      const blogUrlRegex = new RegExp(
        `\\/blogs\\/([^\\/]+)\\/${postHandle}`,
        "i"
      );
      const match = data.pageData.full_text.match(blogUrlRegex);
      if (match && match[1]) {
        return match[1];
      }
    }
  }

  return null;
}

// New helper function to verify if a URL exists in the available data
function verifyUrlExists(url: string, availableData: any): boolean {
  // Always return true - validation disabled
  return true;
}

// Helper function to check if a URL appears in page data
function hasUrlInPageData(urlToFind: string, availableData: any): boolean {
  if (!availableData || !availableData.pageData) return false;

  // Check for URL in links
  if (
    availableData.pageData.links &&
    Array.isArray(availableData.pageData.links)
  ) {
    for (const link of availableData.pageData.links) {
      if (link.url && link.url.includes(urlToFind)) return true;
    }
  }

  // Check for URL in sections
  if (
    availableData.pageData.sections &&
    Array.isArray(availableData.pageData.sections)
  ) {
    for (const section of availableData.pageData.sections) {
      if (section.links && Array.isArray(section.links)) {
        for (const link of section.links) {
          if (link.url && link.url.includes(urlToFind)) return true;
        }
      }

      // Check in text snippets
      if (section.text_snippet && section.text_snippet.includes(urlToFind))
        return true;
    }
  }

  // Check the full text
  if (
    availableData.pageData.full_text &&
    availableData.pageData.full_text.includes(urlToFind)
  ) {
    return true;
  }

  // Check in context for mainContent
  if (availableData.mainContent && Array.isArray(availableData.mainContent)) {
    for (const item of availableData.mainContent) {
      // Check item properties for anything that might contain a URL
      if (item.url && item.url.includes(urlToFind)) return true;
      if (item.handle === urlToFind.split("/").pop()) return true;
    }
  }

  // Check in context for relevantQAs
  if (availableData.relevantQAs && Array.isArray(availableData.relevantQAs)) {
    for (const qa of availableData.relevantQAs) {
      if (qa.url && qa.url.includes(urlToFind)) return true;
      if (qa.answer && qa.answer.includes(urlToFind)) return true;
      if (qa.question && qa.question.includes(urlToFind)) return true;
    }
  }

  return false;
}

// Helper function to extract handles from available data
// Enhanced function to extract all available handles from available data
function getAllAvailableHandles(data: any): {
  collections: string[];
  products: string[];
  pages: string[];
  posts: string[];
  blogs: string[];
} {
  const handles = {
    collections: [] as string[],
    products: [] as string[],
    pages: [] as string[],
    posts: [] as string[],
    blogs: [] as string[],
  };

  if (!data) return handles;

  // Extract from mainContent if available
  if (data.mainContent && Array.isArray(data.mainContent)) {
    data.mainContent.forEach((item: any) => {
      if (item.handle) {
        switch (item.type) {
          case "collection":
            if (!handles.collections.includes(item.handle)) {
              handles.collections.push(item.handle);
            }
            break;
          case "product":
            if (!handles.products.includes(item.handle)) {
              handles.products.push(item.handle);
            }
            break;
          case "page":
            if (!handles.pages.includes(item.handle)) {
              handles.pages.push(item.handle);
            }
            break;
          case "post":
            if (!handles.posts.includes(item.handle)) {
              handles.posts.push(item.handle);
            }
            break;
        }
      }
    });
  }

  // Extract from relevantQAs if available
  if (data.relevantQAs && Array.isArray(data.relevantQAs)) {
    data.relevantQAs.forEach((item: any) => {
      if (item.url) {
        const urlParts = item.url.split("/");
        for (let i = 0; i < urlParts.length - 1; i++) {
          const segment = urlParts[i];
          const handle = urlParts[i + 1];
          if (handle && segment) {
            switch (segment) {
              case "collections":
                if (!handles.collections.includes(handle)) {
                  handles.collections.push(handle);
                }
                break;
              case "products":
                if (!handles.products.includes(handle)) {
                  handles.products.push(handle);
                }
                break;
              case "pages":
                if (!handles.pages.includes(handle)) {
                  handles.pages.push(handle);
                }
                break;
              case "blogs":
                // For blogs, the handle after /blogs/ is the blog handle, not post handle
                if (!handles.blogs.includes(handle)) {
                  handles.blogs.push(handle);
                }
                // If there's a third segment after /blogs/bloghandle/, that's the post handle
                if (
                  urlParts[i + 2] &&
                  !handles.posts.includes(urlParts[i + 2])
                ) {
                  handles.posts.push(urlParts[i + 2]);
                }
                break;
            }
          }
        }
      }
    });
  }

  // Extract from pageData if available
  if (data.pageData && data.pageData.full_text) {
    // Look for URLs in the form of /collections/handle, /products/handle, etc.
    const urlPatterns = [
      { regex: /\/collections\/([a-z0-9-]+)/g, type: "collections" },
      { regex: /\/products\/([a-z0-9-]+)/g, type: "products" },
      { regex: /\/pages\/([a-z0-9-]+)/g, type: "pages" },
      { regex: /\/blogs\/([a-z0-9-]+)\/([a-z0-9-]+)/g, type: "blogs_posts" },
      { regex: /\/blogs\/([a-z0-9-]+)/g, type: "blogs" },
    ];

    urlPatterns.forEach(({ regex, type }) => {
      let match;
      while ((match = regex.exec(data.pageData.full_text)) !== null) {
        if (type === "blogs_posts" && match[1] && match[2]) {
          // Blog handle is match[1], post handle is match[2]
          if (!handles.blogs.includes(match[1])) {
            handles.blogs.push(match[1]);
          }
          if (!handles.posts.includes(match[2])) {
            handles.posts.push(match[2]);
          }
        } else if (match[1] && type !== "blogs_posts") {
          const handleArray = handles[type as keyof typeof handles];
          if (Array.isArray(handleArray) && !handleArray.includes(match[1])) {
            handleArray.push(match[1]);
          }
        }
      }
    });
  }

  return handles;
}

// Simple fuzzy matching function to find closest handle
function findClosestHandle(
  target: string,
  handles: string[]
): { handle: string; score: number } | null {
  if (!target || handles.length === 0) return null;

  let bestMatch = null;
  let bestScore = 0;

  const targetLower = target.toLowerCase();

  for (const handle of handles) {
    const handleLower = handle.toLowerCase();

    // Exact match gets highest score
    if (targetLower === handleLower) {
      return { handle, score: 1.0 };
    }

    // Calculate similarity score
    let score = 0;

    // Check if target is contained in handle or vice versa
    if (handleLower.includes(targetLower)) {
      score = (targetLower.length / handleLower.length) * 0.8;
    } else if (targetLower.includes(handleLower)) {
      score = (handleLower.length / targetLower.length) * 0.8;
    } else {
      // Calculate simple character overlap
      const targetChars = new Set(targetLower.split(""));
      const handleChars = new Set(handleLower.split(""));
      const intersection = new Set(
        Array.from(targetChars).filter((x) => handleChars.has(x))
      );
      score =
        (intersection.size / Math.max(targetChars.size, handleChars.size)) *
        0.5;
    }

    // Boost score if words match
    const targetWords = targetLower.split(/[-_\s]+/);
    const handleWords = handleLower.split(/[-_\s]+/);
    const wordMatches = targetWords.filter((word) =>
      handleWords.some((hw) => hw.includes(word) || word.includes(hw))
    );
    if (wordMatches.length > 0) {
      score += (wordMatches.length / targetWords.length) * 0.3;
    }

    if (score > bestScore && score > 0.3) {
      // Minimum threshold
      bestScore = score;
      bestMatch = handle;
    }
  }

  return bestMatch ? { handle: bestMatch, score: bestScore } : null;
}

// Enhanced URL validation function
function validateAndFixUrl(
  url: string,
  queryText: string,
  classification: QuestionClassification | null,
  availableData: any
): string {
  if (!url || !availableData) return "";

  const allHandles = getAllAvailableHandles(availableData);
  const queryLower = queryText.toLowerCase();

  // Extract the intended handle from the URL
  let intendedHandle = "";
  let urlType = "";

  // Parse the URL to understand what the AI is trying to redirect to
  if (url.startsWith("/collections/")) {
    urlType = "collection";
    intendedHandle = url.split("/collections/")[1]?.split("/")[0] || "";
  } else if (url.startsWith("/products/")) {
    urlType = "product";
    intendedHandle = url.split("/products/")[1]?.split("/")[0] || "";
  } else if (url.startsWith("/pages/")) {
    urlType = "page";
    intendedHandle = url.split("/pages/")[1]?.split("/")[0] || "";
  } else if (url.startsWith("/blogs/")) {
    const parts = url.split("/blogs/")[1]?.split("/") || [];
    if (parts.length === 1) {
      // Just /blogs/handle - this is a blog main page
      urlType = "blog";
      intendedHandle = parts[0];
    } else if (parts.length >= 2) {
      // /blogs/bloghandle/posthandle - this is a blog post
      urlType = "post";
      intendedHandle = parts[1]; // The post handle
    }
  } else if (url.startsWith("/policies/")) {
    // Policies don't have dynamic handles, so validate against known policy terms
    const policyTerms = [
      "privacy-policy",
      "return-policy",
      "refund-policy",
      "contact-information",
      "terms-of-service",
      "shipping-policy",
    ];
    const handle = url.split("/policies/")[1]?.split("/")[0] || "";
    if (policyTerms.some((term) => handle.includes(term))) {
      return url; // Valid policy URL
    }
    return ""; // Invalid policy URL
  } else {
    // Handle other formats or extract handle from end
    const urlParts = url.split("/").filter(Boolean);
    intendedHandle = urlParts[urlParts.length - 1] || "";

    // Try to infer type from query or classification
    if (queryLower.includes("product") || classification?.type === "product") {
      urlType = "product";
    } else if (
      queryLower.includes("collection") ||
      classification?.type === "collection"
    ) {
      urlType = "collection";
    } else if (queryLower.includes("blog") || classification?.type === "post") {
      urlType = "post";
    } else if (classification?.type) {
      urlType = classification.type;
    }
  }

  // Special case: Shopify's all-products collection
  if (url === "/collections/all") {
    return "/collections/all";
  }

  if (!intendedHandle) {
    console.log("No handle extracted from URL:", url);
    return "";
  }

  // Find the best matching handle based on the intended type
  let availableHandlesForType: string[] = [];
  let correctUrlPrefix = "";

  switch (urlType) {
    case "collection":
      availableHandlesForType = allHandles.collections;
      correctUrlPrefix = "/collections/";
      break;
    case "product":
      availableHandlesForType = allHandles.products;
      correctUrlPrefix = "/products/";
      break;
    case "page":
      availableHandlesForType = allHandles.pages;
      correctUrlPrefix = "/pages/";
      break;
    case "blog":
      availableHandlesForType = allHandles.blogs;
      correctUrlPrefix = "/blogs/";
      break;
    case "post":
      availableHandlesForType = allHandles.posts;
      // For posts, we need to find the blog handle too
      break;
    default:
      // Try all types to find a match
      const allAvailableHandles = [
        ...allHandles.collections,
        ...allHandles.products,
        ...allHandles.pages,
        ...allHandles.posts,
        ...allHandles.blogs,
      ];
      availableHandlesForType = allAvailableHandles;
  }

  // Find the closest matching handle
  const match = findClosestHandle(intendedHandle, availableHandlesForType);

  if (!match) {
    console.log(
      `No matching handle found for "${intendedHandle}" of type "${urlType}"`
    );
    return "";
  }

  console.log(
    `Found matching handle "${match.handle}" for "${intendedHandle}" with score ${match.score}`
  );

  // If we don't have a specific type determined yet, figure out what type the matched handle is
  if (!correctUrlPrefix) {
    if (allHandles.collections.includes(match.handle)) {
      correctUrlPrefix = "/collections/";
    } else if (allHandles.products.includes(match.handle)) {
      correctUrlPrefix = "/products/";
    } else if (allHandles.pages.includes(match.handle)) {
      correctUrlPrefix = "/pages/";
    } else if (allHandles.blogs.includes(match.handle)) {
      correctUrlPrefix = "/blogs/";
    } else if (allHandles.posts.includes(match.handle)) {
      // For posts, we need to find the associated blog handle
      const blogHandle = findBlogHandleForPost(availableData, match.handle);
      if (blogHandle) {
        return `/blogs/${blogHandle}/${match.handle}`;
      }
      console.log(`Could not find blog handle for post "${match.handle}"`);
      return "";
    }
  }

  // Handle special case for blog posts
  if (urlType === "post") {
    const blogHandle = findBlogHandleForPost(availableData, match.handle);
    if (blogHandle) {
      return `/blogs/${blogHandle}/${match.handle}`;
    }
    console.log(`Could not find blog handle for post "${match.handle}"`);
    return "";
  }

  // Return the corrected URL
  return `${correctUrlPrefix}${match.handle}`;
}

function extractHandles(data: any, type: string): string[] {
  const handles: string[] = [];

  // Extract from mainContent if available
  if (data.mainContent && Array.isArray(data.mainContent)) {
    data.mainContent.forEach((item: any) => {
      if (item.type === type && item.handle) {
        handles.push(item.handle);
      }
    });
  }

  // Extract from relevantQAs if available
  if (data.relevantQAs && Array.isArray(data.relevantQAs)) {
    data.relevantQAs.forEach((item: any) => {
      // Check URLs in QAs for handles
      if (item.url) {
        const urlParts = item.url.split("/");
        const typeIndicator = urlParts.findIndex(
          (part: string) =>
            part === "collections" ||
            part === "products" ||
            part === "pages" ||
            part === "blogs"
        );

        if (
          typeIndicator !== -1 &&
          urlParts[typeIndicator] === getUrlPrefixForType(type) &&
          urlParts[typeIndicator + 1]
        ) {
          handles.push(urlParts[typeIndicator + 1]);
        }
      }

      // Also check answer content for potential product or collection names
      if (item.answer) {
        const answer = item.answer.toLowerCase();
        const possibleHandleMatches =
          answer.match(/[a-z0-9]+-[a-z0-9-]+/g) || [];
        for (const match of possibleHandleMatches) {
          if (!handles.includes(match)) {
            handles.push(match);
          }
        }
      }
    });
  }

  // Extract from page data if available
  if (data.pageData) {
    // Try to extract handles from links in sections
    if (data.pageData.sections && Array.isArray(data.pageData.sections)) {
      data.pageData.sections.forEach((section: any) => {
        if (section.links && Array.isArray(section.links)) {
          section.links.forEach((link: any) => {
            if (link.url) {
              const urlParts = link.url.split("/");
              const typeIndicator = urlParts.findIndex(
                (part: string) =>
                  part === "collections" ||
                  part === "products" ||
                  part === "pages" ||
                  part === "blogs"
              );

              if (
                typeIndicator !== -1 &&
                urlParts[typeIndicator] === getUrlPrefixForType(type) &&
                urlParts[typeIndicator + 1]
              ) {
                handles.push(urlParts[typeIndicator + 1]);
              }
            }
          });
        }

        // Extract handles from text snippets - look for URLs in the form of /collections/handle, etc.
        if (section.text_snippet) {
          const regex = new RegExp(
            `\\/${getUrlPrefixForType(type)}\\/([a-z0-9-]+)`,
            "g"
          );
          let match;
          while ((match = regex.exec(section.text_snippet)) !== null) {
            if (match[1] && !handles.includes(match[1])) {
              handles.push(match[1]);
            }
          }
        }
      });
    }

    // Extract from full text if available
    if (data.pageData.full_text) {
      // Look for URLs in the form of /collections/handle, etc.
      const regex = new RegExp(
        `\\/${getUrlPrefixForType(type)}\\/([a-z0-9-]+)`,
        "g"
      );
      let match;
      while ((match = regex.exec(data.pageData.full_text)) !== null) {
        if (match[1] && !handles.includes(match[1])) {
          handles.push(match[1]);
        }
      }
    }
  }

  return handles;
}

// Helper function to get URL prefix for content type
function getUrlPrefixForType(type: string): string {
  switch (type) {
    case "collection":
      return "collections";
    case "product":
      return "products";
    case "page":
      return "pages";
    case "post":
      return "blogs";
    default:
      return "";
  }
}

// Helper function to find policy pages in available data
function findPolicyPage(availableData: any, policyType: string): string | null {
  // Look for policy URLs in mainContent
  if (availableData.mainContent && Array.isArray(availableData.mainContent)) {
    for (const item of availableData.mainContent) {
      if (item.handle && item.handle.includes(policyType)) {
        return `/policies/${item.handle}`;
      }
    }
  }

  // Look for policy URLs in relevantQAs
  if (availableData.relevantQAs && Array.isArray(availableData.relevantQAs)) {
    for (const qa of availableData.relevantQAs) {
      if (qa.url && qa.url.includes(policyType)) {
        return qa.url;
      }
    }
  }

  // Check in pageData if available
  if (availableData.pageData) {
    // Look for links containing policy names
    if (
      availableData.pageData.links &&
      Array.isArray(availableData.pageData.links)
    ) {
      for (const link of availableData.pageData.links) {
        if (link.url && link.url.includes(policyType)) {
          return link.url;
        }
      }
    }

    // Look for policy mentions in full text
    if (availableData.pageData.full_text) {
      const policyUrlRegex = new RegExp(
        `\\/(?:policies|pages)\\/[\\w-]*${policyType}[\\w-]*`,
        "i"
      );
      const match = availableData.pageData.full_text.match(policyUrlRegex);
      if (match && match[0]) {
        // Format correctly as a policy URL
        const handle = match[0].split("/").pop();
        return `/policies/${handle}`;
      }
    }
  }

  return null;
}

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  console.log("Shopify chat POST received at:", new Date().toISOString());
  console.log("POST Request URL:", request.url);
  console.log("POST Request method:", request.method);
  console.log(
    "POST Request headers:",
    Object.fromEntries(request.headers.entries())
  );

  let body: {
    message: string;
    websiteId?: string;
    accessKey?: string;
    threadId?: string;
    type: "text" | "voice";
    interactionType?: string;
    pastContext?: PreviousContext[];
    previousResponseId?: string;
    responseId?: string;
    currentPageUrl?: string;
    pageData?: {
      url: string;
      full_text: string;
      buttons: Array<{ id: string; text: string }>;
      forms: Array<{
        id: string;
        inputs: Array<{ name: string; type: string; value: string }>;
        selects: Array<{
          name: string;
          options: Array<{ value: string; text: string }>;
        }>;
      }>;
      sections: Array<{ id: string; tag: string; text_snippet: string }>;
      images: Array<{ src: string; alt: string }>;
    };
  } = {
    message: "",
    type: "text",
  };

  let website: WebsiteWithAutoSettings | null = null;
  const t0 = Date.now();
  const timeMarks: Record<string, number> = {};

  try {
    // Clone the request before reading it so we can log the raw body
    const clonedRequest = request.clone();
    let rawBody = "";
    try {
      rawBody = await clonedRequest.text();
      console.log("Raw request body:", rawBody);
    } catch (e) {
      console.error("Error reading raw body:", e);
    }

    // Parse request body
    const parsedBody = await request.json();
    body = {
      ...parsedBody,
      type: (parsedBody.type as "text" | "voice") || "text",
    };

    const {
      message,
      websiteId,
      accessKey,
      threadId,
      type,
      pastContext,
      previousResponseId,
      responseId,
      currentPageUrl,
      pageData,
      interactionType,
    } = body;

    const currentResponseId = responseId || crypto.randomUUID();

    console.log("Received interaction type:", interactionType);

    console.log("Past Context:", pastContext);

    if (!message) {
      return cors(
        request,
        NextResponse.json(
          { error: "Missing required field: message" },
          { status: 400 }
        )
      );
    }

    // Validate we have either websiteId or accessKey
    if (!websiteId && !accessKey) {
      return cors(
        request,
        NextResponse.json(
          { error: "Either websiteId or accessKey must be provided" },
          { status: 400 }
        )
      );
    }

    // Get website either by ID or access key with plan, query info, and auto-allow settings
    try {
      if (websiteId) {
        const rows = (await query(
          `SELECT id, url, plan, monthlyQueries, customInstructions,
                  allowAutoCancel, allowAutoReturn, allowAutoExchange,
                  allowAutoClick, allowAutoScroll, allowAutoHighlight,
                  allowAutoRedirect, allowAutoGetUserOrders, allowAutoUpdateUserInfo,
                  allowAutoFillForm, allowAutoTrackOrder, allowAutoLogout,
                  allowAutoLogin, allowAutoGenerateImage, newAiSynced,
                  stripeSubscriptionId, stripeSubscriptionItemId
           FROM Website WHERE id = ? LIMIT 1`,
          [websiteId]
        )) as any[];
        website = rows[0];
      } else if (accessKey) {
        const rows = (await query(
          `SELECT w.id, w.url, w.plan, w.monthlyQueries, w.customInstructions,
                  w.allowAutoCancel, w.allowAutoReturn, w.allowAutoExchange,
                  w.allowAutoClick, w.allowAutoScroll, w.allowAutoHighlight,
                  w.allowAutoRedirect, w.allowAutoGetUserOrders, w.allowAutoUpdateUserInfo,
                  w.allowAutoFillForm, w.allowAutoTrackOrder, w.allowAutoLogout,
                  w.allowAutoLogin, w.allowAutoGenerateImage, w.newAiSynced,
                  w.stripeSubscriptionId, w.stripeSubscriptionItemId
           FROM Website w
           JOIN AccessKey ak ON ak.websiteId = w.id
            WHERE ak.\`key\` = ?
           LIMIT 1`,
          [accessKey]
        )) as any[];
        website = rows[0];
      }
    } catch (error) {
      console.error("Database connection error:", error);
      return cors(
        request,
        NextResponse.json(
          {
            error: "Database connection error. Please try again.",
            details: error instanceof Error ? error.message : "Unknown error",
          },
          { status: 503 }
        )
      );
    }

    if (!website) {
      return cors(
        request,
        NextResponse.json(
          { error: "Website not found with provided ID or access key" },
          { status: 404 }
        )
      );
    }

    // Diagnostic: log auto-action flags to verify runtime values
    try {
      console.log("Website auto flags:", {
        id: (website as any).id,
        url: (website as any).url,
        plan: (website as any).plan,
        allowAutoReturn: (website as any).allowAutoReturn,
        allowAutoExchange: (website as any).allowAutoExchange,
        allowAutoCancel: (website as any).allowAutoCancel,
      });
    } catch (e) {
      console.warn("Failed to log website auto flags", e);
    }

    // Billing will be handled after thread creation (helper function moved to top level)

    // Special handling for Beta plan - billing will be done after thread creation
    if (website.plan === "Beta") {
      // Beta plan billing will be handled after thread creation
    } else {
      // Check query limits based on plan
      const queryLimit = 100; // Starter plan limit is now 100 queries
      if (
        website.monthlyQueries >= queryLimit &&
        website.plan !== "Enterprise"
      ) {
        // Before returning an error, try to auto-upgrade to Enterprise plan if approaching limit
        if (website.stripeSubscriptionId) {
          try {
            const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
            const enterprisePriceId = process.env.STRIPE_ENTERPRISE_PRICE_ID;

            if (enterprisePriceId) {
              // Retrieve the subscription
              const subscription = await stripe.subscriptions.retrieve(
                website.stripeSubscriptionId
              );

              // Update subscription to Enterprise plan
              const updated = await stripe.subscriptions.update(
                website.stripeSubscriptionId,
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

              // Update website with Enterprise plan and subscription item ID
              await query(
                `UPDATE Website SET plan = 'Enterprise', stripeSubscriptionItemId = ? WHERE id = ?`,
                [updated.items.data[0].id, website.id]
              );

              // Update the website object in memory so rest of request processing works
              website.plan = "Enterprise";
              website.stripeSubscriptionItemId = updated.items.data[0].id;

              console.log("Successfully auto-upgraded to Enterprise plan:", {
                websiteId: website.id,
                subscriptionId: website.stripeSubscriptionId,
              });

              // Continue processing since we've upgraded
            }
          } catch (error) {
            console.error("Failed to auto-upgrade to Enterprise plan:", error);

            // If upgrade fails, then return the error response
            const errorMessage =
              "You have reached your monthly query limit of 1000. Auto-upgrade to Enterprise plan failed.";

            return cors(
              request,
              NextResponse.json(
                {
                  response: {
                    action: "none",
                    answer: errorMessage,
                    category: "discovery",
                    pageId: "error",
                    pageTitle: "Error",
                    question: message,
                    scrollText: "",
                    subcategory: "content_overview",
                    type: type,
                    url: website.url,
                  },
                  threadId: threadId || crypto.randomUUID(),
                  context: {
                    mainContent: null,
                    relevantQAs: [],
                  },
                  success: false,
                  error: true,
                  errorMessage,
                },
                { status: 429 }
              )
            );
          }
        } else {
          // If no subscription ID, just return the error
          const errorMessage =
            "You have reached your monthly query limit of 1000. Please upgrade to Enterprise plan for unlimited queries.";

          return cors(
            request,
            NextResponse.json(
              {
                response: {
                  action: "none",
                  answer: errorMessage,
                  category: "discovery",
                  pageId: "error",
                  pageTitle: "Error",
                  question: message,
                  scrollText: "",
                  subcategory: "content_overview",
                  type: type,
                  url: website.url,
                },
                threadId: threadId || crypto.randomUUID(),
                context: {
                  mainContent: null,
                  relevantQAs: [],
                },
                success: false,
                error: true,
                errorMessage,
              },
              { status: 429 }
            )
          );
        }
      }
    }

    // Check if message contains order-related actions keywords before expensive operations
    const messageHasCancelOrder =
      message.toLowerCase().includes("cancel") &&
      message.toLowerCase().includes("order");
    const messageHasReturnOrder =
      message.toLowerCase().includes("return") &&
      message.toLowerCase().includes("order");
    const messageHasExchangeOrder =
      message.toLowerCase().includes("exchange") &&
      message.toLowerCase().includes("order");
    const messageHasRefundRequest =
      message.toLowerCase().includes("refund") &&
      (message.toLowerCase().includes("order") ||
        message.toLowerCase().includes("item"));
    const messageHasGenerateImage =
      message.toLowerCase().includes("generate") &&
      message.toLowerCase().includes("image");

    // Only convert refund requests to contact (per prompt rules)
    if (messageHasRefundRequest) {
      const response = {
        action: "contact",
        answer:
          "I'll connect you with our customer service team to process your refund request. Could you provide your order number and any relevant details?",
        category: "discovery",
        pageId: "chat",
        pageTitle: "Chat",
        question: message,
        scrollText: "",
        subcategory: "content_overview",
        type: type,
        url: website.url,
        action_context: {
          contact_help_form: true,
          message: `User is requesting a refund for an order.`,
        },
      };

      return cors(
        request,
        NextResponse.json({
          response,
          threadId: threadId || crypto.randomUUID(),
          context: {
            mainContent: null,
            relevantQAs: [],
          },
          success: true,
        })
      );
    }

    // Check auto-allow permissions and return early if needed
    if (messageHasCancelOrder && !website.allowAutoCancel) {
      return handleDisabledAction(
        request,
        website,
        message,
        type,
        threadId,
        "cancel orders",
        "cancel_order"
      );
    }

    if (messageHasReturnOrder && !website.allowAutoReturn) {
      return handleDisabledAction(
        request,
        website,
        message,
        type,
        threadId,
        "process returns",
        "return_order"
      );
    }

    if (messageHasExchangeOrder && !website.allowAutoExchange) {
      return handleDisabledAction(
        request,
        website,
        message,
        type,
        threadId,
        "process exchanges",
        "exchange_order"
      );
    }

    if (messageHasGenerateImage && !website.allowAutoGenerateImage) {
      return handleComingSoonAction(
        request,
        website,
        message,
        type,
        threadId,
        "generate images",
        "generate_image"
      );
    }

    // Check for login/logout related messages
    const messageHasLogin =
      message.toLowerCase().includes("login") ||
      message.toLowerCase().includes("sign in");
    const messageHasLogout =
      message.toLowerCase().includes("logout") ||
      message.toLowerCase().includes("sign out");

    if (messageHasLogin && !website.allowAutoLogin) {
      return handleUnsupportedAction(
        request,
        website,
        message,
        type,
        threadId,
        "login",
        "login"
      );
    }

    if (messageHasLogout && !website.allowAutoLogout) {
      return handleUnsupportedAction(
        request,
        website,
        message,
        type,
        threadId,
        "logout",
        "logout"
      );
    }

    // Check for order tracking and management
    const messageHasTrackOrder =
      message.toLowerCase().includes("track") &&
      message.toLowerCase().includes("order");
    const messageHasGetOrders =
      (message.toLowerCase().includes("get") ||
        message.toLowerCase().includes("view") ||
        message.toLowerCase().includes("see") ||
        message.toLowerCase().includes("my")) &&
      message.toLowerCase().includes("orders");

    if (messageHasTrackOrder && !website.allowAutoTrackOrder) {
      return handleUnsupportedAction(
        request,
        website,
        message,
        type,
        threadId,
        "track orders",
        "track_order"
      );
    }

    if (messageHasGetOrders && !website.allowAutoGetUserOrders) {
      return handleUnsupportedAction(
        request,
        website,
        message,
        type,
        threadId,
        "access your orders",
        "get_orders"
      );
    }

    // Check for account update messages
    const messageHasUpdateInfo =
      (message.toLowerCase().includes("update") ||
        message.toLowerCase().includes("change") ||
        message.toLowerCase().includes("edit")) &&
      (message.toLowerCase().includes("account") ||
        message.toLowerCase().includes("profile") ||
        message.toLowerCase().includes("information") ||
        message.toLowerCase().includes("details"));

    if (messageHasUpdateInfo && !website.allowAutoUpdateUserInfo) {
      return handleUnsupportedAction(
        request,
        website,
        message,
        type,
        threadId,
        "update account information",
        "account_management"
      );
    }

    // Billing will be handled after thread creation

    // Enterprise billing will be handled after thread creation
    if (website.monthlyQueries >= 1000) {
      // Auto-upgrade to Enterprise plan
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
        const enterprisePriceId = process.env.STRIPE_ENTERPRISE_PRICE_ID;

        if (enterprisePriceId && website.stripeSubscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(
            website.stripeSubscriptionId
          );
          const updated = await stripe.subscriptions.update(
            website.stripeSubscriptionId,
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

          // Update website with Enterprise plan and subscription item ID
          // Do NOT reset monthlyQueries - keep tracking them for analytics
          await query(
            `UPDATE Website SET plan = 'Enterprise', stripeSubscriptionItemId = ?, queryLimit = 0 WHERE id = ?`,
            [updated.items.data[0].id, website.id]
          );

          // Update the website object in memory to reflect the changes
          website.plan = "Enterprise";
          website.stripeSubscriptionItemId = updated.items.data[0].id;
          website.queryLimit = 0;
        }
      } catch (error) {
        console.error("Failed to upgrade to Enterprise plan:", error);
      }
    }

    // Get or create thread
    let aiThread: ThreadWithMessages;
    if (threadId) {
      console.log(`Looking for thread with ID: ${threadId}`);
      console.log(`Website ID: ${website.id}`);

      // First try to find by direct query to debug
      const threadByIdRows = (await query(
        `SELECT id FROM AiThread WHERE id = ? LIMIT 1`,
        [threadId]
      )) as { id: string }[];
      const threadById = threadByIdRows.length > 0 ? threadByIdRows[0] : null;
      console.log(`Thread found by id: ${threadById ? "YES" : "NO"}`);

      const threadByThreadIdRows = (await query(
        `SELECT id, threadId FROM AiThread WHERE threadId = ? LIMIT 1`,
        [threadId]
      )) as { id: string; threadId: string }[];
      const threadByThreadId =
        threadByThreadIdRows.length > 0 ? threadByThreadIdRows[0] : null;
      console.log(
        `Thread found by threadId: ${threadByThreadId ? "YES" : "NO"}`
      );

      // Now try the combined query
      const aiThreadRows = (await query(
        `SELECT id, threadId, websiteId, title, createdAt, lastMessageAt
         FROM AiThread
         WHERE (id = ? OR threadId = ?) AND websiteId = ?
         LIMIT 1`,
        [threadId, threadId, website.id]
      )) as any[];
      const baseThread = aiThreadRows[0];
      let messages: any[] = [];
      if (baseThread) {
        messages = (await query(
          `SELECT id, threadId, role, content, pageUrl, scrollToText, createdAt, type
           FROM AiMessage
           WHERE threadId = ?
           ORDER BY createdAt DESC
           LIMIT 4`,
          [baseThread.id]
        )) as any[];
        aiThread = {
          ...baseThread,
          title: baseThread.title ?? null,
          messages,
        } as ThreadWithMessages;
      } else {
        aiThread = undefined as any;
      }

      console.log(`Combined query found thread: ${aiThread ? "YES" : "NO"}`);
      if (aiThread) {
        console.log(
          `Thread ID: ${aiThread.id}, ThreadId: ${aiThread.threadId}`
        );
      }

      if (!aiThread) {
        console.log(`Thread not found with either id or threadId: ${threadId}`);
        console.log(`Creating new thread instead of returning 404...`);

        // Create new thread with a new UUID for id and the provided threadId
        try {
          const newId = crypto.randomUUID();
          await query(
            `INSERT INTO AiThread (id, threadId, websiteId, createdAt, lastMessageAt)
             VALUES (?, ?, ?, NOW(), NOW())`,
            [newId, threadId, website.id]
          );
          aiThread = {
            id: newId,
            threadId,
            websiteId: website.id,
            title: null,
            createdAt: new Date(),
            lastMessageAt: new Date(),
            messages: [],
          } as ThreadWithMessages;
          console.log(
            `Created new thread with ID: ${aiThread.id} and ThreadId: ${aiThread.threadId}`
          );
        } catch (error) {
          console.error(`Error creating thread: ${error}`);
          return cors(
            request,
            NextResponse.json(
              { error: "Thread not found and could not create new thread" },
              { status: 404 }
            )
          );
        }
      }
    } else {
      // Create new thread
      const newId = crypto.randomUUID();
      const newThreadId = crypto.randomUUID();
      await query(
        `INSERT INTO AiThread (id, threadId, websiteId, createdAt, lastMessageAt)
         VALUES (?, ?, ?, NOW(), NOW())`,
        [newId, newThreadId, website.id]
      );
      aiThread = {
        id: newId,
        threadId: newThreadId,
        websiteId: website.id,
        title: null,
        createdAt: new Date(),
        lastMessageAt: new Date(),
        messages: [],
      } as ThreadWithMessages;
    }

    // Per-thread billing: Check if this is the first user message in the thread
    const isFirstMessage = await isFirstUserMessageInThread(aiThread.id);
    let shouldBillForStripe = false;

    console.log(`🔍 Billing Debug - Thread ID: ${aiThread.id}`);
    console.log(`🔍 Billing Debug - Website ID: ${website.id}`);
    console.log(`🔍 Billing Debug - Website Plan: ${website.plan}`);
    console.log(`🔍 Billing Debug - Is First Message: ${isFirstMessage}`);
    console.log(
      `🔍 Billing Debug - Current Monthly Queries: ${website.monthlyQueries}`
    );

    if (website.plan === "Beta") {
      // Beta plan uses per-thread billing
      if (isFirstMessage) {
        console.log(
          `🔍 Billing Debug - About to increment monthly queries for Beta plan`
        );
        await query(
          `UPDATE Website SET monthlyQueries = monthlyQueries + 1 WHERE id = ?`,
          [website.id]
        );
        console.log(
          `🔍 Billing Debug - After update, incremented monthly queries`
        );
        shouldBillForStripe = true;
        console.log(
          `💰 Billing (Beta): First message in thread ${aiThread.id} - incrementing monthly queries`
        );
      } else {
        console.log(
          `💰 Billing (Beta): Follow-up message in thread ${aiThread.id} - no additional charge`
        );
      }
    } else {
      // Non-Beta plans also use per-thread billing
      if (isFirstMessage) {
        console.log(
          `🔍 Billing Debug - About to increment monthly queries for ${website.plan} plan`
        );
        await query(
          `UPDATE Website SET monthlyQueries = monthlyQueries + 1 WHERE id = ?`,
          [website.id]
        );
        console.log(
          `🔍 Billing Debug - After update, incremented monthly queries`
        );
        shouldBillForStripe = true;
        console.log(
          `💰 Billing: First message in thread ${aiThread.id} - incrementing monthly queries`
        );
      } else {
        console.log(
          `💰 Billing: Follow-up message in thread ${aiThread.id} - no additional charge`
        );
      }
    }

    // Stripe billing for all plans with subscription IDs
    console.log(
      `🔍 Stripe Debug - Plan: ${website.plan}, Should Bill: ${shouldBillForStripe}`
    );
    console.log(
      `🔍 Stripe Debug - Has Sub ID: ${!!website.stripeSubscriptionId}`
    );
    console.log(
      `🔍 Stripe Debug - Has Sub Item ID: ${!!website.stripeSubscriptionItemId}`
    );

    // Check if we should bill for any plan with subscription IDs
    if (
      shouldBillForStripe &&
      website.stripeSubscriptionId &&
      website.stripeSubscriptionItemId
    ) {
      try {
        console.log(
          `🔍 Stripe Debug - Attempting to bill for ${website.plan} plan`
        );
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

        // Get user for customer mapping (guard against undefined website.userId)
        let user: {
          id: string;
          stripeCustomerId: string | null;
          email: string;
        } | null = null;
        if (website.userId) {
          const userRows = (await query(
            `SELECT id, stripeCustomerId, email FROM User WHERE id = ? LIMIT 1`,
            [website.userId]
          )) as {
            id: string;
            stripeCustomerId: string | null;
            email: string;
          }[];
          user = userRows.length > 0 ? userRows[0] : null;
        }

        let stripeCustomerId = user?.stripeCustomerId;

        // If no customer ID found, try to find it from subscription
        if (!stripeCustomerId && website.stripeSubscriptionId) {
          try {
            console.log(
              `🔍 Stripe Debug - Trying to get customer ID from subscription`
            );
            const subscription = await stripe.subscriptions.retrieve(
              website.stripeSubscriptionId
            );
            if (subscription?.customer) {
              stripeCustomerId =
                typeof subscription.customer === "string"
                  ? subscription.customer
                  : subscription.customer.id;
              console.log(
                `🔍 Stripe Debug - Found customer ID from subscription: ${
                  typeof stripeCustomerId === "string"
                    ? stripeCustomerId.substring(0, 8)
                    : "unknown"
                }...`
              );
            }
          } catch (error) {
            console.error("Error retrieving subscription for billing:", error);
          }
        }

        if (stripeCustomerId) {
          // Create billing meter event with customer_id instead of subscription_item
          const meterEvent = await stripe.billing.meterEvents.create({
            event_name: "api_requests", // EXACTLY the meter name configured in your Stripe Dashboard
            payload: {
              stripe_customer_id: stripeCustomerId as string,
              value: "1", // Quantity of usage to record
            },
            timestamp: Math.floor(Date.now() / 1000), // Unix timestamp in seconds
          });

          console.log(
            `💰 Stripe: Successfully recorded meter event for ${website.plan} plan:`,
            meterEvent
          );

          // If we found the customer ID from subscription but user doesn't have it, update the user
          if (!user?.stripeCustomerId && user?.id && stripeCustomerId) {
            console.log(
              `🔍 Stripe Debug - Updating user with stripeCustomerId`
            );
            await query(`UPDATE User SET stripeCustomerId = ? WHERE id = ?`, [
              stripeCustomerId,
              user.id,
            ]);
          }
        } else {
          console.log(
            `🔍 Stripe Debug - No stripeCustomerId found for ${website.plan} user`
          );
        }
      } catch (error) {
        console.error(`Failed to record ${website.plan} plan usage:`, error);
      }
    } else if (website.plan === "Enterprise" && shouldBillForStripe) {
      try {
        console.log(
          `🔍 Stripe Debug - Attempting to bill for Enterprise plan using meter events`
        );
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
        // Get user ID for customer mapping
        const userRows2 = (await query(
          `SELECT id, stripeCustomerId, email FROM User WHERE id = ? LIMIT 1`,
          [website.userId]
        )) as { id: string; stripeCustomerId: string | null; email: string }[];
        const user = userRows2.length > 0 ? userRows2[0] : null;

        let stripeCustomerId = user?.stripeCustomerId;

        // If no customer ID found, try to find it from subscription
        if (!stripeCustomerId && website.stripeSubscriptionId) {
          try {
            console.log(
              `🔍 Stripe Debug - Trying to get customer ID from subscription`
            );
            const subscription = await stripe.subscriptions.retrieve(
              website.stripeSubscriptionId
            );
            if (subscription?.customer) {
              stripeCustomerId =
                typeof subscription.customer === "string"
                  ? subscription.customer
                  : subscription.customer.id;
              console.log(
                `🔍 Stripe Debug - Found customer ID from subscription: ${stripeCustomerId.substring(
                  0,
                  8
                )}...`
              );
            }
          } catch (error) {
            console.error("Error retrieving subscription for billing:", error);
          }
        }

        if (stripeCustomerId) {
          // Create billing meter event with customer_id instead of subscription_item
          const meterEvent = await stripe.billing.meterEvents.create({
            event_name: "api_requests", // EXACTLY the meter name configured in your Stripe Dashboard
            payload: {
              stripe_customer_id: stripeCustomerId,
              value: "1", // Quantity of usage to record
            },
            timestamp: Math.floor(Date.now() / 1000), // Unix timestamp in seconds
          });

          console.log(
            "Successfully recorded Stripe meter event (per-thread billing):",
            meterEvent
          );

          // If we found the customer ID from subscription but user doesn't have it, update the user
          if (!user?.stripeCustomerId && user?.id && stripeCustomerId) {
            console.log(
              `🔍 Stripe Debug - Updating user with stripeCustomerId`
            );
            await query(`UPDATE User SET stripeCustomerId = ? WHERE id = ?`, [
              stripeCustomerId,
              user.id,
            ]);
          }
        } else {
          console.log(
            `🔍 Stripe Debug - No stripeCustomerId found for Enterprise user`
          );
        }
      } catch (error) {
        console.error("Failed to record Enterprise usage:", error);
      }
    } else if (!shouldBillForStripe) {
      console.log(
        `💰 Stripe: Not billing for follow-up message in thread ${aiThread.id}`
      );
    } else {
      console.log(
        `💰 Stripe: Not billing - missing subscription IDs or not eligible plan`
      );
    }

    // Get the previous context
    const previousContext =
      pastContext && pastContext.length > 0
        ? pastContext[pastContext.length - 1]
        : null;

    // Format previous context to include action information
    let enhancedPreviousContext = previousContext;
    if (previousContext?.answer) {
      // Try to extract action from previous answer if it's in JSON format
      let previousAction = "none";
      // Handle both string and object answers for JSON parsing
      const answerText =
        typeof previousContext.answer === "string"
          ? previousContext.answer
          : "";

      if (
        typeof previousContext.answer === "string" &&
        answerText.startsWith("{")
      ) {
        try {
          const parsedAnswer = JSON.parse(previousContext.answer);
          previousAction = parsedAnswer.action || "none";
        } catch (e) {
          // If parsing fails, use none as default
        }
      } else if (
        typeof previousContext.answer === "object" &&
        previousContext.answer.action
      ) {
        previousAction = previousContext.answer.action;
      }

      // Create enhanced context object with action information
      enhancedPreviousContext = {
        ...previousContext,
        previousAction,
        isConversationContinuation: true,
      };

      // Check if previous action was disabled in settings - this code will run later
    }

    // Get namespaces from VectorDbConfig, incorporating interaction type
    let mainNamespace = website.id;
    let qaNamespace = `${website.id}-qa`;
    let useAllNamespaces = false;

    // Classify the question first to determine interaction type
    console.log("doing classify (2x gpt-5-nano)", {
      responseId: currentResponseId,
    });
    const tClassifyStart = Date.now();
    const classification = await classifyQuestion(
      message,
      enhancedPreviousContext,
      pageData,
      currentResponseId
    );
    timeMarks.classifyMs = Date.now() - tClassifyStart;
    console.log("done classify", {
      ms: timeMarks.classifyMs,
      responseId: currentResponseId,
    });
    if (!classification) {
      return cors(
        request,
        NextResponse.json(
          { error: "Failed to classify question" },
          { status: 500 }
        )
      );
    }

    console.log("Question Classification:", classification);
    console.log(
      "Website newAiSynced status:",
      website.newAiSynced ? "true" : "false"
    );

    // Check if we should use the new AI synced behavior or fall back to querying all namespaces
    if (!website.newAiSynced) {
      // If newAiSynced is false, set flag to search all namespaces regardless of interaction type
      // Keep using original namespaces (websiteId and websiteId-qa) but also search all interaction types
      useAllNamespaces = true;
      mainNamespace = website.id;
      qaNamespace = `${website.id}-qa`;
      console.log(
        "newAiSynced is false, will use original namespaces and search across all interaction types"
      );
      console.log(
        `Using original namespaces: ${mainNamespace}, ${qaNamespace}`
      );
    }

    // Determine which interaction type to use - prefer classifier's determination if available
    let effectiveInteractionType = interactionType;

    if (classification.interaction_type) {
      // If the classifier provided an interaction type, use that instead
      effectiveInteractionType = classification.interaction_type;
      console.log(
        `Using classifier-determined interaction type: ${effectiveInteractionType}`
      );
    } else if (!effectiveInteractionType) {
      // Default to "general" if no interaction type is provided
      effectiveInteractionType = "general";
      console.log("No interaction type specified, defaulting to 'general'");
    }

    console.log(
      `Original interaction type from request: ${interactionType || "none"}`
    );
    console.log(
      `Final effective interaction type: ${effectiveInteractionType}`
    );
    console.log(
      `Classification determined interaction type: ${
        classification.interaction_type || "none"
      }`
    );
    console.log(
      `Classification type/category: ${classification.type}/${classification.category}`
    );

    // Heuristic override: if the user intent clearly targets shopping/browsing products or collections,
    // force the interaction type to 'sales' so we query the sales namespaces.
    const shopRegex =
      /\b(shop|store|products?|catalog|collections?|browse|buy|purchase|add to cart|checkout)\b/i;
    const contentTargets = (classification as any)?.content_targets || {};
    const targetUrl = (
      contentTargets.destination_url ||
      contentTargets.url ||
      ""
    )
      .toString()
      .toLowerCase();
    const targetPageName = (contentTargets.page_name || "")
      .toString()
      .toLowerCase();
    const urlLooksLikeShop = /\/collections|\/products|shopify|shop/.test(
      targetUrl
    );
    const pageLooksLikeShop = /shop|store|products|collections/.test(
      targetPageName
    );
    const contentTypeImpliesSales =
      classification.type === "product" || classification.type === "collection";
    const actionImpliesSales =
      classification.action_intent === "purchase" ||
      (classification.action_intent === "redirect" &&
        (urlLooksLikeShop || pageLooksLikeShop));
    const messageImpliesSales = shopRegex.test(message);

    const shouldForceSales =
      contentTypeImpliesSales || actionImpliesSales || messageImpliesSales;

    if (
      effectiveInteractionType !== "sales" &&
      shouldForceSales &&
      !useAllNamespaces
    ) {
      console.log("doing override: interaction_type->sales", {
        responseId: currentResponseId,
      });
      effectiveInteractionType = "sales";
      console.log("done override: interaction_type->sales", {
        responseId: currentResponseId,
      });
    }

    if (effectiveInteractionType && !useAllNamespaces) {
      // Use interaction type for namespace: websiteId-sales, websiteId-support, etc.
      mainNamespace = `${website.id}-${effectiveInteractionType}`;
      qaNamespace = `${website.id}-${effectiveInteractionType}-qa`;
      console.log(
        `Using interaction-specific namespaces: ${mainNamespace}, ${qaNamespace}`
      );
    } else {
      if (useAllNamespaces) {
        console.log(
          "Will ignore dynamic namespaces and search across all interaction types"
        );
        // We'll keep the default namespaces but use the search-all logic later
      } else {
        // Try to get configured namespaces from DB if available
        const vectorDbConfigRows = (await query(
          `SELECT MainNamespace, QANamespace FROM VectorDbConfig WHERE websiteId = ? LIMIT 1`,
          [website.id]
        )) as { MainNamespace: string; QANamespace: string }[];
        const vectorDbConfig =
          vectorDbConfigRows.length > 0 ? vectorDbConfigRows[0] : null;

        if (vectorDbConfig) {
          mainNamespace = vectorDbConfig.MainNamespace;
          qaNamespace = vectorDbConfig.QANamespace;
        }
      }
    }

    // Now check for disabled actions from previous context
    if (previousContext?.answer) {
      // Get the previous action we extracted earlier
      const previousAction = enhancedPreviousContext?.previousAction || "none";

      // Check if previous action was disabled in settings
      if (previousAction === "cancel_order" && !website.allowAutoCancel) {
        return handleDisabledAction(
          request,
          website,
          message,
          type,
          threadId,
          "cancel orders",
          "cancel_order"
        );
      }

      // Check if previous action was disabled in settings
      if (previousAction === "cancel_order" && !website.allowAutoCancel) {
        return handleDisabledAction(
          request,
          website,
          message,
          type,
          threadId,
          "cancel orders",
          "cancel_order"
        );
      }

      if (previousAction === "return_order" && !website.allowAutoReturn) {
        return handleDisabledAction(
          request,
          website,
          message,
          type,
          threadId,
          "process returns",
          "return_order"
        );
      }

      if (previousAction === "exchange_order" && !website.allowAutoExchange) {
        return handleDisabledAction(
          request,
          website,
          message,
          type,
          threadId,
          "process exchanges",
          "exchange_order"
        );
      }

      if (
        previousAction === "generate_image" &&
        !website.allowAutoGenerateImage
      ) {
        return handleComingSoonAction(
          request,
          website,
          message,
          type,
          threadId,
          "generate images",
          "generate_image"
        );
      }

      // Check for other disabled actions from previous context
      if (previousAction === "login" && !website.allowAutoLogin) {
        return handleUnsupportedAction(
          request,
          website,
          message,
          type,
          threadId,
          "login",
          "login"
        );
      }

      if (previousAction === "logout" && !website.allowAutoLogout) {
        return handleUnsupportedAction(
          request,
          website,
          message,
          type,
          threadId,
          "logout",
          "logout"
        );
      }

      if (previousAction === "track_order" && !website.allowAutoTrackOrder) {
        return handleUnsupportedAction(
          request,
          website,
          message,
          type,
          threadId,
          "track orders",
          "track_order"
        );
      }

      if (previousAction === "get_orders" && !website.allowAutoGetUserOrders) {
        return handleUnsupportedAction(
          request,
          website,
          message,
          type,
          threadId,
          "access your orders",
          "get_orders"
        );
      }

      if (
        (previousAction === "account_management" ||
          previousAction === "account_reset") &&
        !website.allowAutoUpdateUserInfo
      ) {
        return handleUnsupportedAction(
          request,
          website,
          message,
          type,
          threadId,
          "update account information",
          previousAction
        );
      }

      // Create enhanced context object with action information
      enhancedPreviousContext = {
        ...previousContext,
        previousAction,
        isConversationContinuation: true,
      };
    }

    // We've already classified the question above, so no need to do it again
    // Just check if the action intent is one of the disabled ones

    console.log("Question Classification:", classification);

    // Check if classified action is disabled by website settings
    if (
      classification.action_intent === "cancel_order" &&
      !website.allowAutoCancel
    ) {
      return handleDisabledAction(
        request,
        website,
        message,
        type,
        threadId,
        "cancel orders",
        "cancel_order"
      );
    }

    if (
      classification.action_intent === "return_order" &&
      !website.allowAutoReturn
    ) {
      return handleDisabledAction(
        request,
        website,
        message,
        type,
        threadId,
        "process returns",
        "return_order"
      );
    }

    if (
      classification.action_intent === "exchange_order" &&
      !website.allowAutoExchange
    ) {
      return handleDisabledAction(
        request,
        website,
        message,
        type,
        threadId,
        "process exchanges",
        "exchange_order"
      );
    }

    if (
      classification.action_intent === "generate_image" &&
      !website.allowAutoGenerateImage
    ) {
      return handleComingSoonAction(
        request,
        website,
        message,
        type,
        threadId,
        "generate images",
        "generate_image"
      );
    }

    // Check other classified actions
    if (classification.action_intent === "login" && !website.allowAutoLogin) {
      return handleUnsupportedAction(
        request,
        website,
        message,
        type,
        threadId,
        "login",
        "login"
      );
    }

    if (classification.action_intent === "logout" && !website.allowAutoLogout) {
      return handleUnsupportedAction(
        request,
        website,
        message,
        type,
        threadId,
        "logout",
        "logout"
      );
    }

    if (
      classification.action_intent === "track_order" &&
      !website.allowAutoTrackOrder
    ) {
      return handleUnsupportedAction(
        request,
        website,
        message,
        type,
        threadId,
        "track orders",
        "track_order"
      );
    }

    if (
      classification.action_intent === "get_orders" &&
      !website.allowAutoGetUserOrders
    ) {
      return handleUnsupportedAction(
        request,
        website,
        message,
        type,
        threadId,
        "access your orders",
        "get_orders"
      );
    }

    if (
      (classification.action_intent === "account_management" ||
        classification.action_intent === "account_reset") &&
      !website.allowAutoUpdateUserInfo
    ) {
      return handleUnsupportedAction(
        request,
        website,
        message,
        type,
        threadId,
        "update account information",
        classification.action_intent
      );
    }

    // Detect generic browse intent
    const genericBrowse = /what.*(stuff|have|sell|carry|offer)/i.test(message);

    // Build hybrid vectors for the base query (query path only)
    console.log("doing hybrid vectors (base)", {
      responseId: currentResponseId,
    });
    const tEmbedQueryStart = Date.now();
    const { denseScaled: queryDense, sparseScaled: querySparse } =
      await buildHybridQueryVectors(message, {
        alpha: genericBrowse ? 0.6 : 0.5,
        featureSpace: 2_000_003,
      });
    timeMarks.embedQueryMs = Date.now() - tEmbedQueryStart;
    timeMarks.sparseQueryMs = 0;
    console.log("done hybrid vectors (base)", {
      ms: timeMarks.embedQueryMs,
      sparseTerms: querySparse.indices.length,
      denseDims: queryDense.length,
      responseId: currentResponseId,
    });

    // Minimal hybrid on/off log
    console.log("doing hybrid query", {
      sparseTerms: querySparse.indices.length,
      denseDims: queryDense.length,
    });

    // Create enhanced query using provided previous context
    const enhancedQuery = previousContext
      ? `${message} ${previousContext.question} ${previousContext.answer}`
      : message;

    console.log("doing hybrid vectors (enhanced)", {
      responseId: currentResponseId,
    });
    const tEmbedEnhancedStart = Date.now();
    const { denseScaled: enhancedDense, sparseScaled: enhancedSparse } =
      await buildHybridQueryVectors(enhancedQuery, {
        alpha: genericBrowse ? 0.6 : 0.5,
        featureSpace: 2_000_003,
      });
    timeMarks.embedEnhancedMs = Date.now() - tEmbedEnhancedStart;
    timeMarks.sparseEnhancedMs = 0;
    console.log("done hybrid vectors (enhanced)", {
      ms: timeMarks.embedEnhancedMs,
      sparseTerms: enhancedSparse.indices.length,
      denseDims: enhancedDense.length,
      responseId: currentResponseId,
    });

    // Fallback for ultra-generic queries
    if (shouldFallbackToCollections(querySparse)) {
      const response = {
        action: "redirect",
        answer: "Here’s our catalog to browse items.",
        category: "discovery",
        pageId: "collections",
        pageTitle: "Shop All",
        question: message,
        scrollText: "",
        subcategory: "content_overview",
        type: type,
        url: `${website.url}/collections/all`,
      } as const;

      return cors(
        request,
        NextResponse.json({
          response,
          threadId: threadId || crypto.randomUUID(),
          context: {
            mainContent: null,
            relevantQAs: [],
          },
          success: true,
        })
      );
    }

    // Define search functions outside the block to avoid strict mode errors
    const performMainSearch = async () => {
      // Special handling for "noneSpecified" interaction type or useAllNamespaces flag - search across all namespaces
      if (interactionType === "noneSpecified" || useAllNamespaces) {
        console.log(
          useAllNamespaces
            ? "Using all namespaces search strategy for non-AIsynced website"
            : "Using noneSpecified search strategy - searching across all interaction types"
        );

        // Define the interaction types to search across
        const interactionTypes = ["sales", "support", "general"];
        console.log(
          `Vectorization strategy: searching across multiple namespaces: ${interactionTypes.join(
            ", "
          )}`
        );

        // Collect results from all interaction types
        const allResults = [];

        for (const type of interactionTypes) {
          // Ensure website is not null before accessing its properties
          if (!website) {
            console.error("Website is null, cannot create namespace");
            continue;
          }
          const typeNamespace = `${website.id}-${type}`;
          console.log(`Searching namespace: ${typeNamespace}`);

          try {
            // Collection query if necessary
            if (classification && classification.type === "collection") {
              // Use the actual query terms for collection search
              const collectionQuery = `${message} ${classification.type}`;
              const {
                denseScaled: collectionDense,
                sparseScaled: collectionSparse,
              } = await buildHybridQueryVectors(collectionQuery, {
                alpha: genericBrowse ? 0.6 : 0.5,
                featureSpace: 2_000_003,
              });

              const collectionSearchResponse = await pinecone
                .index("voicero-hybrid")
                .namespace(typeNamespace)
                .query({
                  vector: collectionDense,
                  sparseVector: collectionSparse,
                  topK: 7, // Reduced to get top results from each namespace
                  includeMetadata: true,
                  filter: genericBrowse
                    ? { type: { $in: ["collection", "product"] } }
                    : undefined,
                });

              // Add results if they exist
              if (collectionSearchResponse?.matches?.length > 0) {
                allResults.push(...collectionSearchResponse.matches);
              }
            }

            // Perform hybrid search in this namespace
            const tNsSearchStart = Date.now();
            const searchResponse = await pinecone
              .index("voicero-hybrid")
              .namespace(typeNamespace)
              .query({
                vector: queryDense,
                sparseVector: querySparse,
                topK: 7, // Reduced to get top results from each namespace
                includeMetadata: true,
                filter: genericBrowse
                  ? { type: { $in: ["collection", "product"] } }
                  : undefined,
              });
            timeMarks[`ns:${typeNamespace}:searchMs`] =
              Date.now() - tNsSearchStart;

            // Add results if they exist
            if (searchResponse?.matches?.length > 0) {
              console.log(
                `Found ${searchResponse.matches.length} results in namespace ${typeNamespace}`
              );
              // Log the first 2 results for debugging
              if (searchResponse.matches.length > 0) {
                console.log(`First result from ${typeNamespace}:`, {
                  id: searchResponse.matches[0].id,
                  score: searchResponse.matches[0].score,
                  type: searchResponse.matches[0].metadata?.type,
                  title:
                    searchResponse.matches[0].metadata?.title ||
                    searchResponse.matches[0].metadata?.question,
                });

                if (searchResponse.matches.length > 1) {
                  console.log(`Second result from ${typeNamespace}:`, {
                    id: searchResponse.matches[1].id,
                    score: searchResponse.matches[1].score,
                    type: searchResponse.matches[1].metadata?.type,
                    title:
                      searchResponse.matches[1].metadata?.title ||
                      searchResponse.matches[1].metadata?.question,
                  });
                }
              }
              allResults.push(...searchResponse.matches);
            }
          } catch (error) {
            console.error(`Error searching namespace ${typeNamespace}:`, error);
            // Continue with other namespaces even if one fails
          }
        }

        // Deduplicate by ID
        const uniqueResults = [];
        const seenIds = new Set();

        for (const result of allResults) {
          if (!seenIds.has(result.id)) {
            seenIds.add(result.id);
            uniqueResults.push(result);
          }
        }

        console.log(
          `Combined ${allResults.length} results into ${uniqueResults.length} unique results`
        );

        // Ensure classification is not null before calling rerankMainResults
        if (!classification) {
          // Fall back to raw results if no classification
          return uniqueResults.map((result) => ({
            ...result,
            rerankScore: result.score || 0,
            classificationMatch: "0/3",
          }));
        }

        // Rerank combined results with classification
        return rerankMainResults(
          uniqueResults,
          classification,
          message,
          previousContext
        );
      } else {
        // Standard search when interaction type is specified
        console.log(
          `Vectorization strategy: using specific namespace: ${mainNamespace}`
        );

        // Collection query if necessary
        let collectionSearchResponse = null;
        // Safe access with null check
        if (classification && classification.type === "collection") {
          // Use the actual query terms for collection search
          const collectionQuery = `${message} ${classification.type}`;
          const {
            denseScaled: collectionDense,
            sparseScaled: collectionSparse,
          } = await buildHybridQueryVectors(collectionQuery, {
            alpha: genericBrowse ? 0.6 : 0.5,
            featureSpace: 2_000_003,
          });

          const tMainCollectionSearchStart = Date.now();
          collectionSearchResponse = await pinecone
            .index("voicero-hybrid")
            .namespace(mainNamespace)
            .query({
              vector: collectionDense,
              sparseVector: collectionSparse,
              topK: 20,
              includeMetadata: true,
              filter: genericBrowse
                ? { type: { $in: ["collection", "product"] } }
                : undefined,
            });
          timeMarks.mainCollectionSearchMs =
            Date.now() - tMainCollectionSearchStart;
        }

        // Perform hybrid search in main namespace
        const tMainSearchStart = Date.now();
        const mainSearchResponse = await pinecone
          .index("voicero-hybrid")
          .namespace(mainNamespace)
          .query({
            vector: queryDense,
            sparseVector: querySparse,
            topK: 20,
            includeMetadata: true,
            filter: genericBrowse
              ? { type: { $in: ["collection", "product"] } }
              : undefined,
          });
        timeMarks.mainSearchMs = Date.now() - tMainSearchStart;

        // Log the results from main namespace
        if (mainSearchResponse?.matches?.length > 0) {
          console.log(
            `Found ${mainSearchResponse.matches.length} results in main namespace ${mainNamespace}`
          );
          // Log the first 2 results for debugging
          if (mainSearchResponse.matches.length > 0) {
            console.log(`First result from ${mainNamespace}:`, {
              id: mainSearchResponse.matches[0].id,
              score: mainSearchResponse.matches[0].score,
              type: mainSearchResponse.matches[0].metadata?.type,
              title:
                mainSearchResponse.matches[0].metadata?.title ||
                mainSearchResponse.matches[0].metadata?.question,
            });

            if (mainSearchResponse.matches.length > 1) {
              console.log(`Second result from ${mainNamespace}:`, {
                id: mainSearchResponse.matches[1].id,
                score: mainSearchResponse.matches[1].score,
                type: mainSearchResponse.matches[1].metadata?.type,
                title:
                  mainSearchResponse.matches[1].metadata?.title ||
                  mainSearchResponse.matches[1].metadata?.question,
              });
            }
          }
        }

        // If we have collection results, merge them with main results for final response
        let finalMainResults = [...(mainSearchResponse.matches || [])];
        const MIN_MAIN_RESULTS = 3;
        if (collectionSearchResponse) {
          console.log(
            `Found ${collectionSearchResponse.matches.length} collection-specific results in namespace ${mainNamespace}`
          );

          collectionSearchResponse.matches.forEach((collectionResult) => {
            // Only add if not already present
            if (!finalMainResults.some((r) => r.id === collectionResult.id)) {
              finalMainResults.push(collectionResult);
            }
          });
        }

        // Supplement with other main namespaces (no QA) when using general or support
        if (
          !useAllNamespaces &&
          (effectiveInteractionType === "general" ||
            effectiveInteractionType === "support")
        ) {
          console.log("doing cross-namespace supplement (main only)", {
            responseId: currentResponseId,
          });
          const otherTypes = ["sales", "support", "general"].filter(
            (t) => t !== effectiveInteractionType
          );
          const tSuppStart = Date.now();
          const supplementPromises = otherTypes.map((t) =>
            pinecone
              .index("voicero-hybrid")
              .namespace(`${website!.id}-${t}`)
              .query({
                vector: queryDense,
                sparseVector: querySparse,
                topK: 7,
                includeMetadata: true,
                filter: genericBrowse
                  ? { type: { $in: ["collection", "product"] } }
                  : undefined,
              })
          );
          const supplementResults = await Promise.allSettled(
            supplementPromises
          );
          const seenIds = new Set(finalMainResults.map((r) => r.id));
          for (const res of supplementResults) {
            if (res.status === "fulfilled" && res.value?.matches?.length) {
              for (const m of res.value.matches) {
                if (!seenIds.has(m.id)) {
                  seenIds.add(m.id);
                  finalMainResults.push(m);
                }
              }
            }
          }
          timeMarks.supplementMainMs = Date.now() - tSuppStart;
          console.log("done cross-namespace supplement", {
            ms: timeMarks.supplementMainMs,
            responseId: currentResponseId,
          });
        }

        // Fallback: broaden search if specific namespace is insufficient
        const insufficientResults =
          finalMainResults.length < MIN_MAIN_RESULTS ||
          (finalMainResults[0]?.score ?? 0) < 0.2;

        if (insufficientResults) {
          console.log(
            `Fallback triggered: insufficient results in ${mainNamespace}. Searching across all namespaces.`
          );
          const types = ["sales", "support", "general"];
          const altResults: any[] = [];
          for (const type of types) {
            const typeNamespace = `${website!.id}-${type}`;
            try {
              const alt = await pinecone
                .index("voicero-hybrid")
                .namespace(typeNamespace)
                .query({
                  vector: queryDense,
                  sparseVector: querySparse,
                  topK: 7,
                  includeMetadata: true,
                  filter: genericBrowse
                    ? { type: { $in: ["collection", "product"] } }
                    : undefined,
                });
              if (alt?.matches?.length) altResults.push(...alt.matches);
            } catch (e) {
              console.error(`Fallback search error in ${typeNamespace}:`, e);
            }
          }

          const seen = new Set(finalMainResults.map((r) => r.id));
          for (const r of altResults) {
            if (!seen.has(r.id)) {
              seen.add(r.id);
              finalMainResults.push(r);
            }
          }
        }

        // Ensure classification is not null before calling rerankMainResults
        if (!classification) {
          // Fall back to raw results if no classification
          return finalMainResults.map((result) => ({
            ...result,
            rerankScore: result.score || 0,
            classificationMatch: "0/3",
          }));
        }

        // Rerank main results with classification
        return rerankMainResults(
          finalMainResults,
          classification, // Now safe to pass as non-null
          message,
          previousContext
        );
      }
    };

    const performQASearch = async () => {
      // Special handling for "noneSpecified" interaction type or useAllNamespaces flag - search across all namespaces
      if (interactionType === "noneSpecified" || useAllNamespaces) {
        console.log(
          useAllNamespaces
            ? "Using all QA namespaces search strategy for non-AIsynced website"
            : "Using noneSpecified search strategy for QA - searching across all interaction types"
        );

        // Define the interaction types to search across
        const interactionTypes = ["sales", "support", "general"];
        console.log(
          `QA Vectorization strategy: searching across multiple QA namespaces: ${interactionTypes.join(
            ", "
          )}`
        );

        // Collect results from all interaction types
        const allResults = [];

        for (const type of interactionTypes) {
          // Ensure website is not null before accessing its properties
          if (!website) {
            console.error("Website is null, cannot create QA namespace");
            continue;
          }
          const typeQaNamespace = `${website.id}-${type}-qa`;
          console.log(`Searching QA namespace: ${typeQaNamespace}`);

          try {
            // Perform hybrid search in this QA namespace
            const tQaNsSearchStart = Date.now();
            const qaSearchResponse = await pinecone
              .index("voicero-hybrid")
              .namespace(typeQaNamespace)
              .query({
                vector: enhancedDense,
                sparseVector: enhancedSparse,
                topK: 7, // Reduced to get top results from each namespace
                includeMetadata: true,
              });
            timeMarks[`ns:${typeQaNamespace}:qaSearchMs`] =
              Date.now() - tQaNsSearchStart;

            // Add results if they exist
            if (qaSearchResponse?.matches?.length > 0) {
              console.log(
                `Found ${qaSearchResponse.matches.length} QA results in namespace ${typeQaNamespace}`
              );
              // Log the first 2 results for debugging
              if (qaSearchResponse.matches.length > 0) {
                console.log(`First QA result from ${typeQaNamespace}:`, {
                  id: qaSearchResponse.matches[0].id,
                  score: qaSearchResponse.matches[0].score,
                  question: qaSearchResponse.matches[0].metadata?.question,
                });

                if (qaSearchResponse.matches.length > 1) {
                  console.log(`Second QA result from ${typeQaNamespace}:`, {
                    id: qaSearchResponse.matches[1].id,
                    score: qaSearchResponse.matches[1].score,
                    question: qaSearchResponse.matches[1].metadata?.question,
                  });
                }
              }
              allResults.push(...qaSearchResponse.matches);
            }
          } catch (error) {
            console.error(
              `Error searching QA namespace ${typeQaNamespace}:`,
              error
            );
            // Continue with other namespaces even if one fails
          }
        }

        // Deduplicate by question text if available
        const uniqueResults = [];
        const seenQuestions = new Set();

        for (const result of allResults) {
          const questionText = result.metadata?.question || result.id;
          if (!seenQuestions.has(questionText)) {
            seenQuestions.add(questionText);
            uniqueResults.push(result);
          }
        }

        console.log(
          `Combined ${allResults.length} QA results into ${uniqueResults.length} unique results`
        );

        // Add default classification to QA results before reranking
        uniqueResults.forEach((result) => {
          if (!result.metadata) {
            result.metadata = {};
          }

          // Safely access classification fields with null check
          if (classification) {
            // Force the classification to match the query
            result.metadata.type = classification.type;
            result.metadata.category = classification.category;
            result.metadata["sub-category"] =
              classification["sub-category"] || "general";
          } else {
            // Fallback values if classification is null
            result.metadata.type = "unknown";
            result.metadata.category = "unknown";
            result.metadata["sub-category"] = "general";
          }
        });

        // Ensure classification is not null before calling rerankQAResults
        if (!classification) {
          // Fall back to raw results if no classification
          return uniqueResults.map((result) => ({
            ...result,
            rerankScore: result.score || 0,
            classificationMatch: "0/3",
          }));
        }

        // Rerank QA results with classification
        return rerankQAResults(
          uniqueResults,
          classification,
          message,
          previousContext
        );
      } else {
        // Standard search when interaction type is specified
        console.log(
          `QA Vectorization strategy: using specific QA namespace: ${qaNamespace}`
        );

        // Perform hybrid search in QA namespace with enhanced query
        const tQaSearchStart = Date.now();
        const qaSearchResponse = await pinecone
          .index("voicero-hybrid")
          .namespace(qaNamespace)
          .query({
            vector: enhancedDense,
            sparseVector: enhancedSparse,
            topK: 20,
            includeMetadata: true,
          });
        timeMarks.qaSearchMs = Date.now() - tQaSearchStart;

        // Add default classification to QA results before reranking
        qaSearchResponse.matches = qaSearchResponse.matches.map((result) => {
          if (!result.metadata) {
            result.metadata = {};
          }

          // Safely access classification fields with null check
          if (classification) {
            // Force the classification to match the query
            result.metadata.type = classification.type;
            result.metadata.category = classification.category;
            result.metadata["sub-category"] =
              classification["sub-category"] || "general";
          } else {
            // Fallback values if classification is null
            result.metadata.type = "unknown";
            result.metadata.category = "unknown";
            result.metadata["sub-category"] = "general";
          }

          return result;
        });

        // Log the QA results
        if (qaSearchResponse?.matches?.length > 0) {
          console.log(
            `Found ${qaSearchResponse.matches.length} QA results in namespace ${qaNamespace}`
          );
          // Log the first 2 results for debugging
          if (qaSearchResponse.matches.length > 0) {
            console.log(`First QA result from ${qaNamespace}:`, {
              id: qaSearchResponse.matches[0].id,
              score: qaSearchResponse.matches[0].score,
              question: qaSearchResponse.matches[0].metadata?.question,
            });

            if (qaSearchResponse.matches.length > 1) {
              console.log(`Second QA result from ${qaNamespace}:`, {
                id: qaSearchResponse.matches[1].id,
                score: qaSearchResponse.matches[1].score,
                question: qaSearchResponse.matches[1].metadata?.question,
              });
            }
          }
        }

        // Ensure classification is not null before calling rerankQAResults
        if (!classification) {
          // Fall back to raw results if no classification
          return qaSearchResponse.matches.map((result) => ({
            ...result,
            rerankScore: result.score || 0,
            classificationMatch: "0/3",
          }));
        }

        // Rerank QA results with classification
        return rerankQAResults(
          qaSearchResponse.matches,
          classification, // Now safe to pass as non-null
          message,
          previousContext
        );
      }
    };

    // Execute both search operations in parallel
    console.log("doing pinecone search (parallel main+qa)", {
      responseId: currentResponseId,
    });
    const tSearchRerankStart = Date.now();
    const [rerankedMainResults, rerankedQAResults] = await Promise.all([
      performMainSearch(),
      performQASearch(),
    ]);
    timeMarks.searchAndRerankMs = Date.now() - tSearchRerankStart;
    {
      const nsCount = Object.keys(timeMarks).filter((k) =>
        k.startsWith("ns:")
      ).length;
      console.log("done pinecone search (parallel)", {
        ms: timeMarks.searchAndRerankMs,
        mainMs: timeMarks.mainSearchMs,
        qaMs: timeMarks.qaSearchMs,
        namespaces: nsCount,
        responseId: currentResponseId,
      });
    }

    // Take top results from each set (use 5)
    const topMainResults = rerankedMainResults.slice(0, 5);
    const topQAResults = rerankedQAResults.slice(0, 5);

    // Slim doc formatter: keep only essential fields
    const slimDoc = (r: any) => {
      const md = r?.metadata || {};
      const title = md.title || md.question || md.handle || "";
      const rawSnippet = md.description || md.content || md.answer || "";
      const snippet = (typeof rawSnippet === "string" ? rawSnippet : "")
        .replace(/\s+/g, " ")
        .slice(0, 200);
      const url = md.url || md.productUrl || "";
      const type = md.type || md.contentType || "";
      return {
        title,
        snippet,
        url,
        type,
        relevanceScore: r.rerankScore,
        classificationMatch: r.classificationMatch,
      };
    };

    const slimMain = topMainResults.map(slimDoc);
    const qaBullets = topQAResults.map((r: any) => {
      const q = r?.metadata?.question || "";
      const a = (r?.metadata?.answer || "")
        .toString()
        .replace(/\s+/g, " ")
        .slice(0, 120);
      return `- ${q ? `${q}: ` : ""}${a}`;
    });

    // Prepare trimmed context for AI
    const context = {
      mainContent: slimMain,
      relevantQAs: qaBullets,
      previousContext: null,
      classification: classification
        ? {
            type: classification.type,
            category: classification.category,
            "sub-category": classification["sub-category"],
            action_intent: classification.action_intent,
          }
        : null,
      currentPageUrl: currentPageUrl || null,
    };

    // Create shared system prompt
    const SYSTEM_PROMPT = buildSystemPrompt(
      classification,
      website?.customInstructions
    );

    // Replace Anthropic API call with OpenAI
    const relevantPageData = getRelevantPageData(
      pageData,
      classification?.action_intent
    );

    // Final message context (already trimmed)
    const messageContext = context;

    // Format the previous context for display - include up to 2 recent turns
    const formattedPreviousConversation =
      pastContext && pastContext.length > 0
        ? pastContext
            .slice(-Math.min(2, pastContext.length))
            .map((message) => ({
              role: message.role || (message.question ? "user" : "assistant"),
              content: message.question
                ? message.question
                : typeof message.answer === "string" &&
                  message.answer?.startsWith("{")
                ? JSON.parse(message.answer).answer
                : typeof message.answer === "object" && message.answer?.answer
                ? message.answer.answer
                : message.answer,
            }))
        : [];

    // Keep the previous context format for backward compatibility
    const formattedPreviousContext =
      pastContext && pastContext.length >= 2
        ? {
            question: pastContext[pastContext.length - 2].question,
            answer:
              typeof pastContext[pastContext.length - 1].answer === "string" &&
              pastContext[pastContext.length - 1].answer?.startsWith("{")
                ? JSON.parse(pastContext[pastContext.length - 1].answer).answer
                : typeof pastContext[pastContext.length - 1].answer ===
                    "object" &&
                  pastContext[pastContext.length - 1].answer?.answer
                ? pastContext[pastContext.length - 1].answer.answer
                : pastContext[pastContext.length - 1].answer,
          }
        : null;

    // Minimal log of trimmed context
    console.log("done building slim context", {
      main: slimMain.length,
      qa: qaBullets.length,
    });

    // Use OpenAI Responses API (GPT-5)
    console.log("doing gpt-5-mini", { responseId: currentResponseId });
    const tModelStart = Date.now();
    const completion = await openai.responses.create({
      model: "gpt-5-mini",
      instructions:
        SYSTEM_PROMPT +
        "\n\nIMPORTANT: Respond with ONLY the raw JSON object. Do NOT wrap the response in ```json or ``` markers.",
      input: `${currentPageUrl ? `Current page: ${currentPageUrl}\n\n` : ""}${
        relevantPageData
          ? `Relevant Page Data: ${JSON.stringify(relevantPageData)}\n\n`
          : ""
      }Context: ${JSON.stringify(messageContext)}\n\nQuestion: ${message}`,
      // Keep as plain text; SDK types may not expose response_format yet. We enforce JSON in the prompt.
      previous_response_id: (previousResponseId || responseId) ?? undefined,
    });

    timeMarks.modelCallMs = Date.now() - tModelStart;
    console.log("done gpt-5-mini", {
      ms: timeMarks.modelCallMs,
      responseId_in: currentResponseId,
      responseId_out: (completion as any)?.id,
    });
    // Robust output extraction per latest SDK result shape
    const outputText =
      (completion as any).output_text ??
      (Array.isArray((completion as any).output)
        ? (completion as any).output
            .map((p: any) =>
              (p.content ?? []).map((c: any) => c.text?.value ?? "").join("")
            )
            .join("")
        : "");

    let aiResponse = outputText;
    let parsedResponse = {
      answer: "",
      action: null as string | null,
      url: null as string | null,
      action_context: {} as Record<string, any>,
    };

    // Try to parse JSON response with fallback
    try {
      // First attempt to parse as is
      parsedResponse = JSON.parse(aiResponse);

      // Ensure action_context is always an object
      if (
        !parsedResponse.action_context ||
        typeof parsedResponse.action_context !== "object"
      ) {
        parsedResponse.action_context = {};
      }

      // Check for actions that should be allowed based on website settings,
      // but keep the AI response content
      if (parsedResponse.action === "scroll" && !website.allowAutoScroll) {
        // Save the original answer
        const originalAnswer = parsedResponse.answer;
        parsedResponse.action = "none";
        parsedResponse.answer = originalAnswer;
      }

      if (
        parsedResponse.action === "highlight_text" &&
        !website.allowAutoHighlight
      ) {
        // Save the original answer
        const originalAnswer = parsedResponse.answer;
        parsedResponse.action = "none";
        parsedResponse.answer = originalAnswer;
      }

      if (parsedResponse.action === "redirect" && !website.allowAutoRedirect) {
        // Save the original answer
        const originalAnswer = parsedResponse.answer;
        parsedResponse.action = "none";
        parsedResponse.answer = originalAnswer;
      }

      if (parsedResponse.action === "click" && !website.allowAutoClick) {
        // Save the original answer
        const originalAnswer = parsedResponse.answer;
        parsedResponse.action = "none";
        parsedResponse.answer = originalAnswer;
      }

      if (parsedResponse.action === "fill_form" && !website.allowAutoFillForm) {
        // Save the original answer
        const originalAnswer = parsedResponse.answer;
        parsedResponse.action = "none";
        parsedResponse.answer = originalAnswer;
      }

      // Check for actions that should return a different message
      if (parsedResponse.action === "login" && !website.allowAutoLogin) {
        parsedResponse.action = "none";
        parsedResponse.answer =
          "I'm sorry, I'm unable to help with logging in at the moment. Would you like to try something else?";
      }

      if (parsedResponse.action === "logout" && !website.allowAutoLogout) {
        parsedResponse.action = "none";
        parsedResponse.answer =
          "I'm sorry, I'm unable to help with logging out at the moment. Would you like to try something else?";
      }

      if (
        parsedResponse.action === "track_order" &&
        !website.allowAutoTrackOrder
      ) {
        parsedResponse.action = "none";
        parsedResponse.answer =
          "I'm sorry, I'm unable to track orders automatically right now. Would you like to try something else?";
      }

      if (
        parsedResponse.action === "get_orders" &&
        !website.allowAutoGetUserOrders
      ) {
        parsedResponse.action = "none";
        parsedResponse.answer =
          "I'm sorry, I'm unable to access your orders at the moment. Would you like to try something else?";
      }

      if (
        (parsedResponse.action === "account_management" ||
          parsedResponse.action === "account_reset") &&
        !website.allowAutoUpdateUserInfo
      ) {
        parsedResponse.action = "none";
        parsedResponse.answer =
          "I'm sorry, I'm unable to update account information automatically. Would you like to try something else?";
      }

      if (
        parsedResponse.action === "generate_image" &&
        !website.allowAutoGenerateImage
      ) {
        parsedResponse.action = "none";
        parsedResponse.answer =
          "I'm sorry, I'm unable to generate images at the moment. Would you like to try something else?";
      }

      // CRITICAL FIX: Block address updates through the chat
      if (
        parsedResponse.action === "account_management" ||
        parsedResponse.action === "updateCustomer"
      ) {
        // Check for address updates in various formats
        const hasAddressUpdate =
          parsedResponse.action_context?.default_address !== undefined ||
          parsedResponse.action_context?.defaultAddress !== undefined ||
          (typeof aiResponse === "string" &&
            (aiResponse.includes("defaultAddress") ||
              (aiResponse.includes("updateCustomer") &&
                aiResponse.includes("address"))));

        // Also check if the action_context might be a stringified JSON containing address updates
        const actionContextStr = JSON.stringify(
          parsedResponse.action_context
        ).toLowerCase();
        const addressTerms = ["address", "city", "province", "zip", "country"];
        const containsAddressTerms = addressTerms.some((term) =>
          actionContextStr.includes(term)
        );

        // Check for the specific customer update format mentioned by the user
        const customerAddressUpdatePattern =
          /"action"\s*:\s*"updateCustomer".*"defaultAddress"/i;
        const matchesCustomerAddressPattern =
          typeof aiResponse === "string" &&
          customerAddressUpdatePattern.test(aiResponse);

        if (
          hasAddressUpdate ||
          containsAddressTerms ||
          parsedResponse.action === "updateCustomer" ||
          matchesCustomerAddressPattern
        ) {
          // Override the action to prevent address updates
          parsedResponse.action = "none";
          parsedResponse.action_context = {};
          parsedResponse.answer =
            "I'm sorry, address updates are not currently supported through the chat assistant. You can only update your name, phone number, and email here. Please go to your account settings to update your address information.";
        }
      }

      // URL validation: Validate and fix redirect URLs if needed
      if (
        parsedResponse.action === "redirect" &&
        parsedResponse.action_context?.url
      ) {
        try {
          const storeOrigin = new URL(website.url).origin;
          const targetUrlStr = parsedResponse.action_context.url as string;
          const target = new URL(targetUrlStr, storeOrigin);
          const sameOrigin = target.origin === storeOrigin;
          const isCollectionPath = /^\/collections(\/.*)?$/.test(
            target.pathname
          );
          if (sameOrigin && isCollectionPath) {
            console.log("done url fast-validate (collections)", {
              url: target.toString(),
              responseId: currentResponseId,
            });
            parsedResponse.action_context.url = target.toString();
          } else {
            const availableData = {
              mainContent: context.mainContent || [],
              relevantQAs: context.relevantQAs || [],
              pageData: null,
            };
            const validatedUrl = validateAndFixUrl(
              parsedResponse.action_context.url,
              message,
              classification,
              availableData
            );

            if (!validatedUrl) {
              console.log(
                `❌ URL validation failed for: ${parsedResponse.action_context.url}`
              );
              parsedResponse.action = "none";
              parsedResponse.action_context = {};
              parsedResponse.answer =
                parsedResponse.answer +
                " (Note: The specific page you're looking for wasn't found, but I hope this information helps!)";
            } else if (validatedUrl !== parsedResponse.action_context.url) {
              console.log(
                `✅ URL corrected from: ${parsedResponse.action_context.url} to: ${validatedUrl}`
              );
              parsedResponse.action_context.url = validatedUrl;
            } else {
              console.log(`✅ URL validated successfully: ${validatedUrl}`);
            }
          }
        } catch (e) {
          const availableData = {
            mainContent: context.mainContent || [],
            relevantQAs: context.relevantQAs || [],
            pageData: null,
          };
          const validatedUrl = validateAndFixUrl(
            parsedResponse.action_context.url,
            message,
            classification,
            availableData
          );
          if (!validatedUrl) {
            console.log(
              `❌ URL validation failed for: ${parsedResponse.action_context.url}`
            );
            parsedResponse.action = "none";
            parsedResponse.action_context = {};
            parsedResponse.answer =
              parsedResponse.answer +
              " (Note: The specific page you're looking for wasn't found, but I hope this information helps!)";
          } else if (validatedUrl !== parsedResponse.action_context.url) {
            parsedResponse.action_context.url = validatedUrl;
          }
        }
      }

      // ... rest of the existing parsedResponse processing
    } catch (e) {
      console.warn(
        "Failed to parse GPT's response as JSON, attempting to fix:",
        e
      );

      // Check if the response looks like JSON (starts with { and ends with })
      if (
        aiResponse.trim().startsWith("{") &&
        aiResponse.trim().endsWith("}")
      ) {
        try {
          // Try to clean the JSON by handling common issues
          // Replace any unescaped quotes in JSON strings
          const cleanedJson = aiResponse
            .replace(/:\s*"([^"\\]*(\\.[^"\\]*)*)"\s*([,}])/g, ': "$1"$3') // Fix potential quote issues
            .replace(/([a-zA-Z0-9_]+)(\s*:)/g, '"$1"$2'); // Ensure all keys are properly quoted

          parsedResponse = JSON.parse(cleanedJson);

          // Ensure action_context is always an object
          if (
            !parsedResponse.action_context ||
            typeof parsedResponse.action_context !== "object"
          ) {
            parsedResponse.action_context = {};
          }

          console.log("Successfully fixed and parsed JSON");
        } catch (innerError) {
          // If cleaning fails, create a properly formatted JSON response
          console.warn("Failed to fix JSON, creating fallback response");

          // Extract content between first { and last } to try to preserve the structure
          const contentMatch = aiResponse.match(/\{([\s\S]*)\}/);
          let extractedAnswer =
            "I apologize, but I couldn't process your request correctly.";

          if (contentMatch && contentMatch[0]) {
            // Try to extract the answer field if it exists
            const answerMatch = aiResponse.match(
              /"answer"\s*:\s*"([^"\\]*(\\.[^"\\]*)*)"/
            );
            if (answerMatch && answerMatch[1]) {
              extractedAnswer = answerMatch[1];
            }
          }

          // Create a valid parsedResponse
          parsedResponse = {
            answer: extractedAnswer,
            action: "none" as const,
            url: null,
            action_context: {},
          };
        }
      } else {
        // If not JSON-like at all, create a plain text response
        parsedResponse = {
          answer: aiResponse,
          action: "none" as const,
          url: null,
          action_context: {},
        };
      }
    }

    // Apply minimal-actions filter BEFORE formatting response
    // Default to none for basic informational answers unless explicit action intent detected
    if (parsedResponse && typeof parsedResponse === "object") {
      const msgLower = message.toLowerCase();
      const explicitActionPhrases = [
        "take me",
        "show me",
        "go to",
        "open",
        "navigate",
        "click",
        "highlight",
        "scroll",
        "add to cart",
        "buy",
        "purchase",
        "log in",
        "login",
        "log out",
        "logout",
        "track",
        "return",
        "cancel",
        "exchange",
      ];
      const hasExplicitIntent = explicitActionPhrases.some((p) =>
        msgLower.includes(p)
      );

      const isContinuationFlow = [
        "get_orders",
        "track_order",
        "return_order",
        "cancel_order",
        "exchange_order",
        "fill_form",
        "account_management",
        "account_reset",
      ].includes((parsedResponse.action as any) || "");

      // If the model proposed a UI action but the user didn't explicitly ask and it's not a continuation, prefer none
      if (
        parsedResponse.action &&
        parsedResponse.action !== "none" &&
        !hasExplicitIntent &&
        !isContinuationFlow
      ) {
        parsedResponse.action = "none" as const;
        // keep the assistant's textual answer as-is
        parsedResponse.action_context = {} as any;
      }

      // For on-page answers, require explicit highlight/scroll request
      if (
        (parsedResponse.action === "highlight_text" ||
          parsedResponse.action === "scroll") &&
        !hasExplicitIntent
      ) {
        parsedResponse.action = "none" as const;
        parsedResponse.action_context = {} as any;
      }
    }

    // Format response
    const formattedResponse: FormattedResponse = {
      action: (parsedResponse.action as any) || "none",
      answer: parsedResponse.answer || aiResponse,
      category: "discovery",
      pageId: "chat",
      pageTitle: "Chat",
      question: message,
      scrollText: "",
      subcategory: "content_overview",
      type: type,
      url: website.url,
      action_context: parsedResponse.action_context || {},
    };

    // If aiResponse is a JSON string, parse it and update the response
    if (typeof aiResponse === "string" && aiResponse.trim().startsWith("{")) {
      try {
        const parsedResponse = JSON.parse(aiResponse);
        if (parsedResponse && typeof parsedResponse === "object") {
          formattedResponse.action = parsedResponse.action || "none";
          formattedResponse.answer = parsedResponse.answer || aiResponse;
          formattedResponse.action_context =
            parsedResponse.action_context || {};
        }
      } catch (e) {
        // If parsing fails, keep the original answer
        console.log("Response is not valid JSON, using as-is");
      }
    }

    // Check if the action is a disabled image generation type
    if (
      formattedResponse.action === "generate_image" &&
      !website.allowAutoGenerateImage
    ) {
      formattedResponse.action = "none";
      formattedResponse.answer = `I'm sorry, I'm unable to generate images at the moment. This feature will be available soon. Would you like me to help you with something else?`;
      formattedResponse.action_context = {};
    }

    // Preserve return flow: if model attempted to use contact for a return, override to return_order when allowed
    if (formattedResponse.action === "contact" && website.allowAutoReturn) {
      const isReturnContext =
        classification?.action_intent === "return_order" ||
        enhancedPreviousContext?.previousAction === "return_order" ||
        /\breturn(ing)?\b|send\s*back/i.test(message);

      if (isReturnContext) {
        formattedResponse.action = "return_order";
        if (!formattedResponse.action_context) {
          formattedResponse.action_context = {};
        }

        // Extract basic order info from the message if present
        const orderIdMatch = message.match(/\b(\d{4,})\b/i);
        const emailMatch = message.match(
          /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i
        );
        if (orderIdMatch && orderIdMatch[1]) {
          (formattedResponse.action_context as any).order_id = orderIdMatch[1];
        }
        if (emailMatch && emailMatch[1]) {
          (formattedResponse.action_context as any).order_email = emailMatch[1];
        }

        // Remove contact-form specific fields if present
        if ((formattedResponse.action_context as any).contact_help_form) {
          delete (formattedResponse.action_context as any).contact_help_form;
        }
        if ((formattedResponse.action_context as any).message) {
          delete (formattedResponse.action_context as any).message;
        }

        // Provide a clear, helpful return-specific answer
        formattedResponse.answer =
          "I'll help you process your return request. Could you provide your order number and the reason for your return?";
      }
    }

    // Ensure return_order answers are helpful and consistent
    if (formattedResponse.action === "return_order") {
      if (!formattedResponse.action_context) {
        formattedResponse.action_context = {};
      }
      formattedResponse.answer =
        "I'll help you process your return request. Could you provide your order number and the reason for your return?";
    }

    // Handle return/exchange when auto settings are disabled
    if (
      (formattedResponse.action === "return_order" &&
        !website.allowAutoReturn) ||
      (formattedResponse.action === "exchange_order" &&
        !website.allowAutoExchange)
    ) {
      const actionTypeMap = {
        return_order: "process returns",
        exchange_order: "process exchanges",
      };

      const originalAction =
        formattedResponse.action as keyof typeof actionTypeMap;

      // Look for policy pages
      let policyUrl = null;
      const policyType =
        originalAction === "return_order" ? "return-policy" : "refund-policy";
      const secondaryPolicyType =
        originalAction === "return_order" ? "refund-policy" : "return-policy";

      // First check for the primary policy type
      policyUrl = findPolicyPage(
        {
          mainContent: context.mainContent,
          relevantQAs: context.relevantQAs,
          pageData: pageData,
        },
        policyType
      );

      // If not found, check for secondary policy type
      if (!policyUrl) {
        policyUrl = findPolicyPage(
          {
            mainContent: context.mainContent,
            relevantQAs: context.relevantQAs,
            pageData: pageData,
          },
          secondaryPolicyType
        );
      }

      if (policyUrl) {
        formattedResponse.action = "redirect";
        formattedResponse.url = policyUrl;
        formattedResponse.answer = `I'm unable to ${actionTypeMap[originalAction]} directly through this chat. Let me show you our policy regarding returns and exchanges.`;
        formattedResponse.action_context = {};
      } else {
        formattedResponse.action = "none";
        formattedResponse.answer = `I'm currently unable to ${actionTypeMap[originalAction]} automatically. Please contact the company directly for assistance.`;
        formattedResponse.action_context = {};
      }
    }

    // Normalize return reason if present
    if (
      formattedResponse.action === "return_order" &&
      formattedResponse.action_context
    ) {
      const currentReason = (formattedResponse.action_context as any)
        .returnReason;
      if (currentReason !== undefined) {
        (formattedResponse.action_context as any).returnReason =
          normalizeReturnReason(currentReason);
      }
      const currentNote = (formattedResponse.action_context as any)
        .returnReasonNote;
      (formattedResponse.action_context as any).returnReasonNote =
        coerceReturnReasonNote(
          (formattedResponse.action_context as any).returnReason,
          currentNote
        );
    }

    // Save messages to database
    try {
      // Create user message first
      await query(
        `INSERT INTO AiMessage (id, threadId, role, content, type, createdAt)
         VALUES (UUID(), ?, 'user', ?, ?, NOW())`,
        [aiThread.id, message, type]
      );

      // Then create assistant message
      await query(
        `INSERT INTO AiMessage (id, threadId, role, content, type, createdAt)
         VALUES (UUID(), ?, 'assistant', ?, 'text', NOW())`,
        [aiThread.id, aiResponse]
      );

      // Update thread's last message timestamp
      await query(`UPDATE AiThread SET lastMessageAt = NOW() WHERE id = ?`, [
        aiThread.id,
      ]);
    } catch (dbError) {
      console.error("Error saving messages to database:", dbError);
      // Continue even if database operations fail
    }

    // Return success response
    console.log("Formatted Response:", formattedResponse);

    timeMarks.totalMs = Date.now() - t0;
    return cors(
      request,
      NextResponse.json({
        response: formattedResponse,
        responseId: completion.id,
        threadId: aiThread.threadId,
        context: {
          mainContent: context.mainContent,
          relevantQAs: context.relevantQAs,
          classification,
        },
        timings: timeMarks,
        success: true,
      })
    );
  } catch (error: any) {
    console.error("Chat error:", error);

    // Create a fallback response
    const fallbackResponse: FormattedResponse = {
      action: "none",
      answer:
        "I apologize, but I encountered an error processing your request. Please try again in a moment.",
      category: "discovery",
      pageId: "error",
      pageTitle: "Error",
      question: body.message || "Unknown question",
      scrollText: "",
      subcategory: "content_overview",
      type: body.type || "text",
      url: website?.url || "",
      action_context: {},
    };

    // Return error response
    return cors(
      request,
      NextResponse.json(
        {
          response: fallbackResponse,
          threadId: body.threadId || crypto.randomUUID(),
          context: {
            mainContent: null,
            relevantQAs: [],
          },
          success: false,
          error: true,
          errorMessage: error.message || "An unexpected error occurred",
        },
        { status: 500 }
      )
    );
  }
}

// Helper function to handle disabled actions
function handleDisabledAction(
  request: NextRequest,
  website: WebsiteWithAutoSettings,
  message: string,
  type: "text" | "voice",
  threadId: string | undefined,
  actionType: string,
  originalAction: string
): NextResponse {
  const disabledResponse: FormattedResponse = {
    action: "none",
    answer: `I'm currently unable to ${actionType} automatically. Please contact the company directly for assistance.`,
    category: "discovery",
    pageId: "error",
    pageTitle: "Error",
    question: message,
    scrollText: "",
    subcategory: "content_overview",
    type: type,
    url: website.url,
    action_context: {},
  };

  return cors(
    request,
    NextResponse.json({
      response: disabledResponse,
      threadId: threadId || crypto.randomUUID(),
      context: {
        mainContent: null,
        relevantQAs: [],
      },
      success: true,
    })
  );
}

// Helper function for unsupported actions that should suggest alternatives
function handleUnsupportedAction(
  request: NextRequest,
  website: WebsiteWithAutoSettings,
  message: string,
  type: "text" | "voice",
  threadId: string | undefined,
  actionType: string,
  originalAction: string
): NextResponse {
  const unsupportedResponse: FormattedResponse = {
    action: "none",
    answer: `I'm sorry, I'm unable to ${actionType} automatically right now. Would you like to try something else?`,
    category: "discovery",
    pageId: "error",
    pageTitle: "Error",
    question: message,
    scrollText: "",
    subcategory: "content_overview",
    type: type,
    url: website.url,
    action_context: {},
  };

  return cors(
    request,
    NextResponse.json({
      response: unsupportedResponse,
      threadId: threadId || crypto.randomUUID(),
      context: {
        mainContent: null,
        relevantQAs: [],
      },
      success: true,
    })
  );
}

function isOrderRelatedQuery(message: string): boolean {
  const orderTerms = [
    "order",
    "package",
    "delivery",
    "shipped",
    "tracking",
    "purchase",
    "bought",
    "received",
    "item",
    "product",
    "confirmation",
    "email",
    "number",
    "status",
    "yes",
    "sure",
    "okay",
    "ok",
    "correct",
    "that's right",
    "exactly",
  ];

  // Check for numbers that could be order numbers
  const hasOrderNumber = /\b\d{4,}\b/.test(message);

  // Check for email addresses
  const hasEmail = /[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+/.test(
    message
  );

  // Check for confirmation language
  const isConfirmation =
    /^(yes|sure|ok|okay|correct|that's right|exactly|confirmed)\.?$/i.test(
      message.trim()
    );

  // Return true if the message contains order terms, has an order number, contains an email, or is a simple confirmation
  return (
    orderTerms.some((term) => message.toLowerCase().includes(term)) ||
    hasOrderNumber ||
    hasEmail ||
    isConfirmation
  );
}

// Add the new handler function for "coming soon" features
function handleComingSoonAction(
  request: NextRequest,
  website: WebsiteWithAutoSettings,
  message: string,
  type: "text" | "voice",
  threadId: string | undefined,
  actionType: string,
  originalAction: string
): NextResponse {
  const comingSoonResponse: FormattedResponse = {
    action: "none",
    answer: `I'm unable to ${actionType} right now, but this feature will be available very soon. Please check back in the near future!`,
    category: "discovery",
    pageId: "error",
    pageTitle: "Error",
    question: message,
    scrollText: "",
    subcategory: "content_overview",
    type: type,
    url: website.url,
    action_context: {},
  };

  return cors(
    request,
    NextResponse.json({
      response: comingSoonResponse,
      threadId: threadId || crypto.randomUUID(),
      context: {
        mainContent: null,
        relevantQAs: [],
      },
      success: true,
    })
  );
}
