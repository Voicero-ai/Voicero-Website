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
 * Beta Navigation Action API Route
 *
 * This endpoint handles takeAction requests by analyzing the page links
 * and determining the best action and URL to navigate to.
 *
 * Expected Request:
 * {
 *   responseId: string,    // Response ID from the chat AI
 *   links: string[],       // Array of links found on the current page
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
 *   url: string            // URL to navigate to
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
    const { responseId, links, question, answer, conversationId } =
      await request.json();

    console.log("doing navigation action", {
      responseId,
      question,
      linksCount: links?.length,
      conversationId: conversationId || "missing",
    });

    if (!responseId) {
      return NextResponse.json(
        { error: "Response ID is required" },
        { status: 400 }
      );
    }

    if (!links || !Array.isArray(links)) {
      return NextResponse.json(
        { error: "Links array is required" },
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

    // Make the ChatGPT call to determine the action and URL
    const completion = await openai.responses.create({
      model: "gpt-5-mini",
      instructions: [
        "You are an AI action assistant that helps users navigate websites by analyzing available links.",
        "Your job is to look at the user's question, the available page links, and determine the best action to take.",
        "You must respond in valid JSON format with the following structure:",
        "{",
        '  "answer": "say in as little words as possible what your doing (max 10 words)",',
        '  "actionType": "navigate/click/scroll/fill_form/highlight",',
        '  "url": "The exact URL to navigate to from the available links"',
        "}",
        "TTS-FRIENDLY: Write responses that are easy for text-to-speech to pronounce clearly.",
        "Use simple, clear sentences. Avoid complex punctuation or confusing phrases.",
        "Analyze the user's question carefully and match it to the most relevant link.",
        "If the user asks about pricing, look for pricing-related links.",
        "If the user asks to go somewhere specific, find the closest matching link.",
        "Always provide a valid URL from the available links array.",
        "Be decisive and helpful - don't ask questions, just take action.",
      ]
        .filter(Boolean)
        .join(" "),
      input: `User Question: ${question}\n\nChat AI Response: ${answer}\n\nAvailable Page Links: ${JSON.stringify(
        links,
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
        answer: "I'm analyzing the available options to help you navigate",
        actionType: "navigate",
        url: links[0] || "", // Fallback to first link
      };
    }

    const openaiResponseId: string | undefined = (completion as any)?.id;

    // Save AI response to database
    try {
      await connection.execute(
        "INSERT INTO VoiceChats (id, voiceConversationId, messageType, content, createdAt, responseId, action, actionType) VALUES (UUID(), ?, 'navigationAI', ?, NOW(3), ?, 'true', ?)",
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

    console.log("done navigation action", {
      responseId: openaiResponseId,
      actionType: actionResult.actionType,
      url: actionResult.url,
    });

    return NextResponse.json(
      {
        responseId: openaiResponseId || "",
        answer: actionResult.answer || "Navigation action completed",
        actionType: actionResult.actionType || "navigate",
        url: actionResult.url || "",
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
    console.error("Navigation action error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        responseId: "",
        answer: "An error occurred while processing the navigation action",
        actionType: "",
        url: "",
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
