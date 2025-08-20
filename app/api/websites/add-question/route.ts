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

    const { websiteId, question } = await req.json();

    // Verify user owns this website
    const websites = (await query(
      `SELECT w.id
       FROM Website w
       WHERE w.id = ? AND w.userId = ?
       LIMIT 1`,
      [websiteId, session.user.id]
    )) as { id: string }[];
    const website = websites.length > 0 ? websites[0] : null;

    if (!website) {
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
    }

    // Check if website already has 5 questions
    const questionCountRows = (await query(
      `SELECT COUNT(*) as count FROM PopUpQuestion WHERE websiteId = ?`,
      [websiteId]
    )) as { count: number }[];
    const questionCount = questionCountRows[0]?.count ?? 0;
    if (questionCount >= 5) {
      return NextResponse.json(
        { error: "Maximum number of questions reached" },
        { status: 400 }
      );
    }

    // Create new question
    const insertResult = (await query(
      `INSERT INTO PopUpQuestion (id, question, websiteId, createdAt) VALUES (UUID(), ?, ?, NOW())`,
      [question, websiteId]
    )) as any;

    const newQuestions = (await query(
      `SELECT id, question, websiteId, createdAt FROM PopUpQuestion WHERE websiteId = ? ORDER BY createdAt DESC LIMIT 1`,
      [websiteId]
    )) as {
      id: string;
      question: string;
      websiteId: string;
      createdAt: Date;
    }[];
    const newQuestion = newQuestions[0];

    return NextResponse.json(newQuestion);
  } catch (error) {
    console.error("Error adding question:", error);
    return NextResponse.json(
      { error: "Failed to add question" },
      { status: 500 }
    );
  }
}
