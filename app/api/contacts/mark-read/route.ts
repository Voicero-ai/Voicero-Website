import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

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
    const contact = await prisma.contact.findUnique({
      where: {
        id: contactId,
        userId,
      },
    });

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Mark contact as read
    const updatedContact = await prisma.contact.update({
      where: {
        id: contactId,
      },
      data: {
        read: true,
      },
    });

    return NextResponse.json(updatedContact);
  } catch (error) {
    console.error("Error marking contact as read:", error);
    return NextResponse.json(
      { error: "Failed to mark contact as read" },
      { status: 500 }
    );
  }
}
