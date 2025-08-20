import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { cors } from "@/lib/cors";
import { query } from "@/lib/db";
import { verifyToken, getWebsiteIdFromToken } from "@/lib/token-verifier";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

// GET: Return interface settings: color, botName, customWelcomeMessage,
// bottom nav toggles (showHome/showNews/showHelp) and up to 3 pop-up questions
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let websiteId = searchParams.get("websiteId") || searchParams.get("id");

    // Try session-based auth first
    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      if (!websiteId) {
        return cors(
          request,
          NextResponse.json(
            { error: "Website ID is required" },
            { status: 400 }
          )
        );
      }
      const ownership = (await query(
        `SELECT id FROM Website WHERE id = ? AND userId = ? LIMIT 1`,
        [websiteId, session.user.id]
      )) as { id: string }[];
      if (ownership.length === 0) {
        return cors(
          request,
          NextResponse.json(
            { error: "Unauthorized. You don't have access to this website." },
            { status: 403 }
          )
        );
      }
    } else {
      // Fallback to Bearer token auth
      const authHeader = request.headers.get("Authorization");
      const isTokenValid = await verifyToken(authHeader);
      if (!isTokenValid) {
        return cors(
          request,
          NextResponse.json(
            {
              error:
                "Unauthorized. Please log in or provide a valid access key.",
            },
            { status: 401 }
          )
        );
      }
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
      if (!websiteId) websiteId = websiteIdFromToken;
      if (websiteId && websiteId !== websiteIdFromToken) {
        return cors(
          request,
          NextResponse.json(
            { error: "Unauthorized to access this website" },
            { status: 403 }
          )
        );
      }
    }

    if (!websiteId) {
      return cors(
        request,
        NextResponse.json({ error: "Website ID is required" }, { status: 400 })
      );
    }

    const rows = (await query(
      `SELECT id, color, botName, customWelcomeMessage, active,
              showHome, showNews, showHelp,
              showVoiceAI, showTextAI,
              customInstructions,
              allowAutoCancel, allowAutoReturn, allowAutoExchange,
              allowAutoClick, allowAutoScroll, allowAutoHighlight, allowAutoRedirect,
              allowAutoGetUserOrders, allowAutoUpdateUserInfo, allowAutoFillForm,
              allowAutoTrackOrder, allowAutoLogout, allowAutoLogin, allowAutoGenerateImage
       FROM Website WHERE id = ? LIMIT 1`,
      [websiteId]
    )) as any[];
    const site = rows[0];
    if (!site) {
      return cors(
        request,
        NextResponse.json({ error: "Website not found" }, { status: 404 })
      );
    }

    const popUps = (await query(
      `SELECT id, question, createdAt FROM PopUpQuestion WHERE websiteId = ? ORDER BY createdAt DESC LIMIT 3`,
      [websiteId]
    )) as { id: string; question: string; createdAt: Date }[];

    return cors(
      request,
      NextResponse.json({
        success: true,
        website: {
          id: site.id,
          color: site.color,
          botName: site.botName,
          customWelcomeMessage: site.customWelcomeMessage,
          showHome: Boolean(site.showHome),
          showNews: Boolean(site.showNews),
          showHelp: Boolean(site.showHelp),
          active: Boolean(site.active),
          showVoiceAI: Boolean(site.showVoiceAI),
          showTextAI: Boolean(site.showTextAI),
          customInstructions: site.customInstructions ?? null,
          allowAutoCancel: Boolean(site.allowAutoCancel),
          allowAutoReturn: Boolean(site.allowAutoReturn),
          allowAutoExchange: Boolean(site.allowAutoExchange),
          allowAutoClick: Boolean(site.allowAutoClick),
          allowAutoScroll: Boolean(site.allowAutoScroll),
          allowAutoHighlight: Boolean(site.allowAutoHighlight),
          allowAutoRedirect: Boolean(site.allowAutoRedirect),
          allowAutoGetUserOrders: Boolean(site.allowAutoGetUserOrders),
          allowAutoUpdateUserInfo: Boolean(site.allowAutoUpdateUserInfo),
          allowAutoFillForm: Boolean(site.allowAutoFillForm),
          allowAutoTrackOrder: Boolean(site.allowAutoTrackOrder),
          allowAutoLogout: Boolean(site.allowAutoLogout),
          allowAutoLogin: Boolean(site.allowAutoLogin),
          allowAutoGenerateImage: Boolean(site.allowAutoGenerateImage),
          popUpQuestions: popUps.map((p) => ({
            id: p.id,
            question: p.question,
            createdAt: p.createdAt,
          })),
        },
      })
    );
  } catch (err) {
    console.error("GET /api/updateInterface/get error:", err);
    return cors(
      request,
      NextResponse.json(
        { error: "Failed to load interface settings" },
        { status: 500 }
      )
    );
  }
}
