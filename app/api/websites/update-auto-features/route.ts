import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
export const dynamic = "force-dynamic";

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
    const website = await prisma.website.findFirst({
      where: {
        id: websiteId,
        user: {
          email: session.user.email ?? undefined,
        },
      },
    });

    if (!website) {
      return NextResponse.json(
        { error: "Website not found or access denied" },
        { status: 404 }
      );
    }

    // Update website with auto features
    const updatedWebsite = await prisma.website.update({
      where: {
        id: websiteId,
      },
      data: {
        allowAutoCancel: allowAutoCancel !== undefined ? allowAutoCancel : true,
        allowAutoReturn: allowAutoReturn !== undefined ? allowAutoReturn : true,
        allowAutoExchange:
          allowAutoExchange !== undefined ? allowAutoExchange : true,
        allowAutoClick: allowAutoClick !== undefined ? allowAutoClick : true,
        allowAutoScroll: allowAutoScroll !== undefined ? allowAutoScroll : true,
        allowAutoHighlight:
          allowAutoHighlight !== undefined ? allowAutoHighlight : true,
        allowAutoRedirect:
          allowAutoRedirect !== undefined ? allowAutoRedirect : true,
        allowAutoGetUserOrders:
          allowAutoGetUserOrders !== undefined ? allowAutoGetUserOrders : true,
        allowAutoUpdateUserInfo:
          allowAutoUpdateUserInfo !== undefined
            ? allowAutoUpdateUserInfo
            : true,
        allowAutoFillForm:
          allowAutoFillForm !== undefined ? allowAutoFillForm : true,
        allowAutoTrackOrder:
          allowAutoTrackOrder !== undefined ? allowAutoTrackOrder : true,
        allowAutoLogout: allowAutoLogout !== undefined ? allowAutoLogout : true,
        allowAutoLogin: allowAutoLogin !== undefined ? allowAutoLogin : true,
        allowAutoGenerateImage:
          allowAutoGenerateImage !== undefined ? allowAutoGenerateImage : true,
        allowMultiAIReview:
          allowMultiAIReview !== undefined ? allowMultiAIReview : false,
      },
    });

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
