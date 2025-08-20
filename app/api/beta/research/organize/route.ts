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

type Link = {
  url: string;
  title?: string;
  description?: string;
};

export async function POST(request: NextRequest) {
  let connection;
  try {
    const {
      links,
      context,
      question,
      responseId: incomingResponseId,
      conversationId, // Conversation ID from chat route
    } = await request.json();

    const researchContext = context; // Map the context parameter to researchContext
    console.log("doing research organize", {
      context,
      question,
      links,
      conversationId: conversationId || "missing",
    });

    if (!Array.isArray(links) || links.length === 0) {
      return NextResponse.json(
        { error: "Links array is required and must not be empty" },
        { status: 400 }
      );
    }

    if (!context || typeof context !== "string") {
      return NextResponse.json(
        { error: "Context is required" },
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

    // Format the links for the AI to analyze
    const linksFormatted = links
      .map((link: Link, index: number) => {
        return `Link ${index + 1}:
URL: ${link.url}
Title: ${link.title || "Unknown"}
Description: ${link.description || "No description available"}
`;
      })
      .join("\n");

    const completion = await openai.responses.create({
      model: "gpt-5-nano",
      instructions: [
        "You are an AI research assistant that helps organize and rank links based on relevance to a research topic.",
        "Your task is to analyze the provided links and determine which ones are most likely to contain the information the user is looking for.",
        "Rank the links from most relevant to least relevant based on the research context.",
        "For each link, provide a brief explanation of why it might be relevant.",
        "IMPORTANT: You must respond in valid JSON format with an array of objects with the following properties:",
        "- url: the URL of the link",
        "- relevanceScore: a number from 0-100 indicating how relevant the link is to the research context",
        "- reason: a brief explanation of why this link is relevant or not",
        "Only include links that have at least some relevance to the research context.",
      ]
        .filter(Boolean)
        .join(" "),
      input: `Research Context: ${researchContext}\n\nLinks to analyze:\n${linksFormatted}`,
      previous_response_id: previousResponseIdForOpenAI,
    });

    const outputText = (completion as any).output_text || "{}";
    let organizedLinks;

    try {
      organizedLinks = JSON.parse(outputText);
    } catch (e) {
      console.error("Failed to parse AI response as JSON:", e);
      organizedLinks = { links: [] };
    }

    const openaiResponseId: string | undefined = (completion as any)?.id;

    // Save AI response to database
    try {
      await connection.execute(
        "INSERT INTO VoiceChats (id, voiceConversationId, messageType, content, createdAt, responseId, research, researchContext, organizedLinks) VALUES (UUID(), ?, 'organizeAI', ?, NOW(3), ?, 'true', ?, ?)",
        [
          conversationId,
          "Organized research links based on relevance",
          openaiResponseId || null,
          context,
          JSON.stringify(organizedLinks),
        ]
      );
    } catch (dbError) {
      console.error("Failed to save AI response to database:", dbError);
    }

    console.log("done research organize", {
      id: openaiResponseId || incomingResponseId || "unknown",
    });

    return NextResponse.json(
      {
        organizedLinks,
        context,
        question: question || "",
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
    console.error("Research organize error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        organizedLinks: { links: [] },
        context: "",
        question: "",
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
