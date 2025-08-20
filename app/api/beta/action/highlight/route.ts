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
 * Beta Highlight Action API Route
 *
 * This endpoint handles highlight requests by analyzing the page text
 * and determining the best text to highlight.
 *
 * Expected Request:
 * {
 *   responseId: string,    // Response ID from the chat AI
 *   pageText: string,      // All text found on the current page
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
 *   words: string          // Text to highlight on the page
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
    const { responseId, pageText, question, answer, conversationId } =
      await request.json();

    console.log("page text", pageText);
    console.log("doing highlight action", {
      responseId,
      question,
      textLength: pageText?.length,
      conversationId: conversationId || "missing",
    });

    if (!responseId) {
      return NextResponse.json(
        { error: "Response ID is required" },
        { status: 400 }
      );
    }

    if (!pageText || typeof pageText !== "string") {
      return NextResponse.json(
        { error: "Page text is required" },
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

    // Make the ChatGPT call to determine the highlight action and target text
    const completion = await openai.responses.create({
      model: "gpt-5-mini",
      instructions: [
        "You are an AI highlight assistant that helps users find specific text on web pages.",
        "Your job is to analyze the user's question and the available page text to determine what to highlight.",
        "IMPORTANT: The page text you receive is broken HTML with CSS classes and styling.",
        "You must pick ONE complete tag that contains the most relevant text for the user's request.",
        "Do NOT pick multiple tags or partial tags - choose the single best one.",
        "CRITICAL: NEVER combine text from multiple different tags.",
        "You can ONLY pick the text from ONE single tag - either the div, or the p, or the span, but NOT multiple.",
        "Look for complete tags like <h1>, <h2>, <h3>, <div>, <p>, <span> that contain meaningful content.",
        "If there are multiple relevant tags, pick the one that will help the user the most.",
        "RULE: Extract text from exactly ONE tag, never combine multiple tags.",
        "if you see: <div>this is a </div><div>message</div> you cannot combine it or say this is a message you can only put the text: this is a message",
        "You must respond in valid JSON format with the following structure:",
        "{",
        '  "answer": "say in as little words as possible what your doing (max 10 words)",',
        '  "actionType": "highlight",',
        '  "words": "The exact text or section to highlight on the page"',
        "}",
        "TTS-FRIENDLY: Write responses that are easy for text-to-speech to pronounce clearly.",
        "Use simple, clear sentences. Avoid complex punctuation or confusing phrases.",
        "Analyze the user's question carefully and find the most relevant text on the page.",
        "If the user asks about pricing, look for pricing-related text sections.",
        "If the user asks to see something specific, find the closest matching text.",
        "Always provide text that actually exists on the page.",
        "Be decisive and helpful - don't ask questions, just take action.",
        "For highlighting, identify the specific text, heading, or section the user wants to see.",
        "HTML HANDLING: Pick complete tags, avoid broken HTML, choose the most helpful single element.",
      ]
        .filter(Boolean)
        .join(" "),
      input: `User Question: ${question}\n\nChat AI Response: ${answer}\n\nAvailable Page Text: ${pageText}`,
    });

    const outputText = (completion as any).output_text || "{}";
    let actionResult;

    try {
      actionResult = JSON.parse(outputText);
    } catch (e) {
      console.error("Failed to parse AI response as JSON:", e);
      actionResult = {
        answer: "I'm analyzing the page to find what you need",
        actionType: "highlight",
        words: "pricing information", // Fallback text
      };
    }

    const openaiResponseId: string | undefined = (completion as any)?.id;

    // Save AI response to database
    try {
      await connection.execute(
        "INSERT INTO VoiceChats (id, voiceConversationId, messageType, content, createdAt, responseId, action, actionType) VALUES (UUID(), ?, 'highlightAI', ?, NOW(3), ?, 'true', ?)",
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

    console.log("done highlight action", {
      responseId: openaiResponseId,
      actionType: actionResult.actionType,
      words: actionResult.words,
    });

    return NextResponse.json(
      {
        responseId: openaiResponseId || "",
        answer: actionResult.answer || "Highlight action completed",
        actionType: actionResult.actionType || "highlight",
        words: actionResult.words || "",
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
    console.error("Highlight action error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        responseId: "",
        answer: "An error occurred while processing the highlight action",
        actionType: "",
        words: "",
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
