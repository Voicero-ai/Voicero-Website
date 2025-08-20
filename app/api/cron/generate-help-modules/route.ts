import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import OpenAI from "openai";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ses = new SESClient({
  region: process.env.AWS_REGION || "us-east-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function sendHelpModuleNotification(
  websiteId: string,
  websiteName: string,
  userEmail: string,
  helpModuleNumbers: number[]
) {
  try {
    const numbersText =
      helpModuleNumbers.length === 1
        ? `help module #${helpModuleNumbers[0]}`
        : `help modules #${helpModuleNumbers.join(", #")}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #6B46C1;">New Help Modules Generated! 🤖</h1>
        <p>Voicero AI has automatically generated ${numbersText} for your website <strong>${websiteName}</strong>.</p>
        <p>These help modules are based on actual customer conversations and are designed to address common questions your customers ask.</p>
        <p><strong>To view the new help modules:</strong></p>
        <p><a href="http://localhost:3000/app/websites/website/help?id=${websiteId}" style="background-color: #6B46C1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Help Modules</a></p>
        <p><strong>Note:</strong> The new help modules are currently set to "draft" status and need your review before publishing.</p>
        <p>Best regards,<br>The Voicero Team</p>
      </div>
    `;

    const textContent = `
      New Help Modules Generated!
      
      Voicero AI has automatically generated ${numbersText} for your website ${websiteName}.
      
      These help modules are based on actual customer conversations and are designed to address common questions your customers ask.
      
      To view the new help modules:
      http://localhost:3000/app/websites/website/help?id=${websiteId}
      
      Note: The new help modules are currently set to "draft" status and need your review before publishing.
      
      Best regards,
      The Voicero Team
    `;

    const params = {
      Source: "info@voicero.ai",
      Destination: {
        ToAddresses: [userEmail],
      },
      Message: {
        Subject: {
          Data: `New Help Modules Generated for ${websiteName} 🎯`,
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
    console.log(
      `Successfully sent help module notification email to ${userEmail}`
    );
    return true;
  } catch (error) {
    console.error("Error sending help module notification email:", error);
    return false;
  }
}

export async function GET(request: Request) {
  try {
    console.log("Starting help module generation...");

    // Get only the Is117a njasd website
    console.log("Searching for Is117a website...");
    const websites = await query(
      `SELECT w.id, w.name, w.url, u.email as userEmail 
       FROM Website w 
       JOIN User u ON w.userId = u.id 
       WHERE w.name LIKE '%Is117a%' OR w.url LIKE '%is117a%' 
       LIMIT 1`,
      []
    );

    console.log(`Query result:`, websites);

    if (websites.length === 0) {
      console.log("No Is117a website found in database");
      return NextResponse.json({
        message: "No Is117a website found",
        totalGenerated: 0,
      });
    }

    console.log(`Found website: ${websites[0].name} (${websites[0].id})`);

    let totalGenerated = 0;

    for (const website of websites) {
      try {
        console.log(`Processing website: ${website.name}`);

        // Get conversations from past 7 days
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        console.log(
          `Looking for conversations since: ${sevenDaysAgo.toISOString()}`
        );

        const conversations = await query(
          `SELECT vc.id, vc.sessionId, vc.createdAt
           FROM VoiceConversations vc
           JOIN Session s ON vc.sessionId = s.id
           WHERE s.websiteId = ? AND vc.mostRecentConversationAt >= ?
           LIMIT 10`,
          [website.id, sevenDaysAgo]
        );

        console.log(
          `Found ${conversations.length} conversations for ${website.name}`
        );

        if (conversations.length === 0) {
          console.log(`No conversations for ${website.name}`);
          continue;
        }

        // Get chat messages
        console.log(
          `Fetching chat messages for ${conversations.length} conversations...`
        );
        const chatMessages = await query(
          `SELECT messageType, content 
           FROM VoiceChats 
           WHERE voiceConversationId IN (${conversations
             .map(() => "?")
             .join(",")})
           AND content IS NOT NULL AND content != ''`,
          conversations.map((c: any) => c.id)
        );

        console.log(`Found ${chatMessages.length} chat messages`);

        if (chatMessages.length === 0) {
          console.log(`No chat messages for ${website.name}`);
          continue;
        }

        // Prepare conversation text for AI
        const conversationText = chatMessages
          .map((msg: any) => `${msg.messageType}: ${msg.content}`)
          .join("\n");

        // Call OpenAI to analyze conversations
        console.log(
          `Calling OpenAI to analyze ${chatMessages.length} chat messages...`
        );
        const analysisResponse = await openai.responses.create({
          model: "gpt-5-mini",
          instructions: [
            "You are an AI assistant analyzing customer conversations from an e-commerce website.",
            "Your task is to identify 1-2 questions that customers REALLY struggle with and absolutely need help documentation for.",
            "Only choose the most critical pain points that come up repeatedly.",
            "Ignore basic navigation or obvious questions.",
            "You must respond in valid JSON format with the following structure:",
            "[",
            '  {"question": "Question here", "answer": "Brief answer"}',
            "]",
            "Return ONLY the JSON array, no other text or explanations.",
          ].join(" "),
          input: `Conversations:
${conversationText}`,
        });

        const analysisContent = (analysisResponse as any).output_text;
        console.log(`OpenAI analysis response:`, analysisContent);

        if (!analysisContent) {
          console.log(`No analysis content received from OpenAI`);
          continue;
        }

        // Clean the response content - remove markdown code blocks
        let cleanContent = analysisContent;
        if (cleanContent.includes("```json")) {
          cleanContent = cleanContent
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "");
        } else if (cleanContent.includes("```")) {
          cleanContent = cleanContent.replace(/```\n?/g, "");
        }

        console.log(`Cleaned content:`, cleanContent);

        // Parse response
        let helpTopics;
        try {
          helpTopics = JSON.parse(cleanContent);
          console.log(`Parsed help topics:`, helpTopics);
        } catch (e) {
          console.log(`Failed to parse AI response for ${website.name}:`, e);
          console.log(`Raw content was:`, analysisContent);
          continue;
        }

        if (!Array.isArray(helpTopics)) {
          console.log(`Help topics is not an array:`, helpTopics);
          continue;
        }

        // Generate help modules
        console.log(`Generating ${helpTopics.length} help modules...`);
        const createdHelpModuleNumbers: number[] = [];

        for (const topic of helpTopics) {
          try {
            console.log(`Processing topic: ${topic.question}`);

            // Expand the answer
            console.log(
              `Calling OpenAI to expand answer for: ${topic.question}`
            );
            const expansionResponse = await openai.responses.create({
              model: "gpt-5-mini",
              instructions: [
                "You are creating a detailed help document for an e-commerce website.",
                "Be direct and helpful - no generic intros like 'Welcome to...' or 'At [Company Name]...'",
                "Just start with the actual help content.",
                "Make it clear, step-by-step, and actionable.",
                "Provide comprehensive instructions that customers can follow easily.",
              ].join(" "),
              input: `Question: ${topic.question}
Answer: ${topic.answer}`,
            });

            const expandedAnswer = (expansionResponse as any).output_text;
            if (!expandedAnswer) continue;

            // Get next number
            const existingModules = await query(
              `SELECT MAX(number) as maxNumber FROM HelpModule WHERE websiteId = ?`,
              [website.id]
            );
            const nextNumber = (existingModules[0]?.maxNumber || 0) + 1;

            // Insert help module
            await query(
              `INSERT INTO HelpModule (id, websiteId, question, documentAnswer, number, type, status)
               VALUES (UUID(), ?, ?, ?, ?, 'ai', 'draft')`,
              [website.id, topic.question, expandedAnswer, nextNumber]
            );

            createdHelpModuleNumbers.push(nextNumber);
            totalGenerated++;
            console.log(`Created help module: ${topic.question}`);
          } catch (error) {
            console.error(`Error creating help module:`, error);
          }
        }

        // Send email notification if help modules were created
        if (createdHelpModuleNumbers.length > 0 && website.userEmail) {
          console.log(`Sending email notification to ${website.userEmail}`);
          await sendHelpModuleNotification(
            website.id,
            website.name,
            website.userEmail,
            createdHelpModuleNumbers
          );
        }
      } catch (error) {
        console.error(`Error processing website ${website.id}:`, error);
      }
    }

    console.log(`=== FINAL SUMMARY ===`);
    console.log(`Total help modules generated: ${totalGenerated}`);
    console.log(`Process completed successfully`);

    return NextResponse.json({
      message: `Generated ${totalGenerated} help modules`,
      totalGenerated,
    });
  } catch (error) {
    console.error("Error in help module generation:", error);
    return NextResponse.json(
      { error: "Failed to generate help modules" },
      { status: 500 }
    );
  }
}
