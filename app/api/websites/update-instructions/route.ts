import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

// Helper function to count words
function countWords(str: string): number {
  return str.trim().split(/\s+/).length;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { websiteId, instructions } = await req.json();

    // Check word count
    if (instructions && countWords(instructions) > 300) {
      return NextResponse.json(
        { error: "Instructions cannot exceed 300 words" },
        { status: 400 }
      );
    }

    // Verify user owns this website
    const website = await prisma.website.findFirst({
      where: {
        id: websiteId,
        userId: session.user.id,
      },
    });

    if (!website) {
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
    }

    // Update instructions
    const updatedWebsite = await prisma.website.update({
      where: { id: websiteId },
      data: { customInstructions: instructions },
    });

    return NextResponse.json(updatedWebsite);
  } catch (error) {
    console.error("Error updating instructions:", error);
    return NextResponse.json(
      { error: "Failed to update instructions" },
      { status: 500 }
    );
  }
}
