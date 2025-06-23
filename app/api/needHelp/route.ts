import { NextRequest, NextResponse } from "next/server";
import { cors } from "../../../lib/cors";
import OpenAI from "openai";
export const dynamic = "force-dynamic";

const openai = new OpenAI();

// Updated types based on actual request format
type PageStructure = {
  headings?: Array<{
    level: string;
    text: string;
  }>;
  navigation?: string;
  paragraphs?: string[];
  listItems?: string[];
  callsToAction?: string[];
  categoryDetails?: {
    title: string;
    description: string;
    productCount: number;
  };
};

type ExtractedProduct = {
  name?: string;
  price?: string;
  description?: string;
  images?: string[];
};

// Updated client payload type to match actual request format
type ClientPayload = {
  url: string;
  title: string;
  sessionId: string;
  websiteId: string;
  metadata?: {
    path?: string;
    query?: string;
    userAgent?: string;
  };
  pageContent?: string;
  pageStructure?: PageStructure;
  extractedProduct?: ExtractedProduct;
  userQuestion?: string;
};

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body: ClientPayload = await request.json();

    // Log the entire request body
    console.log("===== NEED HELP API - INCOMING REQUEST BODY =====");
    console.log(JSON.stringify(body, null, 2));
    console.log("================================================");

    // Check if we have the required data
    if (!body.url || !body.title) {
      return cors(
        request,
        NextResponse.json(
          { error: "Missing required fields: url or title" },
          { status: 400 }
        )
      );
    }

    // Prepare context from page data
    const context = prepareContext(body);

    // Get user question or use default
    const userQuestion = body.userQuestion || "I need help with this page.";

    // Generate system prompt
    const SYSTEM_PROMPT = `You are a helpful shopping assistant. Your goal is to entice users to click on you for help with a short, friendly prompt.

CRITICAL REQUIREMENTS:
1. ALWAYS start your response with "Need help...?" or similar engaging question
2. Keep responses EXTREMELY short - maximum 20 words total (2-3 sentences max)
3. Be specific about what you can help with based on the current page content
4. Focus on the most relevant element of the page (product, form, checkout, etc.)
5. Make your response conversational and friendly

Examples:
BAD: "I notice this page has a contact form where you can enter your email. Would you like help completing it? Let me know if you have any questions about this form or any other element on the page."
GOOD: "Need help with the contact form? I can guide you through the required fields."

BAD: "This product page shows a shirt available in multiple colors with free shipping. The price is currently $24.99 which appears to be discounted from the original price."
GOOD: "Need help choosing a color? This shirt is $24.99 with free shipping."

Keep it short, friendly, and focused on a specific helpful action.`;

    // Call GPT-4o mini for response
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 1000,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `Here is the webpage data to analyze:\n\n${context}\n\nUser Question: ${userQuestion}`,
        },
      ],
    });

    // Extract response
    const aiResponse =
      completion.choices[0].message.content?.trim() ||
      "Need help finding what you're looking for?";

    // Return success response
    return cors(request, NextResponse.json(aiResponse));
  } catch (error: any) {
    console.error("Need Help error:", error);

    // Return error response
    return cors(
      request,
      NextResponse.json("Need help with something? I'm here to assist!", {
        status: 500,
      })
    );
  }
}

// Helper function to prepare context from actual request format
function prepareContext(data: ClientPayload): string {
  let context = `URL: ${data.url}\n`;
  context += `TITLE: ${data.title}\n`;

  // Add page content
  if (data.pageContent) {
    context += `\nPAGE CONTENT SUMMARY:\n${data.pageContent}\n`;
  }

  // Add headings
  if (data.pageStructure?.headings && data.pageStructure.headings.length > 0) {
    context += `\nHEADINGS:\n`;
    data.pageStructure.headings.forEach((heading, i) => {
      context += `[${heading.level}] ${heading.text}\n`;
    });
  }

  // Add paragraphs
  if (
    data.pageStructure?.paragraphs &&
    data.pageStructure.paragraphs.length > 0
  ) {
    context += `\nPARAGRAPHS:\n`;
    data.pageStructure.paragraphs.forEach((para, i) => {
      context += `[${i + 1}] ${para}\n`;
    });
  }

  // Add navigation
  if (data.pageStructure?.navigation) {
    context += `\nNAVIGATION:\n${data.pageStructure.navigation}\n`;
  }

  // Add product info
  if (data.extractedProduct) {
    context += `\nPRODUCT INFORMATION:\n`;
    if (data.extractedProduct.name)
      context += `Name: ${data.extractedProduct.name}\n`;
    if (data.extractedProduct.price)
      context += `Price: ${data.extractedProduct.price}\n`;
    if (data.extractedProduct.description)
      context += `Description: ${data.extractedProduct.description}\n`;
  }

  // Add category details
  if (data.pageStructure?.categoryDetails) {
    const cat = data.pageStructure.categoryDetails;
    context += `\nCATEGORY DETAILS:\n`;
    context += `Title: ${cat.title}\n`;
    if (cat.description) context += `Description: ${cat.description}\n`;
    context += `Product Count: ${cat.productCount}\n`;
  }

  // Add calls to action
  if (
    data.pageStructure?.callsToAction &&
    data.pageStructure.callsToAction.length > 0
  ) {
    context += `\nCALLS TO ACTION:\n`;
    data.pageStructure.callsToAction.forEach((cta, i) => {
      context += `[${i + 1}] ${cta}\n`;
    });
  }

  return context;
}
