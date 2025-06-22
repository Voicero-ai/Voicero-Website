import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cors } from "../../../../lib/cors";

export const dynamic = "force-dynamic";
const prisma = new PrismaClient();

// ---- Pre-flight -------------------------------------------------
export async function OPTIONS(req: NextRequest) {
  return cors(req, new NextResponse(null, { status: 204 }));
}

// ---- POST  ------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const { sessionId, url } = await req.json();
    console.log(`URL movement tracking request:`, { sessionId, url });

    if (!sessionId || !url) {
      return cors(
        req,
        NextResponse.json(
          { error: "Session ID and URL are required" },
          { status: 400 }
        )
      );
    }

    // Create the URL movement record
    try {
      const urlMovement = await prisma.urlMovement.create({
        data: {
          url,
          sessionId,
        },
      });
      console.log(
        `Created URL movement record: ${urlMovement.id} for URL: ${url}`
      );

      return cors(
        req,
        NextResponse.json({ success: true, urlMovementId: urlMovement.id })
      );
    } catch (error) {
      console.error("Failed to create URL movement record:", error);
      return cors(
        req,
        NextResponse.json(
          { error: "Failed to create URL movement record" },
          { status: 500 }
        )
      );
    }
  } catch (error) {
    console.error("URL movement tracking error:", error);
    return cors(
      req,
      NextResponse.json({ error: "Internal server error" }, { status: 500 })
    );
  }
}
