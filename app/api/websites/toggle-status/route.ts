import { NextRequest, NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";
import { cors } from "../../../../lib/cors";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    // Handle CORS
    const response = new NextResponse();
    const corsResponse = await cors(request, response);
    if (corsResponse.status === 204) {
      return corsResponse;
    }

    const { websiteId, accessKey } = await request.json();

    if (!websiteId && !accessKey) {
      return NextResponse.json(
        { error: "Missing websiteId or accessKey" },
        { status: 400 }
      );
    }

    let website;

    if (websiteId) {
      website = await prisma.website.findUnique({
        where: { id: websiteId },
      });
    } else if (accessKey) {
      website = await prisma.website.findFirst({
        where: { accessKeys: { some: { key: accessKey } } },
      });
    }

    if (!website) {
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
    }

    const updatedWebsite = await prisma.website.update({
      where: { id: website.id },
      data: { active: !website.active },
    });

    return NextResponse.json({
      status: updatedWebsite.active ? "active" : "inactive",
    });
  } catch (error) {
    console.error("Error toggling website status:", error);
    return NextResponse.json(
      { error: "Failed to toggle website status" },
      { status: 500 }
    );
  }
}
