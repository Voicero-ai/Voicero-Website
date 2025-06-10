import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cors } from "../../../lib/cors";
import { OpenAIEmbeddings } from "@langchain/openai";
import { PineconeStore } from "@langchain/pinecone";
import { OpenAI } from "openai";
import { pinecone } from "../../../lib/pinecone";

// Configure for long-running requests
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

const prisma = new PrismaClient();
const openai = new OpenAI();

export async function OPTIONS(request: NextRequest) {
  const response = new NextResponse(null, { status: 204 });
  return cors(request, response);
}

export async function POST(request: NextRequest) {
  // Create a TransformStream for streaming
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  try {
    console.log("🚀 Chat request received");
    const response = new NextResponse();

    // Get the authorization header
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.log("❌ Missing or invalid authorization header");
      return cors(
        request,
        NextResponse.json(
          { error: "Missing or invalid authorization header" },
          { status: 401 }
        )
      );
    }

    // Extract the access key
    const accessKey = authHeader.split(" ")[1];
    if (!accessKey) {
      console.log("❌ No access key provided");
      return cors(
        request,
        NextResponse.json({ error: "No access key provided" }, { status: 401 })
      );
    }

    // Get request body and website lookup in parallel
    const [
      { message, context, threadId, isVoiceInput, pastPrompts = [] },
      website,
    ] = await Promise.all([
      request.json(),
      prisma.website.findFirst({
        where: {
          accessKeys: {
            some: {
              key: accessKey,
            },
          },
        },
        select: {
          id: true,
          aiAssistantId: true,
          monthlyQueries: true,
          queryLimit: true,
          plan: true,
        },
      }),
    ]);

    if (!website) {
      console.log("❌ Invalid access key - no website found");
      return cors(
        request,
        NextResponse.json({ error: "Invalid access key" }, { status: 401 })
      );
    }

    console.log("✅ Found website:", website.id);

    if (!website.aiAssistantId) {
      console.log("❌ Website assistant not configured");
      return cors(
        request,
        NextResponse.json(
          { error: "Website assistant not configured" },
          { status: 400 }
        )
      );
    }

    // Check if website has exceeded query limit
    if (website.monthlyQueries >= website.queryLimit) {
      console.log("❌ Query limit exceeded");
      return cors(
        request,
        NextResponse.json(
          {
            error: "Monthly query limit exceeded",
            details: {
              currentQueries: website.monthlyQueries,
              limit: website.queryLimit,
              plan: website.plan,
            },
          },
          { status: 429 }
        )
      );
    }

    // Parallelize content fetching if needed
    let contentPromise = Promise.resolve(context.currentContent);
    if (!context.currentContent && context.currentUrl) {
      const urlPath = new URL(context.currentUrl).pathname;
      const slug = urlPath.split("/").filter(Boolean).pop() || "";

      contentPromise = Promise.all([
        prisma.wordpressPage.findFirst({
          where: { websiteId: website.id, slug },
        }),
        prisma.wordpressPost.findFirst({
          where: { websiteId: website.id, slug },
        }),
        prisma.wordpressProduct.findFirst({
          where: { websiteId: website.id, slug },
        }),
      ]).then(([page, post, product]) => {
        if (page) return page.content;
        if (post) return post.content;
        if (product)
          return `${product.description}\n${product.shortDescription || ""}`;
        return null;
      });
    }

    // Initialize embeddings and get content in parallel
    const [embeddings, finalContent] = await Promise.all([
      new OpenAIEmbeddings({
        modelName: "text-embedding-3-large",
      }),
      contentPromise,
    ]);

    // Update context with fetched content
    context.currentContent = finalContent || context.currentContent;

    console.log(
      "📄 Final currentContent length:",
      context.currentContent?.length || 0
    );

    // Initialize Pinecone store
    const index = pinecone.Index(process.env.PINECONE_INDEX!);
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex: index,
      namespace: website.id,
    });

    // Combine past prompts with current message for better context
    const combinedSearchText = [message, ...pastPrompts.slice(-2)].join(" "); // Only use last 2 prompts
    const searchResults = await vectorStore.similaritySearch(
      combinedSearchText,
      2
    ); // Reduce to 2 results

    // Optimize context message to be more concise
    const contextMessage = `Previous context: ${pastPrompts
      .slice(-2)
      .join(" | ")}

Relevant content:
${searchResults
  .map((doc, i) => {
    const type = doc.metadata.type;
    return `${type}: ${doc.metadata.title || doc.metadata.name || ""}
${doc.metadata.content || doc.pageContent || ""}`;
  })
  .join("\n---\n")}

Current page: ${context.currentUrl}
${context.currentContent ? "Page content available" : "No page content"}`;

    // Get or create thread and send messages in parallel
    let aiThread = threadId
      ? await prisma.aiThread.findFirst({
          where: {
            OR: [{ id: threadId }, { threadId: threadId }],
            websiteId: website.id,
          },
        })
      : null;

    let openAiThreadId;
    if (!aiThread) {
      const openAiThread = await openai.beta.threads.create();
      openAiThreadId = openAiThread.id;
      aiThread = await prisma.aiThread.create({
        data: {
          threadId: openAiThreadId,
          websiteId: website.id,
        },
      });
    } else {
      openAiThreadId = aiThread.threadId;
    }

    // Send context and message in one go instead of multiple calls
    await openai.beta.threads.messages.create(openAiThreadId, {
      role: "user",
      content: `${contextMessage}\n\nCurrent query: ${
        isVoiceInput ? "[Voice] " : ""
      }${message}`,
    });

    // Create run with additional instructions
    console.log("🏃 Starting assistant run...");
    const run = await openai.beta.threads.runs.create(openAiThreadId, {
      assistant_id: website.aiAssistantId,
      instructions: `Use what's given and your instructions to answer the user. Follow your custom instructions strictly and don't make up any information. Format your response as a JSON object with the following structure:
      {
        "content": "Your response message here",
        "redirect_url": "URL to redirect to (or null if no redirect needed)",
        "scroll_to_text": "Text to scroll to on the page (or null if no scroll needed)"
      }`,
    });

    // Wait for completion
    let runStatus = await openai.beta.threads.runs.retrieve(
      openAiThreadId,
      run.id
    );

    while (runStatus.status !== "completed") {
      if (runStatus.status === "requires_action") {
        // Handle required actions (function calls)
        if (runStatus.required_action?.type === "submit_tool_outputs") {
          const toolCalls =
            runStatus.required_action.submit_tool_outputs.tool_calls;
          const toolOutputs = toolCalls.map((toolCall) => {
            // Parse the function arguments
            const functionArgs = JSON.parse(toolCall.function.arguments);

            // Return the tool output in the expected format
            return {
              tool_call_id: toolCall.id,
              output: JSON.stringify(functionArgs),
            };
          });

          // Submit the tool outputs back to the assistant
          runStatus = await openai.beta.threads.runs.submitToolOutputs(
            openAiThreadId,
            run.id,
            {
              tool_outputs: toolOutputs,
            }
          );
        }
      } else {
        // Wait before checking status again
        await new Promise((resolve) => setTimeout(resolve, 1000));
        runStatus = await openai.beta.threads.runs.retrieve(
          openAiThreadId,
          run.id
        );

        if (runStatus.status === "failed") {
          console.error("❌ Assistant run failed:", runStatus.last_error);
          throw new Error("Assistant run failed");
        }
        console.log("⏳ Run status:", runStatus.status);
      }
    }

    // Get the response
    console.log("✅ Getting assistant response...");
    const messages = await openai.beta.threads.messages.list(openAiThreadId);
    const lastMessage = messages.data[0];

    // Parse the JSON response
    const aiResponse =
      lastMessage.content[0].type === "text"
        ? JSON.parse(
            (
              lastMessage.content[0] as {
                type: "text";
                text: { value: string };
              }
            ).text.value
          )
        : { content: "", redirect_url: null, scroll_to_text: null };

    console.log("🤖 AI Response:", aiResponse);

    // Save assistant response to database
    await prisma.aiMessage.create({
      data: {
        threadId: aiThread.id,
        role: "assistant",
        content: JSON.stringify(aiResponse),
        type: "text",
      },
    });

    // After successful AI response, increment the monthly queries counter
    await prisma.website.update({
      where: { id: website.id },
      data: {
        monthlyQueries: {
          increment: 1,
        },
      },
    });

    // After getting the AI response, stream it back
    const responseData = {
      response: aiResponse,
      relevantContent: searchResults,
      threadId: openAiThreadId,
    };

    await writer.write(encoder.encode(JSON.stringify(responseData)));
    await writer.close();

    return cors(
      request,
      new NextResponse(stream.readable, {
        headers: {
          "Content-Type": "application/json",
          "Transfer-Encoding": "chunked",
          Connection: "keep-alive",
        },
      })
    );
  } catch (error) {
    console.error("❌ Chat error:", error);
    await writer.write(
      encoder.encode(
        JSON.stringify({ error: "Failed to process chat request" })
      )
    );
    await writer.close();

    return cors(
      request,
      new NextResponse(stream.readable, {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Transfer-Encoding": "chunked",
          Connection: "keep-alive",
        },
      })
    );
  }
}
