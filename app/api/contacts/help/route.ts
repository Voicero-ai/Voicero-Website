import { NextResponse, NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { cors } from "@/lib/cors";
export const dynamic = "force-dynamic";

/* -------------------------------------------------- */
/*  CORS pre-flight                                   */
/* -------------------------------------------------- */
export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, message, threadId, websiteId } = body;

    if (!email || !message) {
      return cors(
        request,
        new NextResponse("Email and message are required", {
          status: 400,
        })
      );
    }

    if (!websiteId) {
      return cors(
        request,
        new NextResponse("Website ID is required", {
          status: 400,
        })
      );
    }

    // Find the website to get the associated userId
    const website = await prisma.website.findUnique({
      where: { id: websiteId },
      select: { userId: true },
    });

    if (!website) {
      return cors(
        request,
        new NextResponse("Website not found", { status: 404 })
      );
    }

    const contact = await prisma.contact.create({
      data: {
        email,
        message: message,
        threadId: threadId || "",
        userId: website.userId,
        websiteId: websiteId,
      },
    });

    return cors(request, NextResponse.json(contact));
  } catch (error) {
    console.error("[CONTACT_HELP_POST]", error);
    return cors(request, new NextResponse("Internal Error", { status: 500 }));
  }
}
