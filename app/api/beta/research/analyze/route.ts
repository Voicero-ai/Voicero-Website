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
      pageData,
      context,
      question,
      responseId: incomingResponseId,
      conversationId, // Conversation ID from chat route
    } = await request.json();

    console.log("doing research analyze", {
      context,
      question,
      conversationId: conversationId || "missing",
    });

    if (!pageData) {
      return NextResponse.json(
        { error: "Page data is required" },
        { status: 400 }
      );
    }

    if (!context || typeof context !== "string") {
      return NextResponse.json(
        { error: "Context is required" },
        { status: 400 }
      );
    }

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "Question is required" },
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

    // Only forward a previous_response_id if it looks like an OpenAI Responses ID
    const previousResponseIdForOpenAI =
      typeof incomingResponseId === "string" &&
      incomingResponseId.startsWith("resp_")
        ? incomingResponseId
        : undefined;

    const completion = await openai.responses.create({
      model: "gpt-5-nano",
      instructions: [
        "You are an AI research assistant that analyzes page content to answer specific questions.",
        "Your task is to analyze the provided page data and determine if it contains an answer to the user's question.",
        "You must respond in valid JSON format with the following structure:",
        "{",
        '  "answer": "Your detailed answer based on the page content",',
        '  "foundAnswer": true/false,',
        '  "confidence": "high/medium/low"',
        "}",
        "If the page content contains a clear answer to the question, set foundAnswer to true and provide a comprehensive answer.",
        "If the page content doesn't contain enough information to answer the question, set foundAnswer to false and explain what information is missing.",
        "Be thorough in your analysis and provide specific details from the page content when possible.",
        "TTS-FRIENDLY: Write responses that are easy for text-to-speech to pronounce clearly.",
        "Use simple, clear sentences. Avoid complex punctuation, abbreviations, or confusing phrases.",
        "Write as if someone is speaking naturally. Use common words and straightforward grammar.",
        "Keep sentences short and avoid run-on sentences that might confuse TTS or listeners.",
        "CRITICAL TTS RULES:",
        "Break long information into short, simple sentences.",
        "Use periods instead of commas for separation.",
        "Avoid abbreviations like 'etc.' or complex punctuation.",
        "Each sentence should be 10 words or less.",
        "If listing features, use 'and' between items or separate into multiple sentences.",
        "Example: 'The Starter plan costs one dollar per query. It includes up to one hundred chat interactions. You get returns management and order management. Plus page navigation and tracking.'",
        "WORD COUNT: Provide comprehensive answers with 50-100 words when foundAnswer is true.",
        "For missing information cases, use 25-50 words to clearly explain what's needed.",
        "Make your answers informative but easy to listen to and understand.",
      ]
        .filter(Boolean)
        .join(" "),
      input: `Research Context: ${context}\n\nQuestion: ${question}\n\nPage Data: ${JSON.stringify(
        pageData,
        null,
        2
      )}`,
      previous_response_id: previousResponseIdForOpenAI,
    });

    const outputText = (completion as any).output_text || "{}";
    let analysisResult;

    try {
      analysisResult = JSON.parse(outputText);
    } catch (e) {
      console.error("Failed to parse AI response as JSON:", e);
      analysisResult = {
        answer: "Failed to analyze the page content",
        foundAnswer: false,
        confidence: "low",
      };
    }

    const openaiResponseId: string | undefined = (completion as any)?.id;

    // Save AI response to database
    try {
      await connection.execute(
        "INSERT INTO VoiceChats (id, voiceConversationId, messageType, content, createdAt, responseId, research, researchContext, foundAnswer) VALUES (UUID(), ?, 'analyzeAI', ?, NOW(3), ?, 'true', ?, ?)",
        [
          conversationId,
          analysisResult.answer,
          openaiResponseId || null,
          context,
          analysisResult.foundAnswer ? 1 : 0,
        ]
      );
    } catch (dbError) {
      console.error("Failed to save AI response to database:", dbError);
    }

    console.log("done research analyze", {
      id: openaiResponseId || incomingResponseId || "unknown",
    });

    return NextResponse.json(
      {
        answer: analysisResult.answer || "No answer available",
        foundAnswer: analysisResult.foundAnswer || false,
        responseId: openaiResponseId,
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
    console.error("Research analyze error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        answer: "An error occurred while analyzing the page content",
        foundAnswer: false,
        responseId: "",
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
