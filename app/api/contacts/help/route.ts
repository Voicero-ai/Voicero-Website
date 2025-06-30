import { NextResponse, NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { cors } from "@/lib/cors";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
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
    const website = await prisma.website.findUnique({
      where: { id: websiteId },
      select: { userId: true },
    });

    if (!website) {
      return cors(
        request,
        new NextResponse("Website not found", { status: 404 })
      );
    }

    const contact = await prisma.contact.create({
      data: {
        email,
        message: message,
        threadId: threadId || "",
        userId: website.userId,
        websiteId: websiteId,
      },
    });

    // Get the user's email to send notification
    const user = await prisma.user.findUnique({
      where: { id: website.userId },
      select: { email: true },
    });

    if (user && user.email) {
      // Create specific contact URL with ID
      const contactViewUrl = `https://www.voicero.ai/app/contacts/query?id=${contact.id}`;

      // Send notification email using AWS SES
      const params = {
        Source: "support@voicero.ai",
        Destination: {
          ToAddresses: [user.email],
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

    return cors(request, NextResponse.json(contact));
  } catch (error) {
    console.error("[CONTACT_HELP_POST]", error);
    return cors(request, new NextResponse("Internal Error", { status: 500 }));
  }
}
