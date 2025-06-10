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

    const { questionId, question } = await req.json();

    // Verify user owns the website this question belongs to
    const existingQuestion = await prisma.popUpQuestion.findFirst({
      where: {
        id: questionId,
        Website: {
          userId: session.user.id,
        },
      },
      include: {
        Website: true,
      },
    });

    if (!existingQuestion) {
      return NextResponse.json(
        { error: "Question not found" },
        { status: 404 }
      );
    }

    // Update question
    const updatedQuestion = await prisma.popUpQuestion.update({
      where: { id: questionId },
      data: { question },
    });

    return NextResponse.json(updatedQuestion);
  } catch (error) {
    console.error("Error updating question:", error);
    return NextResponse.json(
      { error: "Failed to update question" },
      { status: 500 }
    );
  }
}
