import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
export const dynamic = "force-dynamic";

interface ScheduledEmail {
  id: string;
  email: string;
  type: string;
  platform: string | null;
  scheduledFor: Date;
  sent: boolean;
}

const ses = new SESClient({
  region: process.env.AWS_REGION || "us-east-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

/**
 * Send questionnaire email using Amazon SES
 */
async function sendQuestionnaireEmail(email: string, platform: string) {
  try {
    console.log("Preparing to send questionnaire email to:", email);

    // Format platform name
    const formattedPlatform = platform
      ? platform.charAt(0).toUpperCase() + platform.slice(1)
      : "our platform";

    // Create HTML and text content
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p>Hello,</p>
        
        <p>Thank you for signing up to be among the first to experience Voicero AI, our newest chat bot designed for ${formattedPlatform} stores to boost conversion rates. We're just a few weeks away from launch, and I'm excited you'll be one of our earliest users.</p>
        
        <p>I'm Nolan, one of the founders, and I would love your feedback:</p>
        
        <ol>
          <li>Do you currently have a chat bot on your website?</li>
          <li>Are conversion rates a main struggle in your business? If so, how did you realize this was an issue?</li>
          <li>Have you tried other third-party tools or ${formattedPlatform} apps to address this?</li>
          <li>How did you hear about Voicero AI?</li>
        </ol>
        
        <p>Your insights will help us improve Voicero AI before it goes live. Thank you again for signing up early, and I look forward to hearing from you.</p>
        
        <p>If you want to talk to me personally, feel free to call me (330) 696-2596.</p>
        
        <p>Best regards,<br>Nolan<br>Co-Founder of Voicero AI</p>
      </div>
    `;

    const textContent = `
Hello,

Thank you for signing up to be among the first to experience Voicero AI, our newest chat bot designed for ${formattedPlatform} stores to boost conversion rates. We're just a few weeks away from launch, and I'm excited you'll be one of our earliest users.

I'm Nolan, one of the founders, and I would love your feedback:

1. Do you currently have a chat bot on your website?
2. Are conversion rates a main struggle in your business? If so, how did you realize this was an issue?
3. Have you tried other third-party tools or ${formattedPlatform} apps to address this?
4. How did you hear about Voicero AI?

Your insights will help us improve Voicero AI before it goes live. Thank you again for signing up early, and I look forward to hearing from you.

If you want to talk to me personally, feel free to call me (330) 696-2596.

Best regards,
Nolan
Co-Founder of Voicero AI
    `;

    // Send email using SES
    const params = {
      Source: "info@voicero.ai",
      Destination: {
        ToAddresses: [email],
      },
      Message: {
        Subject: {
          Data: "Quick questions about your Shopify store",
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
      // Add headers by using Message Attributes
      MessageAttributes: {
        "X-Category": {
          DataType: "String",
          StringValue: "transactional",
        },
        "X-Priority": {
          DataType: "String",
          StringValue: "1",
        },
      },
    };

    await ses.send(new SendEmailCommand(params));
    console.log("Successfully sent questionnaire email via SES");
    return true;
  } catch (error) {
    console.error("Error sending questionnaire email via SES:", error);
    return false;
  }
}

// Helper function to delay execution
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function GET(request: Request) {
  try {
    const now = new Date();
    console.log("Current time:", now.toISOString());

    // Get all unsent scheduled emails that are due
    const scheduledEmails = (await query(
      "SELECT id, email, type, platform, scheduledFor, sent FROM ScheduledEmail WHERE sent = ? AND scheduledFor <= ?",
      [false, now]
    )) as ScheduledEmail[];

    console.log(
      "Found scheduled emails:",
      JSON.stringify(scheduledEmails, null, 2)
    );
    console.log(`Found ${scheduledEmails.length} emails to send`);

    // Set delay to process 10 emails per second (1000ms / 10 ≈ 100ms)
    const delayBetweenEmails = 100;

    // Process emails in parallel with rate limiting
    const batchSize = 10; // Process 10 emails at a time

    // Process emails in batches
    for (let i = 0; i < scheduledEmails.length; i += batchSize) {
      const batch = scheduledEmails.slice(i, i + batchSize);
      console.log(
        `Processing batch ${i / batchSize + 1}, size: ${batch.length}`
      );

      // Process a batch of emails in parallel
      const promises = batch.map(async (email, index) => {
        // Stagger the emails slightly within the batch to avoid exact simultaneous sending
        await delay(index * delayBetweenEmails);

        console.log("Processing email:", email);
        if (email.type === "QUESTIONNAIRE") {
          const success = await sendQuestionnaireEmail(
            email.email,
            email.platform || "our platform"
          );
          console.log("Email send result:", success);

          if (success) {
            // Mark as sent
            await query("UPDATE ScheduledEmail SET sent = ? WHERE id = ?", [
              true,
              email.id,
            ]);
            console.log("Marked email as sent:", email.id);
          }
        }
      });

      // Wait for the current batch to complete
      await Promise.all(promises);

      // Add a small delay between batches to avoid hitting AWS rate limits
      if (i + batchSize < scheduledEmails.length) {
        await delay(500);
      }
    }

    return NextResponse.json({
      message: `Processed ${scheduledEmails.length} scheduled emails at 10 per second`,
    });
  } catch (error) {
    console.error("Error processing scheduled emails:", error);
    return NextResponse.json(
      { error: "Failed to process scheduled emails" },
      { status: 500 }
    );
  }
}
