// app/api/text-chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import * as mysql from "mysql2/promise";
import { verifyToken, getWebsiteIdFromToken } from '../../../../../lib/token-verifier';

export const dynamic = "force-dynamic";

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
 * Minimal data-URL guard; we accept "data:*;base64,...."
 * Returns { mime, base64, dataUrl } or null if invalid.
 */
function parseDataUrl(input?: string | null) {
  if (!input || typeof input !== "string") return null;
  const m = input.match(/^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m) return null;
  const mime = m[1]?.trim();
  const base64 = m[2]?.trim();
  if (!mime || !base64) return null;
  return { mime, base64, dataUrl: input };
}

/** Quick size guard (in bytes) for base64 payloads to avoid huge requests */
function approxBytesFromBase64(b64: string) {
  // 4 base64 chars ~ 3 bytes
  return Math.floor((b64.replace(/\s/g, "").length * 3) / 4);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

type IncomingAttachment = {
  contentPreview?: string; // data URL
  name?: string;
  type?: string; // e.g. "image/png", "application/pdf"
  extension?: string; // ".png", ".pdf"
  size?: number;
  fileId?: string; // optional Files API id for images
};

export async function POST(request: NextRequest) {
  let connection: mysql.Connection | undefined;

  try {
    const body = await request.json();

    const {
      question,
      responseId: incomingResponseId,
      pageContent,
      sessionId,
      conversationId,
      attachedImage, // { contentPreview: "data:image/png;base64,...", ... } or null
      attachedFile, // { contentPreview: "data:application/pdf;base64,...", ... } or null
      attachedImages, // optional array of images (data URL or fileId)
    }: {
      question: string;
      responseId?: string;
      pageContent?: string | null;
      sessionId?: string | null;
      conversationId?: string | null;
      attachedImage?: IncomingAttachment | null;
      attachedFile?: IncomingAttachment | null;
      attachedImages?: IncomingAttachment[] | null;
    } = body;

    // Auth
    const authHeader = request.headers.get("authorization");
    const isTokenValid = await verifyToken(authHeader);
    if (!isTokenValid) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid token" },
        { status: 401 }
      );
    }

    if (!question && !attachedImage && !attachedFile) {
      return NextResponse.json(
        { error: "Question or an attachment is required" },
        { status: 400 }
      );
    }

    // DB connect
    connection = await mysql.createConnection(dbConfig);

    // Find or create session
    let sessionIdToUse = sessionId;
    if (!sessionIdToUse || sessionIdToUse === "") {
      const websiteId = await getWebsiteIdFromToken(authHeader);
      if (!websiteId) {
        return NextResponse.json(
          { error: "Could not determine website ID from token" },
          { status: 400 }
        );
      }
      await connection.execute(
        "INSERT INTO Session (id, websiteId, textOpen) VALUES (UUID(), ?, ?)",
        [websiteId, true]
      );
      const [newSessionResult] = await connection.execute(
        "SELECT id FROM Session WHERE websiteId = ? ORDER BY createdAt DESC LIMIT 1",
        [websiteId]
      );
      sessionIdToUse = (newSessionResult as any[])[0].id;
    }

    // Conversation handling
    let conversationIdToUse = conversationId;
    if (!conversationIdToUse || conversationIdToUse === "") {
      await connection.execute(
        "INSERT INTO TextConversations (id, sessionId, createdAt, mostRecentConversationAt, firstConversationAt) VALUES (UUID(), ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))",
        [sessionIdToUse]
      );
      const [newConversationIdResult] = await connection.execute(
        "SELECT id FROM TextConversations WHERE sessionId = ? ORDER BY createdAt DESC LIMIT 1",
        [sessionIdToUse]
      );
      conversationIdToUse = (newConversationIdResult as any[])[0].id;
    } else {
      await connection.execute(
        "UPDATE TextConversations SET mostRecentConversationAt = CURRENT_TIMESTAMP(3), totalMessages = totalMessages + 1 WHERE id = ?",
        [conversationIdToUse]
      );
    }

    // Log user turn
    const userText = question ?? "";
    await connection.execute(
      "INSERT INTO TextChats (id, textConversationId, messageType, content, createdAt) VALUES (UUID(), ?, 'user', ?, CURRENT_TIMESTAMP(3))",
      [conversationIdToUse, userText]
    );

    // ----- Build multimodal content parts for Responses API -----
    const contentParts: any[] = [];

    // 1) Page context + question as text
    const textPrompt =
      (pageContent ? `Page Context:\n${pageContent}\n\n` : "") +
      (userText?.trim().length
        ? `User: ${userText}`
        : "User sent an attachment with no message.");
    contentParts.push({ type: "input_text", text: textPrompt });

    // 2) Images — support multiple via array and single via attachedImage
    const normalizedImages: IncomingAttachment[] = [];
    if (Array.isArray(attachedImages) && attachedImages.length > 0) {
      normalizedImages.push(...attachedImages);
    }
    if (attachedImage) {
      normalizedImages.push(attachedImage);
    }
    for (const img of normalizedImages) {
      if (img?.fileId) {
        contentParts.push({
          type: "input_image",
          file_id: img.fileId,
          detail: "auto",
        });
        continue;
      }
      const imgDataUrl = parseDataUrl(img?.contentPreview || null);
      if (imgDataUrl && imgDataUrl.mime.startsWith("image/")) {
        if (approxBytesFromBase64(imgDataUrl.base64) > 10 * 1024 * 1024) {
          return NextResponse.json(
            {
              error:
                "Image too large. Please send a smaller image (<=10MB base64 payload).",
            },
            { status: 413 }
          );
        }
        contentParts.push({
          type: "input_image",
          image_url: imgDataUrl.dataUrl,
          detail: "auto",
        });
      }
    }

    // 3) PDF (base64 data URL) -> upload to Files API and attach for file_search
    let attachments: any[] | undefined = undefined;
    const fileDataUrl = parseDataUrl(attachedFile?.contentPreview || null);
    if (fileDataUrl && fileDataUrl.mime === "application/pdf") {
      if (approxBytesFromBase64(fileDataUrl.base64) > 20 * 1024 * 1024) {
        return NextResponse.json(
          {
            error:
              "PDF too large. Please send a smaller file (<=20MB base64 payload).",
          },
          { status: 413 }
        );
      }
      const filename =
        attachedFile?.name || `upload${attachedFile?.extension || ".pdf"}`;
      const buffer = Buffer.from(fileDataUrl.base64, "base64");
      const uploaded = await openai.files.create({
        file: await toFile(buffer, filename),
        purpose: "assistants",
      });
      attachments = [
        {
          file_id: uploaded.id,
          tools: [{ type: "file_search" }],
        },
      ];
      contentParts.push({
        type: "input_text",
        text: `Attached file: ${filename}.`,
      });
    }

    // 4) If user sent only an attachment, inject a direct task cue so the model describes/summarizes first
    const userGaveNoText = !userText || userText.trim().length === 0;
    if (userGaveNoText && normalizedImages.length > 0) {
      contentParts.unshift({
        type: "input_text",
        text: "TASK: Describe each attached image in detail. Include objects, any visible text (OCR), colors, layout, and context. Then provide a concise 1-sentence alt text for each image.",
      });
    }
    if (
      userGaveNoText &&
      fileDataUrl &&
      fileDataUrl.mime === "application/pdf"
    ) {
      contentParts.unshift({
        type: "input_text",
        text: "TASK: Summarize the attached PDF. Provide a brief overview, key points in bullets, any headings/sections detected, and a 1–2 sentence summary.",
      });
    }

    // If neither valid image nor pdf present & no text, bail
    if (contentParts.length === 1 && textPrompt.trim() === "") {
      return NextResponse.json(
        {
          error: "No valid attachment found (image/pdf) and no text provided.",
        },
        { status: 400 }
      );
    }

    // Chain to previous response if valid OpenAI id
    const previousResponseIdForOpenAI =
      typeof incomingResponseId === "string" &&
      incomingResponseId.startsWith("resp_")
        ? incomingResponseId
        : undefined;

    // ---- Call OpenAI Responses API with a vision-capable model ----
    // Docs: Responses API + Images and Vision + File inputs (PDF)
    // https://platform.openai.com/docs/api-reference/responses
    // https://platform.openai.com/docs/guides/images-vision
    // https://platform.openai.com/docs/guides/pdf-files
    const completion = await openai.responses.create({
      model: "gpt-4.1-mini",
      // instructions are optional; keeping your style from before
      instructions: [
        "You are a friendly, helpful AI assistant that helps users with their questions.",
        "Be warm, encouraging, and helpful — like a friendly guide.",
        "Always be conversational, direct, and approachable.",
        "Respond in English.",
        "Keep responses helpful and informative.",
        "When an image or file is attached, DO NOT ask follow-up questions first. Immediately describe (for images) or summarize (for files) before anything else.",
        "If the user did not ask a specific question, assume they want a description/summary of the attachment and provide it succinctly.",
        attachedImage
          ? "If an image is attached, first describe clearly what you see (objects, text, colors, layout), then answer the user's request using the image."
          : "",
        attachedFile
          ? "If a file is attached (e.g., a PDF), summarize the most relevant points for the user's request. If it's long, give a concise overview first, then key details."
          : "",
        pageContent
          ? "Use provided page context to give precise, relevant guidance."
          : "",
        "Format the response with concise markdown.",
      ]
        .filter(Boolean)
        .join(" "),
      // Responses API accepts `input` with a single user turn containing multimodal parts:
      input: [{ role: "user", content: contentParts }],
      ...(attachments ? { attachments } : {}),
      previous_response_id: previousResponseIdForOpenAI,
      max_output_tokens: 800,
    });

    // Extract text
    const outputText =
      (completion as any).output_text ??
      (Array.isArray((completion as any).output)
        ? (completion as any).output
            .map((p: any) =>
              (p.content ?? []).map((c: any) => c.text?.value ?? "").join("")
            )
            .join("")
        : "");

    const openaiResponseId: string | undefined = (completion as any)?.id;

    // Store AI turn
    await connection.execute(
      "INSERT INTO TextChats (id, textConversationId, messageType, content, createdAt, responseId) VALUES (UUID(), ?, 'ai', ?, CURRENT_TIMESTAMP(3), ?)",
      [
        conversationIdToUse,
        outputText || "No response",
        openaiResponseId || null,
      ]
    );

    return NextResponse.json(
      {
        answer: outputText || "No response",
        responseId: openaiResponseId,
        sessionId: sessionIdToUse,
        conversationId: conversationIdToUse,
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
    console.error("Error in text chat route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
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
