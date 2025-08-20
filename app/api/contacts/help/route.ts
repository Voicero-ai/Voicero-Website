import { NextResponse, NextRequest } from "next/server";
import { query } from '../../../../lib/db';
import { cors } from '../../../../lib/cors';
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
export const dynamic = "force-dynamic";

interface Website {
  userId: string;
}

interface User {
  email: string;
}

interface Contact {
  id: string;
  email: string;
  message: string;
  threadId: string;
  userId: string;
  websiteId: string;
  createdAt: Date;
}

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, message, threadId, websiteId } = body;

    if (!email || !message) {
      return cors(
        request,
        new NextResponse("Email and message are required", {
          status: 400,
        })
      );
    }

    if (!websiteId) {
      return cors(
        request,
        new NextResponse("Website ID is required", {
          status: 400,
        })
      );
    }

    // Find the website to get the associated userId
    const websites = (await query("SELECT userId FROM Website WHERE id = ?", [
      websiteId,
    ])) as Website[];

    if (websites.length === 0) {
      return cors(
        request,
        new NextResponse("Website not found", { status: 404 })
      );
    }

    const website = websites[0];

    // Create the contact record
    const result = await query(
      "INSERT INTO Contact (email, message, threadId, userId, websiteId) VALUES (?, ?, ?, ?, ?)",
      [email, message, threadId || "", website.userId, websiteId]
    );

    const contactId = (result as any).insertId;

    // Get the user's email to send notification
    const users = (await query("SELECT email FROM User WHERE id = ?", [
      website.userId,
    ])) as User[];

    if (users.length > 0 && users[0].email) {
      const userEmail = users[0].email;

      // Create specific contact URL with ID
      const contactViewUrl = `https://www.voicero.ai/app/contacts/query?id=${contactId}`;

      // Send notification email using AWS SES
      const params = {
        Source: "support@voicero.ai",
        Destination: {
          ToAddresses: [userEmail],
        },
        Message: {
          Subject: {
            Data: "New Contact Form Submission",
            Charset: "UTF-8",
          },
          Body: {
            Text: {
              Data: `
New contact form submission:

Email: ${email}
Message: ${message}

View this contact: ${contactViewUrl}

Time: ${new Date().toLocaleString()}
              `,
              Charset: "UTF-8",
            },
            Html: {
              Data: `
                <h2>Voicero AI - New Contact Form Submission</h2>
                <p>A new contact form submission has been received:</p>
                <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
                  <tr>
                    <td style="padding: 10px; border: 1px solid #ddd;"><strong>Email:</strong></td>
                    <td style="padding: 10px; border: 1px solid #ddd;">${email}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #ddd;"><strong>Message:</strong></td>
                    <td style="padding: 10px; border: 1px solid #ddd;">${message}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #ddd;"><strong>Time:</strong></td>
                    <td style="padding: 10px; border: 1px solid #ddd;">${new Date().toLocaleString()}</td>
                  </tr>
                </table>
                <div style="margin-top: 20px;">
                  <a href="${contactViewUrl}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-align: center; text-decoration: none; display: inline-block; border-radius: 5px;">
                    View Contact
                  </a>
                </div>
              `,
              Charset: "UTF-8",
            },
          },
        },
      };

      await ses.send(new SendEmailCommand(params));
    }

    // Get the created contact
    const contacts = (await query("SELECT * FROM Contact WHERE id = ?", [
      contactId,
    ])) as Contact[];

    return cors(request, NextResponse.json(contacts[0]));
  } catch (error) {
    console.error("[CONTACT_HELP_POST]", error);
    return cors(request, new NextResponse("Internal Error", { status: 500 }));
  }
}
