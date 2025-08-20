import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../../../lib/auth';
import { query } from '../../../../lib/db';
export const dynamic = "force-dynamic";

interface Contact {
  id: string;
  email: string;
  message: string;
  threadId: string;
  userId: string;
  websiteId: string;
  read: boolean;
  replied: boolean;
  reminded: boolean;
  createdAt: Date;
}

interface User {
  name: string;
  email: string;
}

interface ContactWithUser extends Contact {
  user: User;
}

interface AiMessage {
  id: string;
  threadId: string;
  role: string;
  content: string;
  createdAt: Date;
}

export async function GET(request: Request) {
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

    // Get contact with user information
    const contacts = (await query(
      `SELECT c.*, u.name as userName, u.email as userEmail 
       FROM Contact c
       JOIN User u ON c.userId = u.id
       WHERE c.id = ? AND c.userId = ?`,
      [contactId, userId]
    )) as (Contact & { userName: string; userEmail: string })[];

    if (contacts.length === 0) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const contact = contacts[0];

    // Format the contact with user data
    const contactWithUser: ContactWithUser = {
      ...contact,
      user: {
        name: contact.userName,
        email: contact.userEmail,
      },
    };

    // Delete the extra properties that were added for joining
    delete (contactWithUser as any).userName;
    delete (contactWithUser as any).userEmail;

    // Get thread messages
    const threadMessages = (await query(
      `SELECT id, threadId, role, content, createdAt
       FROM AiMessage
       WHERE threadId = ?
       ORDER BY createdAt ASC`,
      [contact.threadId]
    )) as AiMessage[];

    return NextResponse.json({
      ...contactWithUser,
      threadMessages,
    });
  } catch (error) {
    console.error("Error fetching contact details:", error);
    return NextResponse.json(
      { error: "Failed to fetch contact details" },
      { status: 500 }
    );
  }
}
