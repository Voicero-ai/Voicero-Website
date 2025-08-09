import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Define interface for website
interface Website {
  id: string;
  url: string;
  userId: string;
  allowAutoCancel: boolean;
  allowAutoReturn: boolean;
  allowAutoExchange: boolean;
  allowAutoClick: boolean;
  allowAutoScroll: boolean;
  allowAutoHighlight: boolean;
  allowAutoRedirect: boolean;
  allowAutoGetUserOrders: boolean;
  allowAutoUpdateUserInfo: boolean;
  allowAutoFillForm: boolean;
  allowAutoTrackOrder: boolean;
  allowAutoLogout: boolean;
  allowAutoLogin: boolean;
  allowAutoGenerateImage: boolean;
  allowMultiAIReview: boolean;
}

export async function POST(request: NextRequest) {
  try {
    // Check auth - only logged in users can update website settings
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request
    const data = await request.json();
    const {
      websiteId,
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
      allowMultiAIReview,
    } = data;

    // Validate websiteId
    if (!websiteId) {
      return NextResponse.json(
        { error: "Website ID is required" },
        { status: 400 }
      );
    }

    // Check if website exists and belongs to the user
    const websites = (await query(
      "SELECT * FROM Website WHERE id = ? AND userId IN (SELECT id FROM User WHERE email = ?)",
      [websiteId, session.user.email || ""]
    )) as Website[];

    if (websites.length === 0) {
      return NextResponse.json(
        { error: "Website not found or access denied" },
        { status: 404 }
      );
    }

    // Update website with auto features
    await query(
      `UPDATE Website SET 
        allowAutoCancel = ?,
        allowAutoReturn = ?,
        allowAutoExchange = ?,
        allowAutoClick = ?,
        allowAutoScroll = ?,
        allowAutoHighlight = ?,
        allowAutoRedirect = ?,
        allowAutoGetUserOrders = ?,
        allowAutoUpdateUserInfo = ?,
        allowAutoFillForm = ?,
        allowAutoTrackOrder = ?,
        allowAutoLogout = ?,
        allowAutoLogin = ?,
        allowAutoGenerateImage = ?,
        allowMultiAIReview = ?
      WHERE id = ?`,
      [
        allowAutoCancel !== undefined ? allowAutoCancel : true,
        allowAutoReturn !== undefined ? allowAutoReturn : true,
        allowAutoExchange !== undefined ? allowAutoExchange : true,
        allowAutoClick !== undefined ? allowAutoClick : true,
        allowAutoScroll !== undefined ? allowAutoScroll : true,
        allowAutoHighlight !== undefined ? allowAutoHighlight : true,
        allowAutoRedirect !== undefined ? allowAutoRedirect : true,
        allowAutoGetUserOrders !== undefined ? allowAutoGetUserOrders : true,
        allowAutoUpdateUserInfo !== undefined ? allowAutoUpdateUserInfo : true,
        allowAutoFillForm !== undefined ? allowAutoFillForm : true,
        allowAutoTrackOrder !== undefined ? allowAutoTrackOrder : true,
        allowAutoLogout !== undefined ? allowAutoLogout : true,
        allowAutoLogin !== undefined ? allowAutoLogin : true,
        allowAutoGenerateImage !== undefined ? allowAutoGenerateImage : true,
        allowMultiAIReview !== undefined ? allowMultiAIReview : false,
        websiteId,
      ]
    );

    // Get the updated website
    const updatedWebsites = (await query("SELECT * FROM Website WHERE id = ?", [
      websiteId,
    ])) as Website[];

    const updatedWebsite = updatedWebsites[0];

    return NextResponse.json({
      success: true,
      website: {
        id: updatedWebsite.id,
        allowAutoCancel: updatedWebsite.allowAutoCancel,
        allowAutoReturn: updatedWebsite.allowAutoReturn,
        allowAutoExchange: updatedWebsite.allowAutoExchange,
        allowAutoClick: updatedWebsite.allowAutoClick,
        allowAutoScroll: updatedWebsite.allowAutoScroll,
        allowAutoHighlight: updatedWebsite.allowAutoHighlight,
        allowAutoRedirect: updatedWebsite.allowAutoRedirect,
        allowAutoGetUserOrders: updatedWebsite.allowAutoGetUserOrders,
        allowAutoUpdateUserInfo: updatedWebsite.allowAutoUpdateUserInfo,
        allowAutoFillForm: updatedWebsite.allowAutoFillForm,
        allowAutoTrackOrder: updatedWebsite.allowAutoTrackOrder,
        allowAutoLogout: updatedWebsite.allowAutoLogout,
        allowAutoLogin: updatedWebsite.allowAutoLogin,
        allowAutoGenerateImage: updatedWebsite.allowAutoGenerateImage,
        allowMultiAIReview: updatedWebsite.allowMultiAIReview,
      },
    });
  } catch (error) {
    console.error("Error updating auto features:", error);
    return NextResponse.json(
      { error: "Failed to update auto features" },
      { status: 500 }
    );
  }
}
