import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
export const dynamic = "force-dynamic";

const ses = new SESClient({
  region: process.env.AWS_REGION || "us-east-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// This route will be called by Vercel Cron every hour
export async function GET() {
  try {
    // Calculate the date 24 hours ago
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    // Find contacts that are:
    // 1. Created more than 24 hours ago
    // 2. Not yet read (read = false)
    // 3. Not yet reminded (reminded = false)
    const unreadContacts = await prisma.contact.findMany({
      where: {
        createdAt: {
          lt: twentyFourHoursAgo,
        },
        read: false,
        reminded: false,
      },
      include: {
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    console.log(
      `Found ${unreadContacts.length} unread contacts older than 24 hours`
    );

    // Send reminder emails for each unread contact
    for (const contact of unreadContacts) {
      if (contact.user && contact.user.email) {
        const contactViewUrl = `https://www.voicero.ai/app/contacts/query?id=${contact.id}`;

        // Send reminder email using AWS SES
        const params = {
          Source: "support@voicero.ai",
          Destination: {
            ToAddresses: [contact.user.email],
          },
          Message: {
            Subject: {
              Data: "Reminder: Unread Contact Form Submission",
              Charset: "UTF-8",
            },
            Body: {
              Text: {
                Data: `
Reminder: You have an unread contact form submission from 24+ hours ago:

Email: ${contact.email}
Message: ${contact.message}

Please respond to this inquiry at your earliest convenience.
View this contact: ${contactViewUrl}

Time Received: ${contact.createdAt.toLocaleString()}
                `,
                Charset: "UTF-8",
              },
              Html: {
                Data: `
                  <h2>Reminder: Unread Contact Form Submission</h2>
                  <p>You have an unread contact form submission from 24+ hours ago:</p>
                  <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
                    <tr>
                      <td style="padding: 10px; border: 1px solid #ddd;"><strong>Email:</strong></td>
                      <td style="padding: 10px; border: 1px solid #ddd;">${
                        contact.email
                      }</td>
                    </tr>
                    <tr>
                      <td style="padding: 10px; border: 1px solid #ddd;"><strong>Message:</strong></td>
                      <td style="padding: 10px; border: 1px solid #ddd;">${
                        contact.message
                      }</td>
                    </tr>
                    <tr>
                      <td style="padding: 10px; border: 1px solid #ddd;"><strong>Time Received:</strong></td>
                      <td style="padding: 10px; border: 1px solid #ddd;">${contact.createdAt.toLocaleString()}</td>
                    </tr>
                  </table>
                  <p>Please respond to this inquiry at your earliest convenience.</p>
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

        // Mark contact as reminded
        await prisma.contact.update({
          where: { id: contact.id },
          data: { reminded: true },
        });

        console.log(
          `Sent reminder email for contact ${contact.id} to ${contact.user.email}`
        );
      }
    }

    return NextResponse.json({
      success: true,
      processed: unreadContacts.length,
    });
  } catch (error) {
    console.error("[CRON_REMINDER_UNREAD_CONTACTS]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
