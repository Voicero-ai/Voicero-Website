import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { query } from '../../../../lib/db';

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { questionId } = await req.json();

    // Verify user owns the website this question belongs to
    const rows = (await query(
      `SELECT pq.id
       FROM PopUpQuestion pq
       JOIN Website w ON w.id = pq.websiteId
       WHERE pq.id = ? AND w.userId = ?
       LIMIT 1`,
      [questionId, session.user.id]
    )) as { id: string }[];
    const existingQuestion = rows.length > 0 ? rows[0] : null;

    if (!existingQuestion) {
      return NextResponse.json(
        { error: "Question not found" },
        { status: 404 }
      );
    }

    // Delete question
    await query(`DELETE FROM PopUpQuestion WHERE id = ?`, [questionId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting question:", error);
    return NextResponse.json(
      { error: "Failed to delete question" },
      { status: 500 }
    );
  }
}
