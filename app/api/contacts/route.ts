// app/api/contacts/route.ts  (Next.js 13+/App Router)
// or pages/api/contacts.ts   (Pages Router) — imports & handlers are identical
import { NextRequest, NextResponse } from "next/server";
import { cors } from "@/lib/cors";
import { query } from "@/lib/db";

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
  accessToken: string
) {
  /* ---------- verify token maps to website ---------- */
  const accessKeys = (await query(
    `SELECT ak.id, ak.\`key\`, ak.websiteId, w.id as website_id, w.userId 
     FROM AccessKey ak
     JOIN Website w ON ak.websiteId = w.id
     WHERE ak.\`key\` = ?`,
    [accessToken]
  )) as any[];

  if (!accessKeys.length) {
    return cors(
      request,
      NextResponse.json({ error: "Invalid access token" }, { status: 401 })
    );
  }

  const accessKey = {
    ...accessKeys[0],
    website: {
      id: accessKeys[0].website_id,
      userId: accessKeys[0].userId,
    },
  };

  // Use the provided websiteId or the one from the access key
  const finalWebsiteId = websiteId || accessKey.website.id;

  // Verify the website matches the one from the access key if websiteId was provided
  if (websiteId && accessKey.website.id !== websiteId) {
    return cors(
      request,
      NextResponse.json(
        { error: "Unauthorized to access this website's contacts" },
        { status: 403 }
      )
    );
  }

  /* ---------- fetch contacts ---------- */
  // Get contacts filtered by websiteId if provided
  const whereClause = finalWebsiteId
    ? "WHERE c.websiteId = ?"
    : "WHERE c.userId = ?";

  const params = finalWebsiteId ? [finalWebsiteId] : [accessKey.website.userId];

  const contacts = (await query(
    `SELECT c.*, u.name as user_name, u.email as user_email
     FROM Contact c
     JOIN User u ON c.userId = u.id
     ${whereClause}
     ORDER BY c.createdAt DESC`,
    params
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
    /* --- auth header --- */
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return cors(
        request,
        NextResponse.json(
          { error: "Invalid authorization token" },
          { status: 401 }
        )
      );
    }
    const accessToken = authHeader.split(" ")[1];

    /* --- websiteId via query param --- */
    const websiteId = request.nextUrl.searchParams.get("websiteId") ?? "";

    return await handleContacts(request, websiteId, accessToken);
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
    /* --- auth header --- */
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return cors(
        request,
        NextResponse.json(
          { error: "Invalid authorization token" },
          { status: 401 }
        )
      );
    }
    const accessToken = authHeader.split(" ")[1];

    /* --- websiteId from JSON body --- */
    const { websiteId } = await request.json();

    return await handleContacts(request, websiteId, accessToken);
  } catch (err) {
    console.error("POST /api/contacts error:", err);
    return cors(
      request,
      NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 })
    );
  }
}
