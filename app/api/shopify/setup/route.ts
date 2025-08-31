import { NextRequest, NextResponse } from "next/server";
import { cors } from "../../../../lib/cors";
import { query } from "../../../../lib/db";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

export const dynamic = "force-dynamic";

// Initialize SES client
const ses = new SESClient({
  region: process.env.AWS_REGION || "us-east-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// ---- Pre‑flight -------------------------------------------------
export async function OPTIONS(req: NextRequest) {
  return cors(req, new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest) {
  try {
    console.log("Received Shopify setup request");

    // Get request body
    const body = await req.json();
    const { shopifyUrl, companyName, email } = body;

    // Validate required fields
    if (!shopifyUrl) {
      return cors(
        req,
        NextResponse.json({ error: "Shopify URL is required" }, { status: 400 })
      );
    }

    if (!companyName) {
      return cors(
        req,
        NextResponse.json(
          { error: "Company name is required" },
          { status: 400 }
        )
      );
    }

    if (!email) {
      return cors(
        req,
        NextResponse.json({ error: "Email is required" }, { status: 400 })
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return cors(
        req,
        NextResponse.json({ error: "Invalid email format" }, { status: 400 })
      );
    }

    // Validate Shopify URL format
    if (!shopifyUrl.includes(".myshopify.com")) {
      return cors(
        req,
        NextResponse.json(
          {
            error: "Invalid Shopify URL format. Must include .myshopify.com",
          },
          { status: 400 }
        )
      );
    }

    // Check if this email/shopify URL combination already exists
    const existingRequest = (await query(
      `SELECT id, status FROM ShopifySetupRequest
       WHERE email = ? AND shopifyUrl = ? AND status IN ('pending', 'processing')
       LIMIT 1`,
      [email, shopifyUrl]
    )) as any[];

    if (existingRequest.length > 0) {
      return cors(
        req,
        NextResponse.json(
          {
            error:
              "A setup request for this store and email is already in progress",
            requestId: existingRequest[0].id,
          },
          { status: 409 }
        )
      );
    }

    // Create setup request in database
    const requestId = crypto.randomUUID();
    await query(
      `INSERT INTO ShopifySetupRequest (
         id, shopifyUrl, companyName, email, status, createdAt, updatedAt
       ) VALUES (?, ?, ?, ?, 'pending', NOW(), NOW())`,
      [requestId, shopifyUrl, companyName, email]
    );

    console.log(`Shopify setup request created: ${requestId}`);

    // Send notification email to team
    await sendNotificationEmail(shopifyUrl, companyName, email, requestId);

    return cors(
      req,
      NextResponse.json({
        success: true,
        message: "Setup request received successfully",
        requestId: requestId,
        estimatedTime: "1 hour",
      })
    );
  } catch (error) {
    console.error("Error in Shopify setup API:", error);
    return cors(
      req,
      NextResponse.json({ error: "Internal server error" }, { status: 500 })
    );
  }
}

/**
 * Send notification email to team
 */
async function sendNotificationEmail(
  shopifyUrl: string,
  companyName: string,
  customerEmail: string,
  requestId: string
) {
  try {
    // Create HTML content
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>New Shopify Setup Request</h2>
        
        <p>A new Shopify store setup request has been received:</p>
        
        <ul>
          <li><strong>Request ID:</strong> ${requestId}</li>
          <li><strong>Shopify URL:</strong> ${shopifyUrl}</li>
          <li><strong>Company:</strong> ${companyName}</li>
          <li><strong>Customer Email:</strong> ${customerEmail}</li>
          <li><strong>Date:</strong> ${new Date().toLocaleString()}</li>
        </ul>
        
        <p>Please process this request within the next hour.</p>
        
        <p>This is an automated notification from the Voicero.AI system.</p>
      </div>
    `;

    // Create text content
    const textContent = `
New Shopify Setup Request

A new Shopify store setup request has been received:

- Request ID: ${requestId}
- Shopify URL: ${shopifyUrl}
- Company: ${companyName}
- Customer Email: ${customerEmail}
- Date: ${new Date().toLocaleString()}

Please process this request within the next hour.

This is an automated notification from the Voicero.AI system.
    `;

    // Send email using SES
    const params = {
      Source: "support@voicero.ai",
      Destination: {
        ToAddresses: [
          "support@voicero.ai",
          "info@voicero.ai",
          "nolan@voicero.ai",
          "davidfales@voicero.ai",
        ],
      },
      Message: {
        Subject: {
          Data: `[ACTION REQUIRED] New Shopify Setup Request - ${companyName}`,
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
      ReplyToAddresses: ["info@voicero.ai"],
    };

    await ses.send(new SendEmailCommand(params));
    console.log("Successfully sent notification email to team");
    return true;
  } catch (error) {
    console.error("Error sending notification email:", error);
    return false;
  }
}
