import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";
import { authOptions } from "../../../../lib/auth";
import { cors } from "@/lib/cors";

export const dynamic = "force-dynamic";

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
        const accessKey = authHeader.substring(7); // Remove "Bearer " prefix

        // Look up the website by accessKey and get associated userId
        const website = await prisma.website.findFirst({
          where: {
            id: websiteId,
            accessKeys: {
              some: {
                key: accessKey,
              },
            },
          },
          select: { userId: true },
        });

        if (website) {
          userId = website.userId;
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

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        name: true,
        username: true,
        profilePicture: true,
        email: true,
      },
    });

    if (!user) {
      return cors(
        request,
        NextResponse.json({ error: "User not found" }, { status: 404 })
      );
    }

    return cors(request, NextResponse.json(user));
  } catch (error) {
    console.error("Error fetching user:", error);
    return cors(
      request,
      NextResponse.json({ error: "Internal server error" }, { status: 500 })
    );
  }
}
