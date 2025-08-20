// app/api/contacts/route.ts  (Next.js 13+/App Router)
// or pages/api/contacts.ts   (Pages Router) — imports & handlers are identical
import { NextRequest, NextResponse } from "next/server";
import { cors } from '../../../lib/cors';
import { query } from '../../../lib/db';
import { verifyToken, getWebsiteIdFromToken } from '../../../lib/token-verifier';

export const dynamic = "force-dynamic";

// Define types for our data structures
interface AccessKey {
  id: string;
  key: string;
  websiteId: string;
  website: {
    id: string;
    userId: string;
  };
}

interface Contact {
  id: string;
  email: string;
  message: string;
  read: boolean;
  replied: boolean;
  threadId: string;
  createdAt: string;
  userId: string;
  websiteId: string;
  reminded: boolean;
  user: {
    name: string;
    email: string;
  };
}

/* -------------------------------------------------- */
/*  CORS pre-flight                                   */
/* -------------------------------------------------- */
export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

/* -------------------------------------------------- */
/*  Shared work — keeps GET & POST code DRY           */
/* -------------------------------------------------- */
async function handleContacts(
  request: NextRequest,
  websiteId: string,
  websiteIdFromToken: string
) {
  // Use the websiteId from token if no specific websiteId is provided
  const finalWebsiteId = websiteId || websiteIdFromToken;

  if (!finalWebsiteId) {
    return cors(
      request,
      NextResponse.json({ error: "Website ID is required" }, { status: 400 })
    );
  }

  const contacts = (await query(
    `SELECT c.*, u.name as user_name, u.email as user_email
     FROM Contact c
     JOIN User u ON c.userId = u.id
     WHERE c.websiteId = ?
     ORDER BY c.createdAt DESC`,
    [finalWebsiteId]
  )) as any[];

  // Format contacts to match the expected structure
  const formattedContacts = contacts.map((contact) => ({
    id: contact.id,
    email: contact.email,
    message: contact.message,
    read: Boolean(contact.read),
    replied: Boolean(contact.replied),
    threadId: contact.threadId,
    createdAt: contact.createdAt,
    userId: contact.userId,
    websiteId: contact.websiteId,
    reminded: Boolean(contact.reminded),
    user: {
      name: contact.user_name,
      email: contact.user_email,
    },
  }));

  return cors(
    request,
    NextResponse.json({ success: true, contacts: formattedContacts })
  );
}

/* -------------------------------------------------- */
/*  GET /api/contacts?websiteId=...                   */
/* -------------------------------------------------- */
export async function GET(request: NextRequest) {
  try {
    // Verify the Bearer token
    const authHeader = request.headers.get("Authorization");
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
    const websiteIdFromToken = await getWebsiteIdFromToken(authHeader);

    if (!websiteIdFromToken) {
      return cors(
        request,
        NextResponse.json(
          { error: "Could not determine website ID from token" },
          { status: 400 }
        )
      );
    }

    /* --- websiteId via query param --- */
    const websiteId = request.nextUrl.searchParams.get("websiteId") ?? "";

    return await handleContacts(request, websiteId, websiteIdFromToken);
  } catch (err) {
    console.error("GET /api/contacts error:", err);
    return cors(
      request,
      NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 })
    );
  }
}

/* -------------------------------------------------- */
/*  POST /api/contacts   { websiteId }                */
/* -------------------------------------------------- */
export async function POST(request: NextRequest) {
  try {
    // Verify the Bearer token
    const authHeader = request.headers.get("Authorization");
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
    const websiteIdFromToken = await getWebsiteIdFromToken(authHeader);

    if (!websiteIdFromToken) {
      return cors(
        request,
        NextResponse.json(
          { error: "Could not determine website ID from token" },
          { status: 400 }
        )
      );
    }

    /* --- websiteId from JSON body --- */
    const { websiteId } = await request.json();

    return await handleContacts(request, websiteId, websiteIdFromToken);
  } catch (err) {
    console.error("POST /api/contacts error:", err);
    return cors(
      request,
      NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 })
    );
  }
}
