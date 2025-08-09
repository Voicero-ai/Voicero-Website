import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Define types
interface Contact {
  id: string;
  email: string;
  message: string;
  read: boolean;
  replied: boolean;
  threadId: string;
  createdAt: Date;
  userId: string;
  websiteId: string;
  reminded: boolean;
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const url = new URL(request.url);
    const contactId = url.searchParams.get("id");

    if (!contactId) {
      return NextResponse.json(
        { error: "Contact ID is required" },
        { status: 400 }
      );
    }

    // Check if contact belongs to the user
    const contacts = (await query(
      "SELECT * FROM Contact WHERE id = ? AND userId = ?",
      [contactId, userId]
    )) as Contact[];

    if (contacts.length === 0) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Mark contact as replied and read
    await query("UPDATE Contact SET replied = ?, `read` = ? WHERE id = ?", [
      true,
      true,
      contactId,
    ]);

    // Get the updated contact
    const updatedContacts = (await query("SELECT * FROM Contact WHERE id = ?", [
      contactId,
    ])) as Contact[];

    return NextResponse.json(updatedContacts[0]);
  } catch (error) {
    console.error("Error marking contact as replied:", error);
    return NextResponse.json(
      { error: "Failed to mark contact as replied" },
      { status: 500 }
    );
  }
}
