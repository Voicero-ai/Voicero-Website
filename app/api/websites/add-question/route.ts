import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { websiteId, question } = await req.json();

    // Verify user owns this website
    const website = await prisma.website.findFirst({
      where: {
        id: websiteId,
        userId: session.user.id,
      },
      include: {
        popUpQuestions: true,
      },
    });

    if (!website) {
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
    }

    // Check if website already has 5 questions
    if (website.popUpQuestions.length >= 5) {
      return NextResponse.json(
        { error: "Maximum number of questions reached" },
        { status: 400 }
      );
    }

    // Create new question
    const newQuestion = await prisma.popUpQuestion.create({
      data: {
        question,
        websiteId,
      },
    });

    return NextResponse.json(newQuestion);
  } catch (error) {
    console.error("Error adding question:", error);
    return NextResponse.json(
      { error: "Failed to add question" },
      { status: 500 }
    );
  }
}
