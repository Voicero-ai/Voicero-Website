import { NextRequest, NextResponse } from "next/server";
import { cors } from "@/lib/cors";
import { query } from "@/lib/db";
import { verifyToken, getWebsiteIdFromToken } from "@/lib/token-verifier";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
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

    // Check if this is a Shopify website
    const websites = (await query(`SELECT type FROM Website WHERE id = ?`, [
      websiteId,
    ])) as { type: string }[];

    if (!websites.length) {
      return cors(
        request,
        NextResponse.json({ error: "Website not found" }, { status: 404 })
      );
    }

    if (websites[0].type !== "Shopify") {
      return cors(
        request,
        NextResponse.json(
          { error: "This website is not a Shopify store" },
          { status: 400 }
        )
      );
    }

    // Verify the post exists
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

    // Update the hot status
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
