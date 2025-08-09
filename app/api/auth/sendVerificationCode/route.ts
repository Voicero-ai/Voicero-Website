import { NextResponse } from "next/server";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { query } from "../../../../lib/db";
import crypto from "crypto";

export const dynamic = "force-dynamic";

interface User {
  id: string;
  email: string;
}

// Configure AWS SES client
const ses = new SESClient({
  region: process.env.AWS_REGION || "us-east-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    console.log(`Attempting to send verification code to ${email}`);

    // Find user by email
    const users = (await query("SELECT id, email FROM User WHERE email = ?", [
      email,
    ])) as User[];

    if (users.length === 0) {
      console.log(`No user found with email: ${email}`);
      // Don't reveal that the user doesn't exist for security
      return NextResponse.json(
        { message: "If this email exists, a code has been sent" },
        { status: 200 }
      );
    }

    const user = users[0];

    // Generate a 6-digit verification code
    const verificationCode = crypto.randomInt(100000, 999999).toString();
    console.log(
      `Generated verification code for ${email}: ${verificationCode}`
    );

    // Save the code to the user record
    await query("UPDATE User SET emailCode = ? WHERE id = ?", [
      verificationCode,
      user.id,
    ]);
    console.log(`Saved verification code to database for user: ${user.id}`);

    // Send email with verification code
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #6B46C1;">Verify Your Email Address</h1>
        <p>Please use the following code to verify your email address:</p>
        <div style="background-color: #f4f4f4; padding: 10px; text-align: center; font-size: 24px; letter-spacing: 5px; margin: 20px 0;">
          <strong>${verificationCode}</strong>
        </div>
        <p>This code will expire after 15 minutes.</p>
        <p>If you did not request this code, please ignore this email.</p>
        <p>Best regards,<br>The Voicero Team</p>
      </div>
    `;

    const textContent = `
      Verify Your Email Address
      
      Please use the following code to verify your email address:
      
      ${verificationCode}
      
      This code will expire after 15 minutes.
      
      If you did not request this code, please ignore this email.
      
      Best regards,
      The Voicero Team
    `;

    const params = {
      Source: "info@voicero.ai",
      Destination: {
        ToAddresses: [email],
      },
      Message: {
        Subject: {
          Data: "Verify Your Email Address - Voicero",
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

    console.log(`Attempting to send email via SES to ${email}`);
    try {
      const result = await ses.send(new SendEmailCommand(params));
      console.log(`Successfully sent verification email to ${email}`, result);
    } catch (emailError) {
      console.error(`Failed to send email via SES:`, emailError);
      return NextResponse.json(
        { error: "Failed to send verification email. Please try again later." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: "Verification code sent successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in sendVerificationCode:", error);
    return NextResponse.json(
      { error: "Failed to send verification code" },
      { status: 500 }
    );
  }
}
