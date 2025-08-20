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
 * Beta Click Action API Route
 *
 * This endpoint handles click requests by analyzing button data
 * and determining which button to click.
 *
 * Expected Request:
 * {
 *   responseId: string,    // Response ID from the chat AI
 *   buttonData: array,     // Array of button objects with text and ID
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
 *   buttonText: string,    // Exact text of the button to click
 *   buttonId: string       // ID of the button to click
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
    const { responseId, buttonData, question, answer, conversationId } =
      await request.json();

    console.log("buttonData", buttonData);
    console.log("doing click action", {
      responseId,
      question,
      buttonCount: buttonData?.length,
      conversationId: conversationId || "missing",
    });

    if (!responseId) {
      return NextResponse.json(
        { error: "Response ID is required" },
        { status: 400 }
      );
    }

    if (!buttonData || !Array.isArray(buttonData)) {
      return NextResponse.json(
        { error: "Button data array is required" },
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

    // Make the ChatGPT call to determine which button to click
    const completion = await openai.responses.create({
      model: "gpt-5-mini",
      instructions: [
        "You are an AI click assistant that helps users click the right buttons on web pages.",
        "Your job is to analyze the user's question and the available buttons to determine which one to click.",
        "You must respond in valid JSON format with the following structure:",
        "{",
        '  "answer": "say in as little words as possible what your doing (max 10 words)",',
        '  "actionType": "click",',
        '  "buttonText": "The exact text of the button to click",',
        '  "buttonId": "The exact ID of the button to click"',
        "}",
        "TTS-FRIENDLY: Write responses that are easy for text-to-speech to pronounce clearly.",
        "Use simple, clear sentences. Avoid complex punctuation or confusing phrases.",
        "Analyze the user's question carefully and find the most relevant button.",
        "If the user asks to click something specific, find the closest matching button text.",
        "Always provide the exact button text and ID that exists in the buttonData array.",
        "Be decisive and helpful - don't ask questions, just take action.",
        "For clicking, identify the specific button the user wants to interact with.",
        "CRITICAL: You must return the exact buttonText and buttonId from the available buttons.",
        "Do not make up button text or IDs - only use what's provided in buttonData.",
      ]
        .filter(Boolean)
        .join(" "),
      input: `User Question: ${question}\n\nChat AI Response: ${answer}\n\nAvailable Buttons: ${JSON.stringify(
        buttonData,
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
        answer: "I'm analyzing the buttons to find what you need",
        actionType: "click",
        buttonText: buttonData[0]?.text || "",
        buttonId: buttonData[0]?.id || "",
      };
    }

    const openaiResponseId: string | undefined = (completion as any)?.id;

    // Save AI response to database
    try {
      await connection.execute(
        "INSERT INTO VoiceChats (id, voiceConversationId, messageType, content, createdAt, responseId, action, actionType) VALUES (UUID(), ?, 'clickAI', ?, NOW(3), ?, 'true', ?)",
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

    console.log("done click action", {
      responseId: openaiResponseId,
      actionType: actionResult.actionType,
      buttonText: actionResult.buttonText,
      buttonId: actionResult.buttonId,
    });

    return NextResponse.json(
      {
        responseId: openaiResponseId || "",
        answer: actionResult.answer || "Click action completed",
        actionType: actionResult.actionType || "click",
        buttonText: actionResult.buttonText || "",
        buttonId: actionResult.buttonId || "",
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
    console.error("Click action error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        responseId: "",
        answer: "An error occurred while processing the click action",
        actionType: "",
        buttonText: "",
        buttonId: "",
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
