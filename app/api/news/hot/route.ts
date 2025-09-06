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
    const { websiteId, postId, hot } = body;

    console.log("Hot API received:", {
      websiteId,
      postId,
      hot,
      hotType: typeof hot,
      body,
    });

    if (!websiteId || !postId) {
      return cors(
        request,
        NextResponse.json(
          { error: "Website ID and Post ID are required" },
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

    // Get website type
    const websites = (await query(`SELECT type FROM Website WHERE id = ?`, [
      websiteId,
    ])) as { type: string }[];

    if (!websites.length) {
      return cors(
        request,
        NextResponse.json({ error: "Website not found" }, { status: 404 })
      );
    }

    const websiteType = websites[0].type;

    if (websiteType === "Shopify") {
      // Verify the Shopify post exists
      const posts = (await query(
        `SELECT id, hot FROM ShopifyBlogPost WHERE id = ? AND websiteId = ?`,
        [postId, websiteId]
      )) as { id: string; hot: number }[];

      if (!posts.length) {
        return cors(
          request,
          NextResponse.json({ error: "Blog post not found" }, { status: 404 })
        );
      }

      // Check if we're trying to set a post as hot
      if (hot === true || hot === 1) {
        // Count current hot posts
        const hotPostsCount = (await query(
          `SELECT COUNT(*) as count FROM ShopifyBlogPost WHERE websiteId = ? AND hot = 1`,
          [websiteId]
        )) as { count: number }[];

        // If we already have 2 hot posts and this post isn't already hot, return error
        if (hotPostsCount[0].count >= 2 && posts[0].hot !== 1) {
          return cors(
            request,
            NextResponse.json(
              {
                error:
                  "Maximum of 2 hot posts allowed. Please un-hot another post first.",
              },
              { status: 400 }
            )
          );
        }
      }

      // Update the hot status for Shopify
      await query(`UPDATE ShopifyBlogPost SET hot = ? WHERE id = ?`, [
        hot ? 1 : 0,
        postId,
      ]);

      // Get updated post data
      const updatedPosts = (await query(
        `SELECT * FROM ShopifyBlogPost WHERE id = ?`,
        [postId]
      )) as any[];

      return cors(
        request,
        NextResponse.json({
          success: true,
          post: updatedPosts[0],
        })
      );
    } else if (websiteType === "WordPress") {
      // Handle WordPress posts
      console.log("doing: Setting hot status for WordPress post", {
        postId,
        hot,
      });

      // First check if the WordPress post table has a hot column, if not we need to add it
      // For now, let's check if the post exists
      const posts = (await query(
        `SELECT id FROM WordpressPost WHERE id = ? AND websiteId = ?`,
        [postId, websiteId]
      )) as { id: number }[];

      if (!posts.length) {
        return cors(
          request,
          NextResponse.json({ error: "Blog post not found" }, { status: 404 })
        );
      }

      // WordPress posts might not have a hot column yet, so let's handle this gracefully
      try {
        // First try to check if hot column exists by querying for it
        const hotCheck = (await query(
          `SELECT id, hot FROM WordpressPost WHERE id = ? AND websiteId = ? LIMIT 1`,
          [postId, websiteId]
        )) as { id: number; hot?: number }[];

        if (hotCheck.length > 0) {
          // Hot column exists, proceed with hot logic
          if (hot === true || hot === 1) {
            // Count current hot posts for WordPress
            const hotPostsCount = (await query(
              `SELECT COUNT(*) as count FROM WordpressPost WHERE websiteId = ? AND hot = 1`,
              [websiteId]
            )) as { count: number }[];

            // If we already have 2 hot posts and this post isn't already hot, return error
            if (hotPostsCount[0].count >= 2 && hotCheck[0].hot !== 1) {
              return cors(
                request,
                NextResponse.json(
                  {
                    error:
                      "Maximum of 2 hot posts allowed. Please un-hot another post first.",
                  },
                  { status: 400 }
                )
              );
            }
          }

          // Update the hot status for WordPress
          await query(`UPDATE WordpressPost SET hot = ? WHERE id = ?`, [
            hot ? 1 : 0,
            postId,
          ]);

          // Get updated post data
          const updatedPosts = (await query(
            `SELECT * FROM WordpressPost WHERE id = ?`,
            [postId]
          )) as any[];

          console.log("done: WordPress post hot status updated", {
            postId,
            hot,
          });

          return cors(
            request,
            NextResponse.json({
              success: true,
              post: updatedPosts[0],
            })
          );
        }
      } catch (error: any) {
        // Hot column probably doesn't exist for WordPress posts
        if (error.code === "ER_BAD_FIELD_ERROR") {
          return cors(
            request,
            NextResponse.json(
              {
                error:
                  "Hot functionality not yet available for WordPress posts. Database schema needs to be updated.",
                details:
                  "The 'hot' column needs to be added to the WordpressPost table.",
              },
              { status: 501 }
            )
          );
        } else {
          throw error; // Re-throw if it's a different error
        }
      }
    } else {
      // Handle Custom blog posts
      console.log("doing: Setting hot status for Custom post", {
        postId,
        hot,
      });

      try {
        // Check if the Custom post exists
        const posts = (await query(
          `SELECT id, hot FROM CustomBlogs WHERE id = ? AND websiteId = ?`,
          [postId, websiteId]
        )) as { id: number; hot?: number }[];

        if (!posts.length) {
          return cors(
            request,
            NextResponse.json({ error: "Blog post not found" }, { status: 404 })
          );
        }

        // Check if we're trying to set a post as hot
        if (hot === true || hot === 1) {
          // Count current hot posts for Custom
          const hotPostsCount = (await query(
            `SELECT COUNT(*) as count FROM CustomBlogs WHERE websiteId = ? AND hot = 1`,
            [websiteId]
          )) as { count: number }[];

          // If we already have 2 hot posts and this post isn't already hot, return error
          if (hotPostsCount[0].count >= 2 && posts[0].hot !== 1) {
            return cors(
              request,
              NextResponse.json(
                {
                  error:
                    "Maximum of 2 hot posts allowed. Please un-hot another post first.",
                },
                { status: 400 }
              )
            );
          }
        }

        // Update the hot status for Custom
        await query(`UPDATE CustomBlogs SET hot = ? WHERE id = ?`, [
          hot ? 1 : 0,
          postId,
        ]);

        // Get updated post data
        const updatedPosts = (await query(
          `SELECT * FROM CustomBlogs WHERE id = ?`,
          [postId]
        )) as any[];

        console.log("done: Custom post hot status updated", {
          postId,
          hot,
        });

        return cors(
          request,
          NextResponse.json({
            success: true,
            post: updatedPosts[0],
          })
        );
      } catch (error: any) {
        // CustomBlogs table might not exist yet
        return cors(
          request,
          NextResponse.json(
            {
              error:
                "Hot functionality not yet available for Custom posts. Database schema needs to be updated.",
              details:
                "The CustomBlogs table needs to be created or the 'hot' column needs to be added.",
            },
            { status: 501 }
          )
        );
      }
    }
  } catch (error: any) {
    console.error("Hot toggle error:", error);
    return cors(
      request,
      NextResponse.json(
        { error: "Failed to update hot status", details: error.message },
        { status: 500 }
      )
    );
  }
}
