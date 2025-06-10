import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { websiteId, color } = await req.json();

    if (!websiteId || !color) {
      return NextResponse.json(
        { error: "Website ID and color are required" },
        { status: 400 }
      );
    }

    // Verify the website belongs to the user
    const website = await prisma.website.findFirst({
      where: {
        id: websiteId,
        userId: session.user.id,
      },
    });

    if (!website) {
      return NextResponse.json(
        { error: "Website not found or unauthorized" },
        { status: 404 }
      );
    }

    // Update the website color
    const updatedWebsite = await prisma.website.update({
      where: {
        id: websiteId,
      },
      data: {
        color,
      },
    });

    return NextResponse.json(updatedWebsite);
  } catch (error) {
    console.error("Error updating website color:", error);
    return NextResponse.json(
      { error: "Failed to update website color" },
      { status: 500 }
    );
  }
}
