// app/api/contacts/route.ts  (Next.js 13+/App Router)
// or pages/api/contacts.ts   (Pages Router) — imports & handlers are identical
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { cors } from "@/lib/cors";

export const dynamic = "force-dynamic";

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
  const accessKey = await prisma.accessKey.findFirst({
    where: { key: accessToken },
    include: { website: { select: { userId: true, id: true } } },
  });

  if (!accessKey) {
    return cors(
      request,
      NextResponse.json({ error: "Invalid access token" }, { status: 401 })
    );
  }

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
  const contacts = await prisma.contact.findMany({
    where: {
      ...(finalWebsiteId
        ? { websiteId: finalWebsiteId }
        : { userId: accessKey.website.userId }),
    },
    // All Contact fields including read and replied will be returned by default
    // The include ensures we also get the related user data
    include: {
      user: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return cors(request, NextResponse.json({ success: true, contacts }));
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
