import { NextRequest, NextResponse } from "next/server";
import { cors } from "../../../../lib/cors";
import OpenAI from "openai";
import { PrismaClient } from "@prisma/client";
export const dynamic = "force-dynamic";

const openai = new OpenAI();
const prisma = new PrismaClient();

// Interface for form data
interface FormField {
  name: string;
  type: string;
  value?: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
}

interface FormData {
  form_id?: string;
  title?: string;
  fields: FormField[];
  submit_text?: string;
}

// Interface for page data
interface PageData {
  url: string;
  forms: FormData[];
  current_form_id?: string;
}

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { formData, sessionId } = body;

    if (!formData || !formData.forms || formData.forms.length === 0) {
      return cors(
        request,
        NextResponse.json({ error: "No form data provided" }, { status: 400 })
      );
    }

    if (!sessionId) {
      return cors(
        request,
        NextResponse.json({ error: "No sessionId provided" }, { status: 400 })
      );
    }

    // Fetch the session to get website ID and most recent thread
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        threads: {
          orderBy: { lastMessageAt: "desc" },
          take: 1,
          include: {
            messages: {
              orderBy: { createdAt: "desc" },
              take: 3,
            },
          },
        },
        website: {
          select: { id: true },
        },
      },
    });
    

    if (!session) {
      return cors(
        request,
        NextResponse.json({ error: "Session not found" }, { status: 404 })
      );
    }

    // Get the most recent thread or create a new one if none exists
    let thread;
    if (session.threads.length > 0) {
      thread = session.threads[0];
    } else {
      // Create a new thread if none exists
      thread = await prisma.aiThread.create({
        data: {
          threadId: crypto.randomUUID(),
          websiteId: session.website.id,
          title: "Form Assistance",
          lastMessageAt: new Date(),
          sessions: {
            connect: { id: session.id },
          },
        },
        include: {
          messages: true,
        },
      });
    }

    // Identify the current form - either specified or first in the list
    const currentFormId = formData.current_form_id || formData.forms[0].form_id;
    const currentForm =
      formData.forms.find((form: any) => form.form_id === currentFormId) ||
      formData.forms[0];

    // System message for GPT-4.1-mini
    const SYSTEM_PROMPT = `You are a helpful assistant that helps users understand and fill out forms on a website. Your goal is to make form filling easy and conversational.

Form Analysis Guidelines:
1. Identify the type of form (contact, login, signup, checkout, etc.) based on field names
2. Group related fields together logically in your response
3. Be specific about which fields are required
4. Respond in a helpful, conversational tone

Response Style (CRITICAL):
1. Length & Format:
   - Keep responses between 30-50 words
   - Always end with a question about whether the user wants to proceed with filling the form
   - Be concise but informative

2. Proactive Approach:
   - Say "I can help you fill this form" rather than "You should fill this form"
   - For login forms: "I see login fields for email and password. Would you like me to help you log in?"
   - For signup forms: "I see signup fields for name, email and password. Would you like to create an account?"
   - For contact forms: "I see a contact form with fields for name, email and message. Would you like to send a message?"

3. Field Recognition:
   - Identify common field patterns:
     * Email/username + password = login form
     * Name + email + message = contact form
     * Multiple address fields = shipping/billing form
     * Credit card fields = payment form

4. Submit Button Awareness:
   - Always mention the submit button text if available (e.g., "...and then submit using the 'Send Message' button")
   - If no submit text is available, use a generic term like "submit the form"

You MUST structure your response as a JSON object with the following fields:
{
  "form_type": string,       // Type of form (login, contact, etc.)
  "description": string,     // Brief description of what the form does
  "fields_summary": string,  // List of important fields in natural language
  "required_fields": array,  // Array of required field names
  "answer": string          // Your natural response to the user (30-50 words)
}`;

    // Call GPT-4.1-mini for analysis
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Analyze this form and create a helpful response for the user:
          
Form data: ${JSON.stringify(currentForm, null, 2)}
Page URL: ${formData.url}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    // Extract the response
    const content = completion.choices[0].message.content;
    if (!content) {
      throw new Error("No content returned from AI model");
    }

    let responseData;
    try {
      responseData = JSON.parse(content);
    } catch (error) {
      console.error("Error parsing AI response:", error);
      throw new Error("Invalid response format from AI model");
    }

    // Save the AI response to the thread
    await prisma.aiMessage.create({
      data: {
        threadId: thread.id,
        role: "assistant",
        content: responseData.answer,
        type: "text",
      },
    });

    // Update thread's last message timestamp
    await prisma.aiThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: new Date() },
    });

    // Return the response
    return cors(
      request,
      NextResponse.json({
        success: true,
        threadId: thread.threadId,
        formType: responseData.form_type,
        formDescription: responseData.description,
        fieldsIdentified: responseData.fields_summary,
        requiredFields: responseData.required_fields,
        response: responseData.answer,
      })
    );
  } catch (error: any) {
    console.error("Error in secondLook API:", error);
    return cors(
      request,
      NextResponse.json(
        {
          success: false,
          error: true,
          errorMessage: error.message || "An unexpected error occurred",
        },
        { status: 500 }
      )
    );
  }
}
