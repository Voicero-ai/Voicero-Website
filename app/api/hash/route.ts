import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { string, saltRounds = 12 } = await request.json();

    // Validate input
    if (!string || typeof string !== "string") {
      return NextResponse.json(
        { error: "String parameter is required and must be a string" },
        { status: 400 }
      );
    }

    if (typeof saltRounds !== "number" || saltRounds < 10 || saltRounds > 20) {
      return NextResponse.json(
        { error: "Salt rounds must be a number between 10 and 20" },
        { status: 400 }
      );
    }

    // Hash the string
    const hashedString = await bcrypt.hash(string, saltRounds);

    return NextResponse.json({
      original: string,
      hashed: hashedString,
      saltRounds: saltRounds,
    });
  } catch (error) {
    console.error("Hash API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: "POST method required" }, { status: 405 });
}
