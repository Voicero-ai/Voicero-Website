import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { query } from "../../../../lib/db";

export const dynamic = "force-dynamic";

interface PopUpQuestion {
  id: string;
  question: string;
  websiteId: string;
}

interface Website {
  id: string;
  userId: string;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { questionId, question } = await req.json();

    // Verify user owns the website this question belongs to
    const questions = (await query(
      `SELECT q.*, w.userId 
       FROM PopUpQuestion q 
       JOIN Website w ON q.websiteId = w.id 
       WHERE q.id = ? AND w.userId = ?`,
      [questionId, session.user.id]
    )) as (PopUpQuestion & { userId: string })[];

    if (questions.length === 0) {
      return NextResponse.json(
        { error: "Question not found" },
        { status: 404 }
      );
    }

    // Update question
    await query("UPDATE PopUpQuestion SET question = ? WHERE id = ?", [
      question,
      questionId,
    ]);

    // Get updated question
    const updatedQuestions = (await query(
      "SELECT * FROM PopUpQuestion WHERE id = ?",
      [questionId]
    )) as PopUpQuestion[];

    return NextResponse.json(updatedQuestions[0]);
  } catch (error) {
    console.error("Error updating question:", error);
    return NextResponse.json(
      { error: "Failed to update question" },
      { status: 500 }
    );
  }
}
