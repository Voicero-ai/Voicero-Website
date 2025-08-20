import { NextResponse, NextRequest } from "next/server";
import { query } from '../../../../lib/db';
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { cors } from '../../../../lib/cors';
export const dynamic = "force-dynamic";

const ses = new SESClient({
  region: process.env.AWS_REGION || "us-east-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

/* -------------------------------------------------- */
/*  CORS pre-flight                                   */
/* -------------------------------------------------- */
export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

async function sendSupportNotificationEmail(
  threadId: string,
  messageId: string
) {
  console.log(
    `[SUPPORT_EMAIL] Starting email process for thread: ${threadId}, message: ${messageId}`
  );
  try {
    // Get the message details
    console.log(`[SUPPORT_EMAIL] Fetching message details from database`);
    // Fetch message and full thread history
    const messageRows = (await query(
      `SELECT m.*, t.id as threadId
       FROM AiMessage m
       JOIN AiThread t ON t.id = m.threadId
       WHERE m.id = ?
       LIMIT 1`,
      [messageId]
    )) as any[];
    const message = messageRows[0];

    if (!message) {
      console.log(`[SUPPORT_EMAIL] Message not found: ${messageId}`);
      throw new Error("Message not found");
    }

    console.log(
      `[SUPPORT_EMAIL] Found message and thread data. Thread has ${message.thread.messages.length} messages`
    );

    const threadMessages = (await query(
      `SELECT role, content, createdAt
       FROM AiMessage
       WHERE threadId = ?
       ORDER BY createdAt ASC`,
      [message.threadId]
    )) as any[];

    const messageHistory = threadMessages
      .map(
        (msg) =>
          `[${String(msg.role).toUpperCase()}] ${new Date(
            msg.createdAt
          ).toLocaleString()}\n${msg.content}\n`
      )
      .join("\n---\n\n");

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <h1 style="color: #6B46C1;">New Support Issue Created</h1>
        <p>A new support issue has been created for the following message:</p>
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>Message Details:</h3>
          <p><strong>Thread ID:</strong> ${threadId}</p>
          <p><strong>Message ID:</strong> ${messageId}</p>
          <p><strong>Created At:</strong> ${new Date(
            message.createdAt
          ).toLocaleString()}</p>
        </div>
        <h3>Full Conversation History:</h3>
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; white-space: pre-wrap;">
          ${messageHistory}
        </div>
      </div>
    `;

    const textContent = `
New Support Issue Created

A new support issue has been created for the following message:

Message Details:
Thread ID: ${threadId}
Message ID: ${messageId}
Created At: ${new Date(message.createdAt).toLocaleString()}

Full Conversation History:
${messageHistory}
    `;

    const params = {
      Source: "support@voicero.ai",
      Destination: {
        ToAddresses: ["info@voicero.ai", "support@voicero.ai"],
      },
      Message: {
        Subject: {
          Data: "New Support Issue Created",
          Charset: "UTF-8",
        },
        Body: {
          Text: {
            Data: textContent,
            Charset: "UTF-8",
          },
          Html: {
            Data: htmlContent,
            Charset: "UTF-8",
          },
        },
      },
    };

    console.log(
      `[SUPPORT_EMAIL] Attempting to send email to: ${params.Destination.ToAddresses.join(
        ", "
      )}`
    );
    console.log(
      `[SUPPORT_EMAIL] AWS SES config: region=${
        process.env.AWS_REGION
      }, accessKeyId exists: ${!!process.env
        .AWS_ACCESS_KEY_ID}, secretAccessKey exists: ${!!process.env
        .AWS_SECRET_ACCESS_KEY}`
    );

    const result = await ses.send(new SendEmailCommand(params));
    console.log(
      `[SUPPORT_EMAIL] Email sent successfully! MessageId: ${result.MessageId}`
    );
    return true;
  } catch (error) {
    console.error("Error sending support notification email:", error);
    console.error(
      "[SUPPORT_EMAIL] Full error details:",
      JSON.stringify(error, null, 2)
    );
    return false;
  }
}

export async function POST(request: NextRequest) {
  console.log("[SUPPORT_HELP_POST] Received support help request");
  try {
    const body = await request.json();
    console.log("[SUPPORT_HELP_POST] Request body:", JSON.stringify(body));
    const { threadId, messageId } = body;

    if (!threadId || !messageId) {
      console.log("[SUPPORT_HELP_POST] Missing required fields:", {
        threadId,
        messageId,
      });
      return cors(
        request,
        new NextResponse("Thread ID and Message ID are required", {
          status: 400,
        })
      );
    }

    console.log(
      `[SUPPORT_HELP_POST] Creating support record for thread: ${threadId}, message: ${messageId}`
    );
    await query(
      `INSERT INTO Support (id, threadId, messageId, createdAt) VALUES (UUID(), ?, ?, NOW())`,
      [threadId, messageId]
    );
    const support = { threadId, messageId } as any;
    console.log(
      `[SUPPORT_HELP_POST] Created support record:`,
      JSON.stringify(support)
    );

    // Send notification email
    console.log("[SUPPORT_HELP_POST] Sending notification email");
    const emailResult = await sendSupportNotificationEmail(threadId, messageId);
    console.log(
      `[SUPPORT_HELP_POST] Email notification result: ${
        emailResult ? "Success" : "Failed"
      }`
    );

    return cors(request, NextResponse.json(support));
  } catch (error) {
    console.error("[SUPPORT_HELP_POST]", error);
    console.error(
      "[SUPPORT_HELP_POST] Full error details:",
      JSON.stringify(error, null, 2)
    );
    return cors(request, new NextResponse("Internal Error", { status: 500 }));
  }
}
