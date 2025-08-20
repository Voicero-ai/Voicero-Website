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

// POST: Update interface fields on Website
// Body may include: websiteId, color, botName, customWelcomeMessage, active,
// showHome, showNews, showHelp, showVoiceAI, showTextAI,
// customInstructions and any allowAuto* flags
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let {
      websiteId,
      color,
      botName,
      customWelcomeMessage,
      active,
      showHome,
      showNews,
      showHelp,
      showVoiceAI,
      showTextAI,
      customInstructions,
      allowAutoCancel,
      allowAutoReturn,
      allowAutoExchange,
      allowAutoClick,
      allowAutoScroll,
      allowAutoHighlight,
      allowAutoRedirect,
      allowAutoGetUserOrders,
      allowAutoUpdateUserInfo,
      allowAutoFillForm,
      allowAutoTrackOrder,
      allowAutoLogout,
      allowAutoLogin,
      allowAutoGenerateImage,
    } = body || {};

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

    // Build dynamic update
    const fields: string[] = [];
    const values: any[] = [];
    if (color !== undefined) {
      fields.push("color = ?");
      values.push(color);
    }
    if (botName !== undefined) {
      fields.push("botName = ?");
      values.push(botName);
    }
    if (customWelcomeMessage !== undefined) {
      fields.push("customWelcomeMessage = ?");
      values.push(customWelcomeMessage);
    }
    if (active !== undefined) {
      fields.push("active = ?");
      values.push(active ? 1 : 0);
    }
    if (showHome !== undefined) {
      fields.push("showHome = ?");
      values.push(showHome ? 1 : 0);
    }
    if (showNews !== undefined) {
      fields.push("showNews = ?");
      values.push(showNews ? 1 : 0);
    }
    if (showHelp !== undefined) {
      fields.push("showHelp = ?");
      values.push(showHelp ? 1 : 0);
    }
    if (showVoiceAI !== undefined) {
      fields.push("showVoiceAI = ?");
      values.push(showVoiceAI ? 1 : 0);
    }
    if (showTextAI !== undefined) {
      fields.push("showTextAI = ?");
      values.push(showTextAI ? 1 : 0);
    }
    if (customInstructions !== undefined) {
      fields.push("customInstructions = ?");
      values.push(customInstructions ?? null);
    }
    const bool = (v: any) => (v !== undefined ? (v ? 1 : 0) : undefined);
    const pushIf = (col: string, v: any) => {
      const mapped = bool(v);
      if (mapped !== undefined) {
        fields.push(`${col} = ?`);
        values.push(mapped);
      }
    };
    pushIf("allowAutoCancel", allowAutoCancel);
    pushIf("allowAutoReturn", allowAutoReturn);
    pushIf("allowAutoExchange", allowAutoExchange);
    pushIf("allowAutoClick", allowAutoClick);
    pushIf("allowAutoScroll", allowAutoScroll);
    pushIf("allowAutoHighlight", allowAutoHighlight);
    pushIf("allowAutoRedirect", allowAutoRedirect);
    pushIf("allowAutoGetUserOrders", allowAutoGetUserOrders);
    pushIf("allowAutoUpdateUserInfo", allowAutoUpdateUserInfo);
    pushIf("allowAutoFillForm", allowAutoFillForm);
    pushIf("allowAutoTrackOrder", allowAutoTrackOrder);
    pushIf("allowAutoLogout", allowAutoLogout);
    pushIf("allowAutoLogin", allowAutoLogin);
    pushIf("allowAutoGenerateImage", allowAutoGenerateImage);

    if (fields.length > 0) {
      values.push(websiteId);
      await query(
        `UPDATE Website SET ${fields.join(", ")} WHERE id = ?`,
        values
      );
    }

    const [site] = (await query(
      `SELECT id, color, botName, customWelcomeMessage,
              showHome, showNews, showHelp,
              showVoiceAI, showTextAI, customInstructions,
              allowAutoCancel, allowAutoReturn, allowAutoExchange,
              allowAutoClick, allowAutoScroll, allowAutoHighlight, allowAutoRedirect,
              allowAutoGetUserOrders, allowAutoUpdateUserInfo, allowAutoFillForm,
              allowAutoTrackOrder, allowAutoLogout, allowAutoLogin, allowAutoGenerateImage
       FROM Website WHERE id = ? LIMIT 1`,
      [websiteId]
    )) as any[];

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
        },
      })
    );
  } catch (err) {
    console.error("POST /api/updateInterface/edit error:", err);
    return cors(
      request,
      NextResponse.json(
        { error: "Failed to update interface settings" },
        { status: 500 }
      )
    );
  }
}
