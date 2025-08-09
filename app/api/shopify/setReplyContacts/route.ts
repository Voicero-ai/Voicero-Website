import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { cors } from "../../../../lib/cors";
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
    // Get the authorization header
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return cors(
        request,
        NextResponse.json(
          { error: "Missing or invalid authorization header" },
          { status: 401 }
        )
      );
    }

    // Extract the access key
    const accessKey = authHeader.split(" ")[1];

    if (!accessKey) {
      return cors(
        request,
        NextResponse.json({ error: "No access key provided" }, { status: 401 })
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

    // First find the website ID using the access key
    const accessKeyRecords = (await query(
      "SELECT websiteId FROM AccessKey WHERE `key` = ?",
      [accessKey]
    )) as AccessKey[];

    if (accessKeyRecords.length === 0) {
      return cors(
        request,
        NextResponse.json({ error: "Invalid access key" }, { status: 401 })
      );
    }

    const accessKeyRecord = accessKeyRecords[0];

    // Find the contact to ensure it exists and belongs to the website owner
    const contacts = (await query(
      `SELECT c.id 
       FROM Contact c
       JOIN User u ON c.userId = u.id
       JOIN Website w ON w.userId = u.id
       WHERE c.id = ? AND w.id = ?`,
      [id, accessKeyRecord.websiteId]
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
