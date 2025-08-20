import { NextResponse } from "next/server";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { query } from '../../../lib/db';
export const dynamic = "force-dynamic";

interface Waitlist {
  id: string;
  email: string;
  platform: string;
  createdAt: Date;
}

const ses = new SESClient({
  region: process.env.AWS_REGION || "us-east-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

/**
 * Schedule follow-up email
 */
async function scheduleFollowUpEmail(email: string, platform: string) {
  try {
    // Store the email in the database with a scheduled time
    await query(
      "INSERT INTO ScheduledEmail (email, platform, scheduledFor, type, sent) VALUES (?, ?, ?, ?, ?)",
      [
        email,
        platform,
        new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
        "QUESTIONNAIRE",
        false,
      ]
    );

    return true;
  } catch (error) {
    console.error("Error scheduling follow-up email:", error);
    return false;
  }
}

/**
 * Send thank you email using Amazon SES
 */
async function sendThankYouEmail(email: string, platform: string) {
  try {
    console.log("Preparing to send thank you email to:", email);

    // Format platform name
    const formattedPlatform = platform
      ? platform.charAt(0).toUpperCase() + platform.slice(1)
      : "Not specified";

    // Create HTML and text content
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #6B46C1;">Welcome to Voicero!</h1>
        <p>Thank you for joining our waitlist. We're excited to have you on board!</p>
        <p>You've indicated you're interested in our ${formattedPlatform} integration.</p>
        <p>We'll keep you updated on our progress and notify you as soon as we launch.</p>
        <p>Best regards,<br>The Voicero Team</p>
      </div>
    `;

    const textContent = `
      Welcome to Voicero!
      
      Thank you for joining our waitlist. We're excited to have you on board!
      
      You've indicated you're interested in our ${formattedPlatform} integration.
      
      We'll keep you updated on our progress and notify you as soon as we launch.
      
      Best regards,
      The Voicero Team
    `;

    // Send email using SES
    const params = {
      Source: "info@voicero.ai",
      Destination: {
        ToAddresses: [email],
      },
      Message: {
        Subject: {
          Data: "Welcome to the Voicero Waitlist! 🎉",
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

    await ses.send(new SendEmailCommand(params));
    console.log("Successfully sent thank you email via SES");
    return true;
  } catch (error) {
    console.error("Error sending thank you email via SES:", error);
    return false;
  }
}

/**
 * Process new waitlist signup
 */
async function processWaitlistSignup(email: string, platform: string) {
  try {
    // Capitalize platform name
    const formattedPlatform = platform
      ? platform.charAt(0).toUpperCase() + platform.slice(1)
      : "Not specified";

    console.log("Processing waitlist signup:", {
      email,
      platform: formattedPlatform,
    });

    // Send thank you email
    console.log("Attempting to send thank you email");
    const emailResult = await sendThankYouEmail(email, formattedPlatform);
    console.log("Thank you email result:", emailResult);

    // Schedule follow-up email
    await scheduleFollowUpEmail(email, formattedPlatform);

    return true;
  } catch (error) {
    console.error("Error processing waitlist signup:", error);
    return false;
  }
}

export async function POST(request: Request) {
  try {
    // Add safety check for request body
    const body = await request.text();
    if (!body) {
      return NextResponse.json(
        { error: "Empty request body" },
        { status: 400 }
      );
    }

    // Safely parse JSON with error handling
    let data;
    try {
      data = JSON.parse(body);
    } catch (parseError) {
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    const { email, platform } = data;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Check if email already exists
    const existingEmails = (await query(
      "SELECT id FROM Waitlist WHERE email = ?",
      [email]
    )) as { id: string }[];

    if (existingEmails.length > 0) {
      return NextResponse.json(
        { error: "This email is already on the waitlist" },
        { status: 400 }
      );
    }

    // If email doesn't exist, proceed with creating it
    await query("INSERT INTO Waitlist (email, platform) VALUES (?, ?)", [
      email,
      platform,
    ]);

    // Get total count and all emails
    const totalCountResult = (await query(
      "SELECT COUNT(*) as count FROM Waitlist"
    )) as { count: number }[];
    const totalCount = totalCountResult[0].count;

    const allEmails = (await query(
      "SELECT email, platform FROM Waitlist ORDER BY createdAt DESC"
    )) as { email: string; platform: string | null }[];

    // Process the waitlist signup (send thank you email and schedule follow-up)
    await processWaitlistSignup(email, platform);

    // Send notification email using AWS SES
    const params = {
      Source: "info@voicero.ai",
      Destination: {
        ToAddresses: ["support@voicero.ai", "info@voicero.ai"],
      },
      Message: {
        Subject: {
          Data: "New Waitlist Signup",
          Charset: "UTF-8",
        },
        Body: {
          Text: {
            Data: `New waitlist signup: ${email}\nPlatform: ${platform}\nTotal waitlist count: ${totalCount}\n\nAll Emails:\n${allEmails
              .map((e) => `${e.email} (${e.platform || "Not specified"})`)
              .join("\n")}`,
            Charset: "UTF-8",
          },
          Html: {
            Data: `
              <h2>New Waitlist Signup</h2>
              <p>A new user has joined the waitlist:</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Platform:</strong> ${platform || "Not specified"}</p>
              <p><strong>Total Waitlist Count:</strong> ${totalCount}</p>
              <p>Time: ${new Date().toLocaleString()}</p>
              <h3>All Waitlist Emails:</h3>
              <ul>
                ${allEmails
                  .map(
                    (e) =>
                      `<li>${e.email} (${e.platform || "Not specified"})</li>`
                  )
                  .join("")}
              </ul>
            `,
            Charset: "UTF-8",
          },
        },
      },
    };

    await ses.send(new SendEmailCommand(params));

    return NextResponse.json(
      { message: "Successfully joined waitlist" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Waitlist submission error:", error);

    // Check if it's a MySQL unique constraint violation
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as any).code === "ER_DUP_ENTRY"
    ) {
      return NextResponse.json(
        { error: "This email is already on the waitlist" },
        { status: 400 }
      );
    }

    // Handle other errors
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
