import { NextRequest, NextResponse } from "next/server";
import { cors } from "@/lib/cors";
import { query } from "@/lib/db";
import { verifyToken, getWebsiteIdFromToken } from "@/lib/token-verifier";

export const dynamic = "force-dynamic";

interface AccessKey {
  websiteId: string;
}

interface Contact {
  id: string;
  replied: boolean;
}

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    // Verify the Bearer token
    const authHeader = request.headers.get("authorization");
    const isTokenValid = await verifyToken(authHeader);

    if (!isTokenValid) {
      return cors(
        request,
        NextResponse.json(
          { error: "Unauthorized - Invalid token" },
          { status: 401 }
        )
      );
    }

    // Get the website ID from the verified token
    const websiteId = await getWebsiteIdFromToken(authHeader);

    if (!websiteId) {
      return cors(
        request,
        NextResponse.json(
          { error: "Could not determine website ID from token" },
          { status: 400 }
        )
      );
    }

    // Get request body
    const body = await request.json();
    const { id } = body;

    // Validate required fields
    if (!id) {
      return cors(
        request,
        NextResponse.json(
          { error: "Missing required field: id" },
          { status: 400 }
        )
      );
    }

    // Find the contact to ensure it exists and belongs to the website owner
    const contacts = (await query(
      `SELECT c.id 
       FROM Contact c
       JOIN User u ON c.userId = u.id
       JOIN Website w ON w.userId = u.id
       WHERE c.id = ? AND w.id = ?`,
      [id, websiteId]
    )) as { id: string }[];

    if (contacts.length === 0) {
      return cors(
        request,
        NextResponse.json({ error: "Contact not found" }, { status: 404 })
      );
    }

    // Update the contact to mark as replied
    await query("UPDATE Contact SET replied = TRUE WHERE id = ?", [id]);

    // Get the updated contact
    const updatedContacts = (await query(
      "SELECT id, replied FROM Contact WHERE id = ?",
      [id]
    )) as Contact[];

    const updatedContact = updatedContacts[0];

    return cors(
      request,
      NextResponse.json({
        success: true,
        message: "Contact marked as replied",
        contact: {
          id: updatedContact.id,
          replied: updatedContact.replied,
        },
      })
    );
  } catch (error) {
    console.error("API Error:", error);
    return cors(
      request,
      NextResponse.json({ error: "Internal server error" }, { status: 500 })
    );
  }
}
