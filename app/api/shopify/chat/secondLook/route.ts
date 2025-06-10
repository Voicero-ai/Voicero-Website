import { NextRequest, NextResponse } from "next/server";
import { cors } from "../../../../../lib/cors";
import OpenAI from "openai";
export const dynamic = "force-dynamic";

const openai = new OpenAI();

// Define types
type WebsitePageData = {
  url: string;
  fullUrl?: string;
  path?: string;
  hostname?: string;
  title: string;
  fullText: string;
  metaTags?: Array<Record<string, string>>;
  headings?: Record<string, string[]>;
  isProductPage?: boolean;
  productInfo?: {
    name: string | null;
    price: string | null;
    currency: string | null;
    description: string | null;
    images: string[];
    sku: string | null;
    inStock: boolean | null;
  };
  forms?: Array<{
    id: string;
    action?: string;
    method?: string;
    classes?: string;
    inputCount?: number;
    hasSubmitButton?: boolean;
  }>;
  inputs?: Array<{
    type: string;
    id: string;
    name: string;
    placeholder?: string;
    label?: string | null;
  }>;
  links?: Array<{
    text: string;
    href: string;
    isInternal: boolean;
  }>;
  timestamp?: string;
  timezone?: string;
};

type ClientPayload = {
  sessionId: string;
  websitePageData: WebsitePageData;
  url: string;
  textContent: string;
  originalPageData: WebsitePageData;
  timestamp: string;
};

type SecondLookResponse = {
  answer: string;
  detected_elements: {
    forms?: Array<{
      id: string;
      purpose: string;
      required_fields: string[];
      has_suggestion: boolean;
    }>;
    product_info?: {
      name?: string;
      price?: string;
      has_reviews?: boolean;
      has_promotions?: boolean;
      has_shipping_info?: boolean;
    };
    calls_to_action?: Array<{
      text: string;
      type: "button" | "link" | "banner";
    }>;
    time_sensitive?: boolean;
  };
  suggested_action?: {
    type: "fill_form" | "view_product" | "check_promotion" | "none";
    context: Record<string, any>;
  };
};

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body: ClientPayload = await request.json();

    // Extract the website page data from the client payload
    const websitePageData = body.websitePageData;

    // Check if we have the required data
    if (!websitePageData) {
      return cors(
        request,
        NextResponse.json(
          { error: "Missing required field: websitePageData" },
          { status: 400 }
        )
      );
    }

    // Ensure we have the full text (using textContent as fallback)
    if (!websitePageData.fullText && body.textContent) {
      websitePageData.fullText = body.textContent;
    }

    // Default question for second look analysis
    const question =
      "What forms, product details, or important elements should I pay attention to on this page?";

    // Optional: use session ID or timestamp for tracking
    console.log(
      `Processing second look for session ${body.sessionId} at ${body.timestamp}`
    );

    // Prepare context from website data
    const context = prepareContext(websitePageData);

    // Generate system prompt
    const SYSTEM_PROMPT = `You are a helpful shopping assistant. Your job is to notice important elements on the current page and mention them briefly to the user.

Keep responses SHORT, SIMPLE and CONVERSATIONAL. Never use phrases like "second look" or "I notice" or "I see".

If you see input fields or forms, briefly mention them with a suggested action: "Want to enter your [email/quantity/etc]?"

If it's a product page:
- Briefly mention the price (especially if there's a sale)
- Note if there are reviews ("This has 45 five-star reviews")
- Mention if there are important product options ("You can choose between 3 colors")
- If it's clothing or wearable item (shirt, shoes, dress, etc.), suggest a virtual try-on ("Want to virtually try this on?")

IMPORTANT RULES:
1. Keep responses under 30 words total
2. Be direct and conversational - like a helpful friend
3. No lengthy explanations or introductions
4. Focus only on 1-2 most important elements
5. Phrase suggestions as questions
6. Never list multiple numbered points
7. Never use bullet points

BAD: "Taking a second look at this page, I notice there's a form where you can enter your email to subscribe to the newsletter."
GOOD: "Want to sign up for the newsletter with your email?"

BAD: "I can see this product has many features including: 1. High durability, 2. Water resistance, 3. Available in multiple colors"
GOOD: "This comes in multiple colors and is water-resistant. Want to select a color?"

For clothing items:
BAD: "I notice this is a clothing item. Would you like to use the virtual try-on feature to see how it looks on you?"
GOOD: "Want to virtually try this on to see how it looks?"`;

    // Call GPT-4.1 for response
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.7,
      max_tokens: 1000,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `Here is the webpage data to analyze:\n\n${context}\n\nQuestion: ${question}`,
        },
      ],
    });

    // Extract response
    const aiResponse =
      completion.choices[0].message.content?.trim() ||
      "I couldn't generate a response. Please try again.";

    // Return success response
    return cors(request, NextResponse.json(aiResponse));
  } catch (error: any) {
    console.error("Second Look error:", error);

    // Return error response
    return cors(
      request,
      NextResponse.json(
        "Sorry, I encountered an error analyzing this page. Please try again later.",
        { status: 500 }
      )
    );
  }
}

// Helper function to prepare context from website data
function prepareContext(websitePageData: WebsitePageData): string {
  let context = `URL: ${websitePageData.url}\n`;
  context += `TITLE: ${websitePageData.title}\n`;

  // Add product info if available
  if (websitePageData.isProductPage && websitePageData.productInfo) {
    const product = websitePageData.productInfo;
    context += `\nPRODUCT INFORMATION:\n`;
    if (product.name) context += `Name: ${product.name}\n`;
    if (product.price)
      context += `Price: ${product.price}${
        product.currency ? " " + product.currency : ""
      }\n`;
    if (product.description) context += `Description: ${product.description}\n`;
    if (product.sku) context += `SKU: ${product.sku}\n`;
    if (product.inStock !== null)
      context += `In Stock: ${product.inStock ? "Yes" : "No"}\n`;
    if (product.images && product.images.length > 0) {
      context += `Images: ${product.images.length} product images available\n`;
    }
  }

  // Add form information
  if (websitePageData.forms && websitePageData.forms.length > 0) {
    context += `\nFORMS ON PAGE (${websitePageData.forms.length}):\n`;
    websitePageData.forms.forEach((form, index) => {
      context += `[Form ${index + 1}] ID: ${form.id || "unnamed"}\n`;
      if (form.action) context += `  Action: ${form.action}\n`;
      if (form.method) context += `  Method: ${form.method}\n`;
      if (form.inputCount) context += `  Input Count: ${form.inputCount}\n`;
      context += `  Has Submit Button: ${
        form.hasSubmitButton ? "Yes" : "No"
      }\n`;
    });
  }

  // Add input field information
  if (websitePageData.inputs && websitePageData.inputs.length > 0) {
    context += `\nINPUT FIELDS (${websitePageData.inputs.length}):\n`;
    websitePageData.inputs.forEach((input, index) => {
      context += `[Input ${index + 1}] Type: ${input.type}, Name: ${
        input.name || "unnamed"
      }\n`;
      if (input.id) context += `  ID: ${input.id}\n`;
      if (input.placeholder) context += `  Placeholder: ${input.placeholder}\n`;
      if (input.label) context += `  Label: ${input.label}\n`;
    });
  }

  // Add link information (first 10 only)
  if (websitePageData.links && websitePageData.links.length > 0) {
    const visibleLinks = websitePageData.links.slice(0, 10);
    context += `\nIMPORTANT LINKS:\n`;
    visibleLinks.forEach((link, index) => {
      context += `[Link ${index + 1}] ${link.text || "unnamed"}: ${
        link.href
      }\n`;
    });
  }

  // Add headings for page structure
  if (websitePageData.headings) {
    if (websitePageData.headings.h1 && websitePageData.headings.h1.length > 0) {
      context += `\nMAIN HEADINGS:\n`;
      websitePageData.headings.h1.forEach((heading, i) => {
        context += `H1 [${i + 1}]: ${heading}\n`;
      });
    }

    if (websitePageData.headings.h2 && websitePageData.headings.h2.length > 0) {
      context += `\nSUB HEADINGS:\n`;
      websitePageData.headings.h2.slice(0, 5).forEach((heading, i) => {
        context += `H2 [${i + 1}]: ${heading}\n`;
      });
    }
  }

  // Add full page text (truncated if too long)
  const maxTextLength = 5000; // Limit to prevent token overflows
  let pageText = websitePageData.fullText || "";
  if (pageText.length > maxTextLength) {
    pageText = pageText.substring(0, maxTextLength) + "... [truncated]";
  }

  context += `\nPAGE CONTENT:\n${pageText}\n`;

  return context;
}

// Helper function to extract forms from website data
function extractForms(websitePageData: WebsitePageData):
  | Array<{
      id: string;
      purpose: string;
      required_fields: string[];
      has_suggestion: boolean;
    }>
  | undefined {
  if (
    !websitePageData.forms ||
    websitePageData.forms.length === 0 ||
    !websitePageData.inputs ||
    websitePageData.inputs.length === 0
  ) {
    return undefined;
  }

  return websitePageData.forms.map((form) => {
    // Try to determine form purpose based on input names
    let purpose = "unknown";

    // Find inputs that might be associated with this form by id
    const formInputs = websitePageData.inputs
      ? websitePageData.inputs.filter(
          (input: { id?: string; name?: string; type: string }) => {
            // Try to match inputs to forms by id pattern or just collect all if we can't match
            return form.id
              ? input.id?.includes(form.id) || input.name?.includes(form.id)
              : true;
          }
        )
      : [];

    const inputNames = formInputs.map((input: { name?: string }) =>
      (input.name || "").toLowerCase()
    );

    if (
      inputNames.some(
        (name) => name.includes("contact") || name.includes("message")
      )
    ) {
      purpose = "contact";
    } else if (
      inputNames.some(
        (name) => name.includes("subscribe") || name.includes("newsletter")
      )
    ) {
      purpose = "newsletter";
    } else if (inputNames.some((name) => name.includes("search"))) {
      purpose = "search";
    } else if (
      inputNames.some(
        (name) => name.includes("login") || name.includes("password")
      )
    ) {
      purpose = "login";
    } else if (
      inputNames.some(
        (name) => name.includes("checkout") || name.includes("payment")
      )
    ) {
      purpose = "checkout";
    }

    // Determine which fields might be required (simplistic approach)
    const requiredFields = formInputs
      .filter(
        (input: { type: string }) =>
          input.type !== "hidden" &&
          input.type !== "submit" &&
          input.type !== "button"
      )
      .map((input: { name?: string }) => input.name || "");

    return {
      id: form.id || "",
      purpose,
      required_fields: requiredFields,
      has_suggestion: requiredFields.length > 0,
    };
  });
}

// Helper function to extract product info from website data
function extractProductInfo(
  websitePageData: WebsitePageData,
  aiResponse: string
):
  | {
      name?: string;
      price?: string;
      has_reviews?: boolean;
      has_promotions?: boolean;
      has_shipping_info?: boolean;
    }
  | undefined {
  // Check if it's likely a product page
  const isProductPage =
    websitePageData.url.includes("/product/") ||
    websitePageData.url.includes("/p/") ||
    websitePageData.title.includes("Buy") ||
    websitePageData.title.includes("Shop") ||
    websitePageData.metaTags?.some((tag) => tag.name === "product") ||
    aiResponse.includes("product");

  if (!isProductPage) {
    return undefined;
  }

  // Extract potential product name from title
  let productName = websitePageData.title;
  if (productName.includes("|")) {
    productName = productName.split("|")[0].trim();
  } else if (productName.includes("-")) {
    productName = productName.split("-")[0].trim();
  }

  // Look for price pattern in full text
  const priceRegex = /(\$\d+(\.\d{2})?)|(\d+\.\d{2}\s*(USD|EUR|GBP))/i;
  const priceMatch = websitePageData.fullText.match(priceRegex);
  const price = priceMatch ? priceMatch[0] : undefined;

  // Check for reviews, promotions, shipping info
  const hasReviews =
    websitePageData.fullText.toLowerCase().includes("review") ||
    websitePageData.fullText.toLowerCase().includes("rating") ||
    websitePageData.fullText.toLowerCase().includes("star");

  const hasPromotions =
    websitePageData.fullText.toLowerCase().includes("sale") ||
    websitePageData.fullText.toLowerCase().includes("discount") ||
    websitePageData.fullText.toLowerCase().includes("offer") ||
    websitePageData.fullText.toLowerCase().includes("% off");

  const hasShippingInfo =
    websitePageData.fullText.toLowerCase().includes("shipping") ||
    websitePageData.fullText.toLowerCase().includes("delivery") ||
    websitePageData.fullText.toLowerCase().includes("return");

  return {
    name: productName,
    price,
    has_reviews: hasReviews,
    has_promotions: hasPromotions,
    has_shipping_info: hasShippingInfo,
  };
}

// Helper function to extract calls to action
function extractCallsToAction(
  websitePageData: WebsitePageData,
  aiResponse: string
): Array<{ text: string; type: "button" | "link" | "banner" }> | undefined {
  const actions: Array<{ text: string; type: "button" | "link" | "banner" }> =
    [];

  // Extract from buttons
  if (websitePageData.links) {
    websitePageData.links.forEach((link) => {
      const linkText = link.text.toLowerCase();
      if (
        linkText.includes("buy") ||
        linkText.includes("shop") ||
        linkText.includes("add to cart") ||
        linkText.includes("get") ||
        linkText.includes("subscribe") ||
        linkText.includes("download") ||
        linkText.includes("sign up") ||
        linkText.includes("register")
      ) {
        actions.push({
          text: link.text,
          type: "button",
        });
      }
    });
  }

  // Look for banner-like text in sections
  if (websitePageData.headings) {
    if (websitePageData.headings.h1 && websitePageData.headings.h1.length > 0) {
      websitePageData.headings.h1.forEach((heading) => {
        const text = heading.toLowerCase();
        if (
          (text.includes("limited time") ||
            text.includes("special offer") ||
            text.includes("sale") ||
            text.includes("discount")) &&
          text.length < 100 // Simple heuristic for banner-like text
        ) {
          actions.push({
            text: heading,
            type: "banner",
          });
        }
      });
    }

    if (websitePageData.headings.h2 && websitePageData.headings.h2.length > 0) {
      websitePageData.headings.h2.forEach((heading) => {
        const text = heading.toLowerCase();
        if (
          (text.includes("limited time") ||
            text.includes("special offer") ||
            text.includes("sale") ||
            text.includes("discount")) &&
          text.length < 100 // Simple heuristic for banner-like text
        ) {
          actions.push({
            text: heading,
            type: "banner",
          });
        }
      });
    }
  }

  return actions.length > 0 ? actions : undefined;
}

// Helper function to detect time-sensitive content
function detectTimeSensitiveContent(fullText: string): boolean {
  const timeSensitiveTerms = [
    "limited time",
    "ends soon",
    "offer expires",
    "sale ends",
    "only today",
    "last chance",
    "hours left",
    "countdown",
    "hurry",
    "while supplies last",
  ];

  return timeSensitiveTerms.some((term) =>
    fullText.toLowerCase().includes(term)
  );
}

// Helper function to determine the suggested action
function determineSuggestedAction(
  websitePageData: WebsitePageData,
  aiResponse: string
): {
  type: "fill_form" | "view_product" | "check_promotion" | "none";
  context: Record<string, any>;
} {
  // Default response
  let action: {
    type: "fill_form" | "view_product" | "check_promotion" | "none";
    context: Record<string, any>;
  } = {
    type: "none",
    context: {},
  };

  // Check if form filling is suggested based on response
  if (
    aiResponse.toLowerCase().includes("fill") ||
    aiResponse.toLowerCase().includes("form")
  ) {
    if (websitePageData.forms && websitePageData.forms.length > 0) {
      const form = websitePageData.forms[0]; // Take first form for simplicity
      const formInputs = websitePageData.inputs
        ? websitePageData.inputs.filter(
            (input: { id?: string; name?: string }) =>
              form.id
                ? input.id?.includes(form.id) || input.name?.includes(form.id)
                : true
          )
        : [];

      action = {
        type: "fill_form",
        context: {
          form_id: form.id || "",
          fields: formInputs.map(
            (input: { name?: string }) => input.name || ""
          ),
        },
      };
    }
  }
  // Check if product viewing is suggested
  else if (
    (aiResponse.toLowerCase().includes("product") &&
      (aiResponse.toLowerCase().includes("view") ||
        aiResponse.toLowerCase().includes("check"))) ||
    extractProductInfo(websitePageData, aiResponse)
  ) {
    action = {
      type: "view_product",
      context: {
        product_page: true,
        url: websitePageData.url,
      },
    };
  }
  // Check if promotion checking is suggested
  else if (
    (aiResponse.toLowerCase().includes("promotion") ||
      aiResponse.toLowerCase().includes("discount") ||
      aiResponse.toLowerCase().includes("offer") ||
      aiResponse.toLowerCase().includes("sale")) &&
    detectTimeSensitiveContent(websitePageData.fullText)
  ) {
    action = {
      type: "check_promotion",
      context: {
        time_sensitive: true,
      },
    };
  }

  return action;
}
