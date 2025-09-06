import { NextResponse } from "next/server";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { query } from "../../../lib/db";

export const dynamic = "force-dynamic";

const ses = new SESClient({
  region: process.env.AWS_REGION || "us-east-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(request: Request) {
  try {
    const { name, email, company, message } = await request.json();

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "Name, email and message are required" },
        { status: 400 }
      );
    }

    // Generate UUID for the contact submission
    const contactId = crypto.randomUUID();

    // Store contact submission in database using direct SQL
    const contactResult = await query(
      "INSERT INTO ContactUs (id, name, email, company, message) VALUES (?, ?, ?, ?, ?)",
      [contactId, name, email, company || null, message]
    );

    // Send notification email using AWS SES
    const params = {
      Source: "info@voicero.ai",
      Destination: {
        ToAddresses: ["support@voicero.ai", "info@voicero.ai"],
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

Name: ${name}
Email: ${email}
Company: ${company || "Not provided"}
Message: ${message}

Time: ${new Date().toLocaleString()}
            `,
            Charset: "UTF-8",
          },
          Html: {
            Data: `
              <h2>New Contact Form Submission</h2>
              <p>A new contact form submission has been received:</p>
              <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
                <tr>
                  <td style="padding: 10px; border: 1px solid #ddd;"><strong>Name:</strong></td>
                  <td style="padding: 10px; border: 1px solid #ddd;">${name}</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border: 1px solid #ddd;"><strong>Email:</strong></td>
                  <td style="padding: 10px; border: 1px solid #ddd;">${email}</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border: 1px solid #ddd;"><strong>Company:</strong></td>
                  <td style="padding: 10px; border: 1px solid #ddd;">${
                    company || "Not provided"
                  }</td>
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
            `,
            Charset: "UTF-8",
          },
        },
      },
    };

    await ses.send(new SendEmailCommand(params));

    return NextResponse.json(
      { message: "Contact form submitted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Contact form submission error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
