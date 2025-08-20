import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { cors } from "@/lib/cors";
import { query } from "@/lib/db";
import { verifyToken, getWebsiteIdFromToken } from "@/lib/token-verifier";

export const dynamic = "force-dynamic";

// Define types
interface Website {
  userId: string;
}

interface User {
  id: string;
  name: string;
  username: string;
  profilePicture: string | null;
  email: string;
}

// Define a type for query results
type QueryResult = any[] | { [key: string]: any };

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    let userId: string | null = null;

    // First check for authenticated session
    if (session?.user?.id) {
      userId = session.user.id;
    } else {
      // If no session, check for access key in Authorization header
      const authHeader = request.headers.get("Authorization");
      const { searchParams } = new URL(request.url);
      const websiteId = searchParams.get("websiteId");

      if (authHeader && authHeader.startsWith("Bearer ") && websiteId) {
        // Verify the Bearer token
        const isTokenValid = await verifyToken(authHeader);
        
        if (isTokenValid) {
          // Get the website ID from the verified token
          const websiteIdFromToken = await getWebsiteIdFromToken(authHeader);
          
          // Verify the requested websiteId matches the one from the token
          if (websiteIdFromToken === websiteId) {
            // Look up the website to get associated userId
            const websites = (await query(
              `SELECT w.userId 
               FROM Website w
               WHERE w.id = ?`,
              [websiteId]
            )) as Website[];

            if (websites.length > 0) {
              userId = websites[0].userId;
            }
          }
        }
      }
    }

    // If no userId found through any auth method, return unauthorized
    if (!userId) {
      return cors(
        request,
        NextResponse.json(
          {
            error:
              "Unauthorized. Please log in or provide a valid access key with websiteId.",
          },
          { status: 401 }
        )
      );
    }

    const users = (await query(
      `SELECT id, name, username, profilePicture, email 
       FROM User 
       WHERE id = ?`,
      [userId]
    )) as User[];

    if (users.length === 0) {
      return cors(
        request,
        NextResponse.json({ error: "User not found" }, { status: 404 })
      );
    }

    const user = users[0];

    return cors(request, NextResponse.json(user));
  } catch (error) {
    console.error("Error fetching user:", error);
    return cors(
      request,
      NextResponse.json({ error: "Internal server error" }, { status: 500 })
    );
  }
}
