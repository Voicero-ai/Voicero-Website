import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { query } from "../../../../lib/db";
import crypto from "crypto";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

export const dynamic = "force-dynamic";

const ses = new SESClient({
  region: process.env.AWS_REGION || "us-east-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// User interface
interface User {
  id: string;
  username: string;
  email: string;
  name: string;
  createdAt: Date;
}

// Validation schema
const registerSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Username can only contain letters, numbers, underscores, and dashes"
    ),
  email: z.string().email("Please enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(
      /^(?=.*[0-9])(?=.*[!@#$%^&*])/,
      "Password must contain at least 1 number and 1 special character"
    ),
  companyName: z.string().min(2, "Company name is required"),
});

/**
 * Send welcome email to new user
 */
async function sendWelcomeEmail(email: string, name: string, username: string) {
  try {
    console.log("doing: sending welcome email to", email);

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to Voicero AI!</h2>
        
        <p>Hi ${name},</p>
        
        <p>Thank you for joining Voicero AI! We're excited to have you on board.</p>
        
        <p>Your account has been successfully created with username: <strong>${username}</strong></p>
        
        <p>Here's what you can do next:</p>
        <ul>
          <li>Log in to your dashboard</li>
          <li>Connect your website</li>
          <li>Start using our AI-powered chat solution</li>
        </ul>
        
        <p>If you have any questions or need assistance getting started, feel free to reach out to our support team.</p>
        
        <p>Welcome aboard!</p>
        <p>The Voicero AI Team</p>
      </div>
    `;

    const textContent = `
Welcome to Voicero AI!

Hi ${name},

Thank you for joining Voicero AI! We're excited to have you on board.

Your account has been successfully created with username: ${username}

Here's what you can do next:
- Log in to your dashboard
- Connect your website
- Start using our AI-powered chat solution

If you have any questions or need assistance getting started, feel free to reach out to our support team.

Welcome aboard!
The Voicero AI Team
    `;

    const params = {
      Source: "info@voicero.ai",
      Destination: {
        ToAddresses: [email],
      },
      Message: {
        Subject: {
          Data: "Welcome to Voicero AI!",
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
    console.log("done: welcome email sent to", email);
    return true;
  } catch (error) {
    console.error("Error sending welcome email:", error);
    return false;
  }
}

/**
 * Send internal notification email to team
 */
async function sendTeamNotificationEmail(
  userEmail: string,
  username: string,
  companyName: string
) {
  try {
    console.log("doing: sending team notification email");

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>New Signup Added</h2>
        
        <p>A new user has successfully signed up for Voicero AI:</p>
        
        <ul>
          <li><strong>Username:</strong> ${username}</li>
          <li><strong>Email:</strong> ${userEmail}</li>
          <li><strong>Company:</strong> ${companyName}</li>
          <li><strong>Signup Time:</strong> ${new Date().toISOString()}</li>
        </ul>
        
        <p>The user has been added to the system and should have received a welcome email.</p>
      </div>
    `;

    const textContent = `
New Signup Added

A new user has successfully signed up for Voicero AI:

- Username: ${username}
- Email: ${userEmail}
- Company: ${companyName}
- Signup Time: ${new Date().toISOString()}

The user has been added to the system and should have received a welcome email.
    `;

    const params = {
      Source: "support@voicero.ai",
      Destination: {
        ToAddresses: [
          "info@voicero.ai",
          "support@voicero.ai",
          "davidfales@voicero.ai",
          "nolan@voicero.ai",
        ],
      },
      Message: {
        Subject: {
          Data: "New Signup Added - Voicero AI",
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
      ReplyToAddresses: ["support@voicero.ai"],
    };

    await ses.send(new SendEmailCommand(params));
    console.log("done: team notification email sent");
    return true;
  } catch (error) {
    console.error("Error sending team notification email:", error);
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Validate request body
    const validatedData = registerSchema.parse(body);

    // Check if username is taken
    const existingUsernames = (await query(
      "SELECT id FROM User WHERE username = ?",
      [validatedData.username]
    )) as { id: string }[];

    if (existingUsernames.length > 0) {
      return NextResponse.json(
        { error: "Username is already taken" },
        { status: 400 }
      );
    }

    // Check if email is taken
    const existingEmails = (await query("SELECT id FROM User WHERE email = ?", [
      validatedData.email,
    ])) as { id: string }[];

    if (existingEmails.length > 0) {
      return NextResponse.json(
        { error: "Email is already registered" },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await hash(validatedData.password, 12);

    // Create user with explicit UUID
    const userUuid = crypto.randomUUID();

    // Insert with explicit ID
    await query(
      "INSERT INTO User (id, username, email, password, name) VALUES (?, ?, ?, ?, ?)",
      [
        userUuid,
        validatedData.username,
        validatedData.email,
        hashedPassword,
        validatedData.companyName,
      ]
    );

    // Get the created user
    const users = (await query(
      "SELECT id, username, email, name, createdAt FROM User WHERE id = ?",
      [userUuid]
    )) as User[];

    const user = users[0];

    // Send emails (don't block the response if they fail)
    try {
      // Send welcome email to user
      await sendWelcomeEmail(
        validatedData.email,
        validatedData.companyName,
        validatedData.username
      );

      // Send team notification email
      await sendTeamNotificationEmail(
        validatedData.email,
        validatedData.username,
        validatedData.companyName
      );
    } catch (emailError) {
      console.error("Error sending signup emails:", emailError);
      // Don't fail the registration if emails fail
    }

    return NextResponse.json(
      {
        message: "User registered successfully",
        user,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
