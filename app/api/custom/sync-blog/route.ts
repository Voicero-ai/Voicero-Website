import { NextRequest, NextResponse } from "next/server";
import { cors } from "../../../../lib/cors";
import { query } from "../../../../lib/db";
import {
  verifyToken,
  getWebsiteIdFromToken,
} from "../../../../lib/token-verifier";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../../lib/auth";
export const dynamic = "force-dynamic";

// Add OPTIONS handler for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    // Support multiple auth modes: session OR bearer token
    const authHeader = request.headers.get("authorization");

    // Parse request body
    const body = await request.json();
    const { websiteId, mainUrl } = body;

    console.log("doing: Sync custom blog content", { websiteId, mainUrl });

    if (!websiteId || !mainUrl) {
      return cors(
        request,
        NextResponse.json(
          { error: "Website ID and main URL are required" },
          { status: 400 }
        )
      );
    }

    // Try session-based auth first
    let userId: string | null = null;
    const session = await getServerSession(authOptions);
    if (session?.user?.email) {
      const users = (await query(
        `SELECT id FROM User WHERE email = ? LIMIT 1`,
        [session.user.email]
      )) as { id: string }[];
      if (users.length > 0) {
        userId = users[0].id;
      }
    }

    if (userId) {
      // Verify website ownership for session user
      const ownershipRows = (await query(
        `SELECT id, userId FROM Website WHERE id = ? LIMIT 1`,
        [websiteId]
      )) as { id: string; userId: string }[];
      const owner = ownershipRows[0];
      if (!owner) {
        return cors(
          request,
          NextResponse.json({ error: "Website not found" }, { status: 404 })
        );
      }
      if (owner.userId !== userId) {
        return cors(
          request,
          NextResponse.json(
            { error: "Unauthorized to access this website" },
            { status: 403 }
          )
        );
      }
    } else {
      // Fallback to Bearer token auth
      const isTokenValid = await verifyToken(authHeader);
      if (!isTokenValid) {
        return cors(
          request,
          NextResponse.json(
            {
              error:
                "Unauthorized. Please log in or provide a valid access key.",
            },
            { status: 401 }
          )
        );
      }

      const websiteIdFromToken = await getWebsiteIdFromToken(authHeader);
      if (!websiteIdFromToken) {
        return cors(
          request,
          NextResponse.json(
            { error: "Could not determine website ID from token" },
            { status: 400 }
          )
        );
      }

      if (websiteId !== websiteIdFromToken) {
        return cors(
          request,
          NextResponse.json(
            { error: "Unauthorized to access this website" },
            { status: 403 }
          )
        );
      }
    }

    // Create CustomBlogs table if it doesn't exist
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS CustomBlogs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          websiteId VARCHAR(255) NOT NULL,
          title VARCHAR(500) NOT NULL,
          content LONGTEXT NOT NULL,
          url VARCHAR(1000) NOT NULL,
          excerpt TEXT NULL,
          author VARCHAR(255) NULL,
          hot TINYINT DEFAULT 0,
          publishedAt DATETIME NULL,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_website_id (websiteId),
          INDEX idx_hot (hot),
          INDEX idx_published (publishedAt)
        )
      `);
    } catch (error: any) {
      console.error("Error creating CustomBlogs table:", error);
      // Continue anyway - table might already exist
    }

    // Intelligent web scraping using AI to analyze content
    try {
      const blogPosts = [];
      const visitedUrls = new Set<string>();
      const urlsToProcess = [mainUrl];

      while (urlsToProcess.length > 0 && blogPosts.length < 50) {
        // Limit to 50 posts
        const currentUrl = urlsToProcess.shift()!;

        if (visitedUrls.has(currentUrl)) continue;
        visitedUrls.add(currentUrl);

        console.log(`Processing URL: ${currentUrl}`);

        const response = await fetch(currentUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Voicero Bot/1.0)",
          },
        });

        if (!response.ok) {
          console.log(`Failed to fetch ${currentUrl}: ${response.status}`);
          continue;
        }

        const html = await response.text();

        // Send ALL content to AI for analysis
        const fullContent = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .substring(0, 15000); // Send more content to AI

        // Use OpenAI to analyze the FULL content
        try {
          const aiResponse = await fetch(
            "https://api.openai.com/v1/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                  {
                    role: "system",
                    content: `You are a web content analyzer. Analyze the provided webpage HTML and determine if it's:

1. BLOG LISTING PAGE: A page that contains multiple blog post links/previews (like a blog index, archive, or category page)
2. INDIVIDUAL BLOG POST: A single blog article with title and content

For BLOG LISTING PAGE:
- Extract all blog post URLs and titles from the page
- Respond with JSON: {"type": "blog_listing", "posts": [{"url": "full_url", "title": "post_title"}, ...]}

For INDIVIDUAL BLOG POST:
- Extract the main article title and content
- Respond with JSON: {"type": "blog_post", "title": "article_title", "content": "main_article_content"}

Important: 
- For blog listings, extract actual blog post URLs (not navigation links)
- For individual posts, extract clean readable content without HTML tags
- Keep content under 10000 characters`,
                  },
                  {
                    role: "user",
                    content: `URL: ${currentUrl}\n\nHTML Content: ${fullContent}`,
                  },
                ],
                max_tokens: 4000,
                temperature: 0.1,
              }),
            }
          );

          if (aiResponse.ok) {
            const aiResult = await aiResponse.json();
            let analysis;

            try {
              let content = aiResult.choices[0].message.content;

              // Remove markdown code blocks if present
              if (content.includes("```json")) {
                content = content
                  .replace(/```json\s*/g, "")
                  .replace(/```\s*$/g, "");
              } else if (content.includes("```")) {
                content = content.replace(/```\s*/g, "");
              }

              analysis = JSON.parse(content.trim());
            } catch (parseError) {
              console.error(
                "Failed to parse AI response:",
                aiResult.choices[0].message.content
              );
              continue;
            }

            if (
              analysis.type === "blog_post" &&
              analysis.title &&
              analysis.content
            ) {
              // Found an individual blog post
              blogPosts.push({
                title: analysis.title.trim(),
                content: analysis.content.trim(),
                url: currentUrl,
                publishedAt: new Date(),
              });
              console.log(`Found blog post: ${analysis.title}`);
            } else if (
              analysis.type === "blog_listing" &&
              analysis.posts &&
              Array.isArray(analysis.posts)
            ) {
              // Found a blog listing page with multiple posts
              console.log(
                `Found blog listing with ${analysis.posts.length} posts`
              );

              for (const post of analysis.posts) {
                if (post.url && post.title) {
                  // Make URL absolute if needed
                  let fullUrl = post.url;
                  if (!fullUrl.startsWith("http")) {
                    if (fullUrl.startsWith("/")) {
                      fullUrl = new URL(fullUrl, currentUrl).href;
                    } else {
                      fullUrl = new URL(fullUrl, currentUrl).href;
                    }
                  }

                  // Add to processing queue if not visited and on same domain
                  if (
                    !visitedUrls.has(fullUrl) &&
                    fullUrl.includes(new URL(mainUrl).hostname)
                  ) {
                    urlsToProcess.push(fullUrl);
                  }
                }
              }
            }
          }
        } catch (aiError) {
          console.error("AI analysis error:", aiError);
          // Fallback: if AI fails, skip this URL
        }

        // Small delay to be respectful to the server
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Insert blog posts into database
      let insertedCount = 0;
      for (const post of blogPosts) {
        try {
          // Check if post already exists
          const existingPosts = (await query(
            `SELECT id FROM CustomBlogs WHERE websiteId = ? AND url = ?`,
            [websiteId, post.url]
          )) as { id: number }[];

          if (existingPosts.length === 0) {
            await query(
              `INSERT INTO CustomBlogs (websiteId, title, content, url, publishedAt) VALUES (?, ?, ?, ?, ?)`,
              [websiteId, post.title, post.content, post.url, post.publishedAt]
            );
            insertedCount++;
          }
        } catch (insertError) {
          console.error("Error inserting blog post:", insertError);
          // Continue with next post
        }
      }

      console.log("done: Synced custom blog content", {
        websiteId,
        mainUrl,
        insertedCount,
      });

      return cors(
        request,
        NextResponse.json({
          success: true,
          count: insertedCount,
          message: `Successfully synced ${insertedCount} blog posts`,
        })
      );
    } catch (scrapeError: any) {
      console.error("Error scraping blog content:", scrapeError);
      return cors(
        request,
        NextResponse.json(
          {
            error: "Failed to scrape blog content",
            details: scrapeError.message,
          },
          { status: 500 }
        )
      );
    }
  } catch (error: any) {
    console.error("Sync blog content error:", error);
    return cors(
      request,
      NextResponse.json(
        { error: "Failed to sync blog content", details: error.message },
        { status: 500 }
      )
    );
  }
}
