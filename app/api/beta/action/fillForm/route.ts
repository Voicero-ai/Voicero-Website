import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import * as mysql from "mysql2/promise";

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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Beta Fill Form Action API Route
 *
 * This endpoint handles form filling requests by analyzing form data
 * and determining how to fill in the form fields.
 *
 * Expected Request:
 * {
 *   responseId: string,    // Response ID from the chat AI
 *   formData: array,       // Array of form field objects with id, name, type, etc.
 *   html: string,          // HTML content of the form
 *   question: string,      // User's original question
 *   answer: string,        // Chat AI's response
 *   conversationId: string // Conversation ID from chat route
 * }
 *
 * Expected Response:
 * {
 *   responseId: string,    // New response ID from this AI
 *   answer: string,        // AI's response about what it's doing
 *   actionType: string,    // Type of action to perform
 *   formFills: array,     // Array of form field fills with id and value
 *   missingFields: array   // Array of missing or unclear form fields
 * }
 */

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
    const { responseId, formData, html, question, answer, conversationId } =
      await request.json();

    console.log("formData", formData);
    console.log("html", html);

    console.log("doing fill form action", {
      responseId,
      question,
      fieldCount: formData?.length,
      conversationId: conversationId || "missing",
    });

    if (!responseId) {
      return NextResponse.json(
        { error: "Response ID is required" },
        { status: 400 }
      );
    }

    if (!formData || !Array.isArray(formData)) {
      return NextResponse.json(
        { error: "Form data array is required" },
        { status: 400 }
      );
    }

    if (!question) {
      return NextResponse.json(
        { error: "Question is required" },
        { status: 400 }
      );
    }

    if (!answer) {
      return NextResponse.json(
        { error: "Answer is required" },
        { status: 400 }
      );
    }

    if (!conversationId) {
      return NextResponse.json(
        { error: "Conversation ID is required" },
        { status: 400 }
      );
    }

    // Connect to database and update conversation stats
    connection = await mysql.createConnection(dbConfig);

    // Update conversation stats
    await connection.execute(
      "UPDATE VoiceConversations SET mostRecentConversationAt = NOW(3), totalMessages = totalMessages + 1 WHERE id = ?",
      [conversationId]
    );

    // Make the ChatGPT call to determine how to fill the form
    const completion = await openai.responses.create({
      model: "gpt-5-mini",
      instructions: [
        "You are an AI form filling assistant that helps users fill out web forms.",
        "Your job is to analyze the user's question and the available form fields to determine how to fill them.",
        "You must respond in valid JSON format with the following structure:",
        "{",
        '  "answer": "say what you are doing - filling out the form (max 15 words)",',
        '  "actionType": "fillForm",',
        '  "formFills": [{"id": "field_id", "value": "value_to_fill", "fieldClass": "css_classes", "label": "field_label"}],',
        '  "missingFields": ["list of ALL required fields that are missing or unclear"]',
        "}",
        "TTS-FRIENDLY: Write responses that are easy for text-to-speech to pronounce clearly.",
        "Use simple, clear sentences. Avoid complex punctuation or confusing phrases.",
        "Analyze the user's question carefully and determine what information they want to provide.",
        "ONLY fill in fields that the user explicitly provides information for.",
        "Do NOT make up or guess values for fields the user didn't mention.",
        "If a field is required but the user didn't provide info, add it to missingFields array.",
        "For fields the user does provide info for, use their exact information.",
        "For example, if user says 'My name is David', only fill the name field with 'David'.",
        "INTELLIGENTLY interpret speech-to-text patterns:",
        "- 'at gmail.com' → '@gmail.com'",
        "- 'at yahoo.com' → '@yahoo.com'",
        "- 'at hotmail.com' → '@hotmail.com'",
        "- 'dot com' → '.com'",
        "- 'dot org' → '.org'",
        "- 'dot net' → '.net'",
        "- 'dash' → '-'",
        "- 'underscore' → '_'",
        "- 'plus' → '+'",
        "Leave other fields empty or add them to missingFields if they're required.",
        "Always provide the exact field ID from the formData array.",
        "Use the field labels from the HTML to know which field is which.",
        "Only fill fields the user mentions.",
        "Don't make up values for fields they didn't specify.",
        "List ALL required fields that are missing in missingFields array.",
        "If the form has no fields or is missing critical information, note this in missingFields.",
      ]
        .filter(Boolean)
        .join(" "),
      input: `User Question: ${question}\n\nChat AI Response: ${answer}\n\nForm HTML: ${html}\n\nAvailable Form Fields: ${JSON.stringify(
        formData,
        null,
        2
      )}`,
    });

    const outputText = (completion as any).output_text || "{}";
    let actionResult;

    try {
      actionResult = JSON.parse(outputText);
    } catch (e) {
      console.error("Failed to parse AI response as JSON:", e);
      actionResult = {
        answer: "I'm analyzing the form to fill it out for you",
        actionType: "fillForm",
        formFills: [],
        missingFields: ["Unable to parse form data"],
      };
    }

    const openaiResponseId: string | undefined = (completion as any)?.id;

    // Save AI response to database
    try {
      await connection.execute(
        "INSERT INTO VoiceChats (id, voiceConversationId, messageType, content, createdAt, responseId, action, actionType) VALUES (UUID(), ?, 'fillFormAI', ?, NOW(3), ?, 'true', ?)",
        [
          conversationId,
          actionResult.answer,
          openaiResponseId || null,
          actionResult.actionType,
        ]
      );
    } catch (dbError) {
      console.error("Failed to save AI response to database:", dbError);
    }

    console.log("done fill form action", {
      responseId: openaiResponseId,
      actionType: actionResult.actionType,
      fieldCount: actionResult.formFills,
      missingCount: actionResult.missingFields,
    });

    return NextResponse.json(
      {
        responseId: openaiResponseId || "",
        answer: actionResult.answer || "Form filling completed",
        actionType: actionResult.actionType || "fillForm",
        formFills: actionResult.formFills || [],
        missingFields: actionResult.missingFields || [],
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
    console.error("Fill form action error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        responseId: "",
        answer: "An error occurred while processing the form filling action",
        actionType: "",
        formFills: [],
        missingFields: ["Error processing request"],
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
