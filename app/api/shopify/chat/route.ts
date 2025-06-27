import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, AiThread, AiMessage } from "@prisma/client";
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Client } from "@opensearch-project/opensearch";
import { cors } from "../../../../lib/cors";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import {
  FINAL_MAIN_PROMPT,
  MAIN_PROMPT,
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
} from "@/lib/systemPrompts";
import Stripe from "stripe";
export const dynamic = "force-dynamic";

const prisma = new PrismaClient();
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});
const openai = new OpenAI();
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
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

// Helper function to generate sparse vectors using OpenSearch
async function generateSparseVectors(
  text: string,
  classification: QuestionClassification | null = null
) {
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
      } as any,
    });

    // Add classification terms with higher weight if available
    const content = classification
      ? `${text} ${classification.type} ${classification.type} ${classification.type} ${classification.category} ${classification.category} ${classification["sub-category"]} ${classification["sub-category"]}`
      : text;

    // Index the document
    await opensearch.index({
      index: indexName,
      body: { content },
      refresh: true,
    });

    // Get term vectors with BM25 stats
    const response = await opensearch.transport.request({
      method: "GET",
      path: `/${indexName}/_termvectors`,
      body: {
        doc: { content },
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
      .sort((a: any, b: any) => {
        const scoreA = (a[1] || {}).score || 0;
        const scoreB = (b[1] || {}).score || 0;
        return scoreB - scoreA;
      })
      .slice(0, 1000)
      .forEach(([_, stats]: any, idx: number) => {
        const tf = (stats || {}).term_freq || 0;
        const docFreq = (stats || {}).doc_freq || 1;
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

// Function to classify question using fine-tuned model
async function classifyQuestion(
  question: string,
  previousContext: PreviousContext | null = null,
  pageData: any = null
): Promise<QuestionClassification | null> {
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
    if (
      typeof previousContext.answer === "string" &&
      previousContext.answer.startsWith("{")
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

  const SYSTEM_PROMPT = `You are an AI assistant that classifies e-commerce questions into specific types, categories, and sub-categories.

When a user asks a question, you must respond with a JSON object containing these fields:
- type: one of ["product", "post", "collection", "discount", "page"]
- category: depends on the type
- sub-category: depends on the type and category
- action_intent: one of ["redirect", "click", "scroll", "fill_form", "purchase", "track_order", "get_orders", "return_order", "cancel_order", "refund_order", "exchange_order", "login", "logout", "account_reset", "account_management", "scheduler", "highlight_text", "generate_image", "contact", "none"]
- context_dependency: "high" or "low"
- language: ISO 639-1 language code (e.g., "en", "es", "fr", "de", etc.)
- content_targets: an object containing relevant targets for the action

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

Valid combinations are:

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

CRITICAL CLASSIFICATION PRIORITIES:
1.  The users question and the current page context are the primary basis for classification
2. if the question has the answer on the main content of the page then use the "on-page" category
 - then feel free to use "highlight_text" or "scroll" action_intent to help the user find the information they need
 - make sure when highlighting or scrolling that you are using the correct exact text you find from the text in the page data
 - smaller chunks of text are better than larger chunks when inputting it

CATEGORY AND ACTION INTENT RULES (CRITICAL):
 - For "discovery" category (when answer isn't on current page):
   * ONLY use "redirect" action_intent - NEVER use "scroll" or "highlight_text"
   * Use "redirect" to send the user to a page where the answer can be found
   * If no appropriate URL is available, use "none" action_intent with a helpful response
 - For "on-page" category (when answer is on current page):
   * Use "scroll" or "highlight_text" action_intent to help users find information
   * NEVER use "redirect" action_intent for "on-page" category
 - This category-action pairing is MANDATORY - violating it will result in navigation errors

SCROLL AND HIGHLIGHT TEXT RULES (CRITICAL):
 - When selecting text for highlighting or scrolling:
   * Use SMALL chunks (3-5 words maximum)
   - you must only choose exact text inside of the full_text part of the relevantPageData
   - your only allowed to highlight a word 5 sequence maximum
   - When user EXPLICITLY requests "highlight [text]" or "scroll to [text]", use EXACTLY the text they specified
   - DO NOT automatically expand product names or add additional information to the highlight text the user requested
   - NEVER include newline characters (\n) in the exact_text field as they don't render on webpages
   - Break longer content into separate, smaller logical chunks
   - Choose focused text that directly answers the user's question
   - For lists, select only one specific item rather than the entire list
   - Always verify the text exists exactly as copied in the page data
   * Use titles, headers, or key sentences when possible
   * Ensure the exact_text field is a continuous string with no line breaks

3. if the question doesn't have an answer on the current page then use the "discovery" category
 - use redirect action_intent to send the user to the correct page
 - you don't have to fill in the action_context for the redirect action_intent if you don't see a url that can help you
4. for all other categories above follow what the word says
 - if its tips give a tip
 - if its instructions give instructions
 - if its eligibility give eligibility
 etc...


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
 - Examples of queries that MUST use "account_management":
   * "I need to update my account"
   * "Change my email address"
   * "Update my shipping address"
   * "Edit my profile information"
   * "Change my first name"
   * "I want to modify my account details"
   * "Update my phone number"
   * "I need to change my last name"
   * "Edit my default address"

PRODUCT VISUALIZATION (CRITICAL):
   - use "generate_image" action_intent when user asks to see their virtual try-on
   - only do a "generate_image" action_intent if the user is on a product page and the product is wearable and they specifically ask to see the product on them

URL HANDLING FOR REDIRECTS (EXTREMELY IMPORTANT):
 - ALWAYS use the EXACT handle for all URLs - NEVER use partial matches or approximations
 - Pages vs Collections URL formats MUST follow these STRICT rules:
   * For regular pages: ALWAYS use "/pages/[handle]"
   * For collections/products (plural): ALWAYS use "/collections/[handle]"
   * For individual products: ALWAYS use "/products/[handle]"
   * For blog posts: ALWAYS use "/blogs/[handle]"
   * For policy pages: ALWAYS use "/policies/[handle]" (NOT "/pages/")
 - When user mentions "products", "shop", "collections", or any plural product term:
   * ALWAYS redirect to a collection with "/collections/[handle]"
   * NEVER redirect to pages in this case
 - If user asks for a collection by name that doesn't match complete collection name:
   * DO NOT use the partial name
   * ALWAYS use the COMPLETE collection handle from available data
   * Example: If user asks for "winter gear" but collection is named "winter-sports-collection", 
     use "/collections/winter-sports-collection"
 - NEVER create or invent URLs - only use URLs found in the available data
 - For policy pages (handles containing privacy-policy, return-policy, refund-policy, contact-information, terms-of-service or shipping-policy), use URL format "/policies/[handle]" instead of regular page URL
 - This URL formatting is CRITICALLY IMPORTANT - incorrect URL paths will cause navigation errors

CONTENT TYPE DOUBLE-CHECK (CRITICAL):
 - ALWAYS verify the actual content type before determining URL format
 - Even if classified as "page", if the content appears to be a collection of products:
   * Use "/collections/[handle]" instead of "/pages/[handle]"
 - If a user asks for a specific product category, sport equipment, apparel, or anything with "ball" in the name:
   * These are likely collections, NOT pages
   * Example: If user asks for "soccer balls" or "soccer ball page" use "/collections/soccer-ball", NOT "/pages/soccer-ball"
 - Common collection indicators in user queries:
   * Mentions of products (plural form)
   * Sports equipment (footballs, soccer balls, basketballs)
   * Apparel categories (shirts, shoes, pants)
 - Check both the handle AND query context when determining URL format
 - When in doubt about page vs collection, prefer "/collections/[handle]"
 - Be particularly careful with these commonly confused terms:
   * "Soccer ball page", "basketball section", "football area" → These are collections (/collections/soccer-ball)
   * "About us page", "contact page", "FAQ page" → These are pages (/pages/about-us)

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
5. make sure to fill in all parts exactly as you see them for the the form fields bu take the values from the user and make sure they are good

LANGUAGE DETECTION (CRITICAL):
1. You MUST identify the language of the user's question
2. Include a "language" field in your response with the ISO language code (e.g., "en", "es", "fr", "de", etc.)
3. Support at least these common languages: English (en), Spanish (es), French (fr), German (de), Chinese (zh), Japanese (ja), Portuguese (pt), Italian (it), Russian (ru), Arabic (ar)
4. For languages that aren't in this common list, use their proper ISO 639-1 code
5. This language field will be used to determine which language to respond in


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
  * Query uses plural forms without discount terms

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
  * The query indicates the user wants to track or locate specific orders, even if multiple
- Classify as CANCEL_ORDER if:
  * Query mentions "cancel" or "stop" with "order"
  * User wants to prevent an order from being processed or shipped
  * Captures order_id and order_email when provided
- Classify as RETURN_ORDER if:
  * Query mentions "return" or "send back" items
  * User wants to initiate a return process
  * Captures order_id and order_email when provided
- Classify as REFUND_ORDER if:
  * Query mentions "refund" or "get money back"
  * User wants to get a refund for their purchase
  * Captures order_id and order_email when provided
- Classify as EXCHANGE_ORDER if:
  * Query mentions "exchange", "swap", or "replace with different" for ordered items
  * User wants to exchange one product for another
  * Captures order_id and order_email when provided



  


Always respond with ONLY the JSON classification. Do not include any other text or explanation.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
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
      temperature: 0,
    });

    const content = completion.choices[0].message.content;
    if (!content) {
      throw new Error("No content returned from classification model");
    }

    const classification = JSON.parse(content) as QuestionClassification;

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
    // Check for product name without using a specific regex that could be null
    const match = previousContext.answer.match(/The 3p Fulfilled Snowboard/i);
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
    const match = previousContext.answer.match(/The 3p Fulfilled Snowboard/i);
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
  // Always start with the main prompt
  let prompt = MAIN_PROMPT + "\n\n";

  // Add type-specific prompts based on classification
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
  let body: {
    message: string;
    websiteId?: string;
    accessKey?: string;
    threadId?: string;
    type: "text" | "voice";
    pastContext?: PreviousContext[];
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

  try {
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
      currentPageUrl,
      pageData,
    } = body;

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
    if (websiteId) {
      website = await prisma.website.findUnique({
        where: { id: websiteId },
        select: {
          id: true,
          url: true,
          plan: true,
          monthlyQueries: true,
          customInstructions: true,
          allowAutoCancel: true,
          allowAutoReturn: true,
          allowAutoExchange: true,
          allowAutoClick: true,
          allowAutoScroll: true,
          allowAutoHighlight: true,
          allowAutoRedirect: true,
          allowAutoGetUserOrders: true,
          allowAutoUpdateUserInfo: true,
          allowAutoFillForm: true,
          allowAutoTrackOrder: true,
          allowAutoLogout: true,
          allowAutoLogin: true,
          allowAutoGenerateImage: true,
          stripeSubscriptionId: true,
          stripeSubscriptionItemId: true,
        },
      });
    } else if (accessKey) {
      website = await prisma.website.findFirst({
        where: {
          accessKeys: {
            some: {
              key: accessKey,
            },
          },
        },
        select: {
          id: true,
          url: true,
          plan: true,
          monthlyQueries: true,
          customInstructions: true,
          allowAutoCancel: true,
          allowAutoReturn: true,
          allowAutoExchange: true,
          allowAutoClick: true,
          allowAutoScroll: true,
          allowAutoHighlight: true,
          allowAutoRedirect: true,
          allowAutoGetUserOrders: true,
          allowAutoUpdateUserInfo: true,
          allowAutoFillForm: true,
          allowAutoTrackOrder: true,
          allowAutoLogout: true,
          allowAutoLogin: true,
          allowAutoGenerateImage: true,
          stripeSubscriptionId: true,
          stripeSubscriptionItemId: true,
        },
      });
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

    // Special handling for Beta plan - just increment queries and skip other checks
    if (website.plan === "Beta") {
      // Increment monthly queries
      await prisma.website.update({
        where: { id: website.id },
        data: { monthlyQueries: { increment: 1 } },
      });
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
              await prisma.website.update({
                where: { id: website.id },
                data: {
                  plan: "Enterprise",
                  stripeSubscriptionItemId: updated.items.data[0].id,
                },
              });

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

    // Convert return, exchange, and refund to contact actions
    if (
      messageHasReturnOrder ||
      messageHasExchangeOrder ||
      messageHasRefundRequest
    ) {
      let actionType = "return";
      if (messageHasExchangeOrder) {
        actionType = "exchange";
      } else if (messageHasRefundRequest) {
        actionType = "refund";
      }

      const response = {
        action: "contact",
        answer: `I'll connect you with our customer service team who can help process your ${actionType} request. Could you provide your order number and any relevant details?`,
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
          message: `User is requesting to ${actionType} an order.`,
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

    // Increment monthly queries if not already done for Beta plan
    if (website.plan !== "Beta") {
      await prisma.website.update({
        where: { id: website.id },
        data: { monthlyQueries: { increment: 1 } },
      });
    }

    // Check if website is on Enterprise plan or needs upgrade
    if (website.plan === "Enterprise") {
      // Track usage in Stripe for Enterprise plan
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
        // Get user ID for customer mapping
        const user = await prisma.user.findFirst({
          where: { id: website.userId },
          select: { stripeCustomerId: true },
        });

        if (user?.stripeCustomerId) {
          // Create billing meter event with customer_id instead of subscription_item
          const meterEvent = await stripe.billing.meterEvents.create({
            event_name: "api_requests", // EXACTLY the meter name configured in your Stripe Dashboard
            payload: {
              stripe_customer_id: user.stripeCustomerId,
              value: "1", // Quantity of usage to record
            },
            timestamp: Math.floor(Date.now() / 1000), // Unix timestamp in seconds
            // Optionally: identifier: "your-unique-id-1234",
          });

          console.log("Successfully recorded meter event:", meterEvent);
        }
      } catch (error) {
        console.error("Failed to record Enterprise usage:", error);
      }
    } else if (website.monthlyQueries >= 1000) {
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
          await prisma.website.update({
            where: { id: website.id },
            data: {
              plan: "Enterprise",
              stripeSubscriptionItemId: updated.items.data[0].id,
              queryLimit: 0, // Set queryLimit to 0 for unlimited usage
            },
          });

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
      aiThread = (await prisma.aiThread.findFirst({
        where: {
          OR: [{ id: threadId }, { threadId: threadId }],
          websiteId: website.id,
        },
        include: {
          messages: {
            orderBy: {
              createdAt: "desc",
            },
            take: 4, // Get last 4 messages for context
          },
        },
      })) as ThreadWithMessages;

      if (!aiThread) {
        return cors(
          request,
          NextResponse.json({ error: "Thread not found" }, { status: 404 })
        );
      }
    } else {
      // Create new thread
      aiThread = (await prisma.aiThread.create({
        data: {
          threadId: crypto.randomUUID(),
          websiteId: website.id,
          messages: {
            create: [], // Empty array for new thread
          },
        },
        include: {
          messages: true,
        },
      })) as ThreadWithMessages;
    }

    // Get namespaces from VectorDbConfig
    let mainNamespace = website.id;
    let qaNamespace = `${website.id}-qa`;

    // Try to get configured namespaces from DB if available
    const vectorDbConfig = await prisma.vectorDbConfig.findUnique({
      where: { websiteId: website.id },
    });

    if (vectorDbConfig) {
      mainNamespace = vectorDbConfig.MainNamespace;
      qaNamespace = vectorDbConfig.QANamespace;
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
      if (
        typeof previousContext.answer === "string" &&
        previousContext.answer.startsWith("{")
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

    // Classify the question with the enhanced function that supports page data
    const classification = await classifyQuestion(
      message,
      enhancedPreviousContext,
      pageData
    );
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

    // Initialize embeddings
    const embeddings = new OpenAIEmbeddings({
      modelName: "text-embedding-3-large",
    });

    // Generate vectors for the query with classification
    const queryEmbedding = await embeddings.embedQuery(message);
    const sparseVectors = await generateSparseVectors(message, classification);

    // Create enhanced query using provided previous context
    const enhancedQuery = previousContext
      ? `${message} ${previousContext.question} ${previousContext.answer}`
      : message;

    const enhancedEmbedding = await embeddings.embedQuery(enhancedQuery);
    const enhancedSparseVectors = await generateSparseVectors(
      enhancedQuery,
      classification
    );

    // Define search functions outside the block to avoid strict mode errors
    const performMainSearch = async () => {
      // Collection query if necessary
      let collectionSearchResponse = null;
      // Safe access with null check
      if (classification && classification.type === "collection") {
        // Use the actual query terms for collection search
        const collectionQuery = `${message} ${classification.type}`;
        const collectionEmbedding = await embeddings.embedQuery(
          collectionQuery
        );
        const collectionSparseVectors = await generateSparseVectors(
          collectionQuery,
          classification
        );

        collectionSearchResponse = await pinecone
          .index("voicero-hybrid")
          .namespace(mainNamespace)
          .query({
            vector: collectionEmbedding,
            sparseVector: collectionSparseVectors,
            topK: 20,
            includeMetadata: true,
          });
      }

      // Perform hybrid search in main namespace
      const mainSearchResponse = await pinecone
        .index("voicero-hybrid")
        .namespace(mainNamespace)
        .query({
          vector: queryEmbedding,
          sparseVector: sparseVectors,
          topK: 20,
          includeMetadata: true,
        });

      // If we have collection results, merge them with main results for final response
      let finalMainResults = [...mainSearchResponse.matches];
      if (collectionSearchResponse) {
        collectionSearchResponse.matches.forEach((collectionResult) => {
          // Only add if not already present
          if (!finalMainResults.some((r) => r.id === collectionResult.id)) {
            finalMainResults.push(collectionResult);
          }
        });
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
    };

    const performQASearch = async () => {
      // Perform hybrid search in QA namespace with enhanced query
      const qaSearchResponse = await pinecone
        .index("voicero-hybrid")
        .namespace(qaNamespace)
        .query({
          vector: enhancedEmbedding,
          sparseVector: enhancedSparseVectors,
          topK: 20,
          includeMetadata: true,
        });

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
    };

    // Execute both search operations in parallel
    const [rerankedMainResults, rerankedQAResults] = await Promise.all([
      performMainSearch(),
      performQASearch(),
    ]);

    // Take top results from each set
    const topMainResults = rerankedMainResults.slice(0, 2);
    const topQAResults = rerankedQAResults.slice(0, 3);

    // Prepare context for AI
    const context = {
      mainContent: topMainResults.map((r) => ({
        ...r.metadata,
        relevanceScore: r.rerankScore,
        classificationMatch: r.classificationMatch,
      })),
      relevantQAs: topQAResults.map((r) => ({
        question: r.metadata?.question,
        answer: r.metadata?.answer,
        url: r.metadata?.url || r.metadata?.productUrl,
        relevanceScore: r.rerankScore,
        classificationMatch: r.classificationMatch,
      })),
      previousContext,
      classification,
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

    // Extract up to the last 4 messages (2 question/answer pairs) from pastContext
    const messageContext = {
      ...context,
      // Include up to 4 recent messages in the context
      previousConversation:
        pastContext && pastContext.length > 0
          ? pastContext
              .slice(-Math.min(4, pastContext.length))
              .map((message) => ({
                role: message.role || (message.question ? "user" : "assistant"),
                content:
                  message.question ||
                  message.content ||
                  (message.answer?.startsWith("{")
                    ? JSON.parse(message.answer).answer
                    : message.answer || ""),
              }))
          : [],
      // Keep the most recent Q&A for backward compatibility
      previousContext:
        pastContext && pastContext.length >= 2
          ? {
              question:
                pastContext[pastContext.length - 2].question ||
                pastContext[pastContext.length - 2].content,
              answer: pastContext[pastContext.length - 1].answer?.startsWith(
                "{"
              )
                ? JSON.parse(pastContext[pastContext.length - 1].answer).answer
                : pastContext[pastContext.length - 1].answer ||
                  pastContext[pastContext.length - 1].content,
            }
          : null,
      mainContent: context.mainContent.map((item) => {
        if (item.type === "product") {
          return {
            bodyHtml: item.bodyHtml,
            description: item.description,
            handle: item.handle,
            productId: item.productId,
            priceRangeMin: item.priceRangeMin,
            priceRangeMax: item.priceRangeMax,
            type: item.type,
            title: item.title,
            status: item.status,
            totalInventory: item.totalInventory,
            variantInventories: item.variantInventories,
            variantPrices: item.variantPrices,
            variantTitles: item.variantTitles,
            relevanceScore: item.relevanceScore,
            classificationMatch: item.classificationMatch,
          };
        } else if (item.type === "collection") {
          return {
            collectionId: item.collectionId,
            description: item.description,
            handle: item.handle,
            productHandles: item.productHandles,
            productIds: item.productIds,
            productTitles: item.productTitles,
            title: item.title,
            type: item.type,
            relevanceScore: item.relevanceScore,
            classificationMatch: item.classificationMatch,
          };
        } else if (item.type === "page") {
          return {
            content: item.content,
            handle: item.handle,
            isPublished: item.isPublished,
            pageId: item.pageId,
            title: item.title,
            type: item.type,
            relevanceScore: item.relevanceScore,
            classificationMatch: item.classificationMatch,
          };
        }
        // For other types (post, discount), return the full item
        return item;
      }),
    };

    // Add logging to see what's being sent to the AI
    const filteredMainContent = context.mainContent.map((item) => {
      if (item.type === "product") {
        return {
          bodyHtml: item.bodyHtml,
          description: item.description,
          handle: item.handle,
          productId: item.productId,
          priceRangeMin: item.priceRangeMin,
          priceRangeMax: item.priceRangeMax,
          type: item.type,
          title: item.title,
          status: item.status,
          totalInventory: item.totalInventory,
          variantInventories: item.variantInventories,
          variantPrices: item.variantPrices,
          variantTitles: item.variantTitles,
          relevanceScore: item.relevanceScore,
          classificationMatch: item.classificationMatch,
        };
      } else if (item.type === "collection") {
        return {
          collectionId: item.collectionId,
          description: item.description,
          handle: item.handle,
          productHandles: item.productHandles,
          productIds: item.productIds,
          productTitles: item.productTitles,
          title: item.title,
          type: item.type,
          relevanceScore: item.relevanceScore,
          classificationMatch: item.classificationMatch,
        };
      } else if (item.type === "page") {
        return {
          content: item.content,
          handle: item.handle,
          isPublished: item.isPublished,
          pageId: item.pageId,
          title: item.title,
          type: item.type,
          relevanceScore: item.relevanceScore,
          classificationMatch: item.classificationMatch,
        };
      }
      // For other types (post, discount), return the full item
      return item;
    });

    // Format the previous context for display - include up to 4 recent messages
    const formattedPreviousConversation =
      pastContext && pastContext.length > 0
        ? pastContext
            .slice(-Math.min(4, pastContext.length))
            .map((message) => ({
              role: message.role || (message.question ? "user" : "assistant"),
              content: message.question
                ? message.question
                : message.answer?.startsWith("{")
                ? JSON.parse(message.answer).answer
                : message.answer,
            }))
        : [];

    // Keep the previous context format for backward compatibility
    const formattedPreviousContext =
      pastContext && pastContext.length >= 2
        ? {
            question: pastContext[pastContext.length - 2].question,
            answer: pastContext[pastContext.length - 1].answer?.startsWith("{")
              ? JSON.parse(pastContext[pastContext.length - 1].answer).answer
              : pastContext[pastContext.length - 1].answer,
          }
        : null;

    // Add logging with the expanded context
    console.dir(
      {
        currentPage: currentPageUrl || "Not provided",
        relevantPageData: relevantPageData || "None",
        context: {
          mainContent: filteredMainContent,
          relevantQAs: context.relevantQAs,
          classification,
          previousContext: formattedPreviousContext || "None",
          previousConversation: formattedPreviousConversation,
        },
        userMessage: message,
      },
      { depth: null, colors: true }
    );

    // Using Anthropic Claude model instead
    const completion = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20250219",
      system:
        SYSTEM_PROMPT +
        "\n\nIMPORTANT: Respond with ONLY the raw JSON object. Do NOT wrap the response in ```json or ``` markers.",
      messages: [
        {
          role: "user",
          content: `${
            currentPageUrl ? `Current page: ${currentPageUrl}\n\n` : ""
          }${
            pageData
              ? `Complete Page Data: ${JSON.stringify(pageData)}\n\n`
              : ""
          }Context: ${JSON.stringify(messageContext)}\n\nQuestion: ${message}`,
        },
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    // Extract OpenAI's response (different format than Anthropic)
    let aiResponse = "";
    let parsedResponse = {
      answer: "",
      action: null as string | null,
      url: null as string | null,
      action_context: {} as Record<string, any>,
    };

    // Extract Anthropic's response
    if (completion.content && completion.content.length > 0) {
      const contentBlock = completion.content[0];
      if (contentBlock.type === "text") {
        aiResponse = contentBlock.text;
      }
    }

    // Try to parse JSON response
    try {
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

      // ... rest of the existing parsedResponse processing
    } catch (e) {
      console.warn(
        "Failed to parse GPT's response as JSON, using plain text instead:",
        e
      );
      parsedResponse = {
        answer: aiResponse,
        action: null,
        url: null,
        action_context: {},
      };
    }

    // Format response
    const formattedResponse: FormattedResponse = {
      action: "none",
      answer: aiResponse,
      category: "discovery",
      pageId: "chat",
      pageTitle: "Chat",
      question: message,
      scrollText: "",
      subcategory: "content_overview",
      type: type,
      url: website.url,
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

    // Convert return, exchange, and refund to contact actions
    if (
      classification?.action_intent === "return_order" ||
      classification?.action_intent === "exchange_order" ||
      (message.toLowerCase().includes("return") &&
        message.toLowerCase().includes("order")) ||
      (message.toLowerCase().includes("exchange") &&
        message.toLowerCase().includes("order"))
    ) {
      const actionType =
        classification?.action_intent === "return_order" ||
        (message.toLowerCase().includes("return") &&
          message.toLowerCase().includes("order"))
          ? "return"
          : "exchange";

      formattedResponse.action = "contact";
      formattedResponse.answer = `I'll connect you with our customer service team who can help process your ${actionType} request. Could you provide your order number and any relevant details?`;
      formattedResponse.action_context = {
        contact_help_form: true,
        message: `User is requesting to ${actionType} an order.`,
      };
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

    // Handle return/exchange separately to check for policy pages when auto settings are disabled
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
        formattedResponse.action = "contact";
        formattedResponse.answer = `I'm unable to ${
          actionTypeMap[originalAction]
        } automatically. Let me connect you with customer service who can help with your ${
          originalAction === "return_order" ? "return" : "exchange"
        } request.`;
        formattedResponse.action_context = {
          contact_help_form: true,
          message: `User requested to ${actionTypeMap[originalAction]} (${originalAction}) but this feature is not enabled.`,
        };
      }
    }

    // Save messages to database
    try {
      // Create user message first
      await prisma.aiMessage.create({
        data: {
          threadId: aiThread.id,
          role: "user",
          content: message,
          type: type,
        },
      });

      // Then create assistant message
      await prisma.aiMessage.create({
        data: {
          threadId: aiThread.id,
          role: "assistant",
          content: aiResponse,
          type: "text", // Assistant response is always text
        },
      });

      // Update thread's last message timestamp
      await prisma.aiThread.update({
        where: { id: aiThread.id },
        data: { lastMessageAt: new Date() },
      });
    } catch (dbError) {
      console.error("Error saving messages to database:", dbError);
      // Continue even if database operations fail
    }

    // Return success response
    console.log("Formatted Response:", formattedResponse);

    return cors(
      request,
      NextResponse.json({
        response: formattedResponse,
        threadId: aiThread.threadId,
        context: {
          mainContent: context.mainContent,
          relevantQAs: context.relevantQAs,
          classification,
        },
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
    action: "contact",
    answer: `I'm currently unable to ${actionType} automatically. Please contact the business directly for assistance or go through your account dashboard.`,
    category: "discovery",
    pageId: "error",
    pageTitle: "Error",
    question: message,
    scrollText: "",
    subcategory: "content_overview",
    type: type,
    url: website.url,
    action_context: {
      contact_help_form: true,
      message: `User attempted to ${actionType} but this action is disabled. Original action: ${originalAction}`,
    },
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
