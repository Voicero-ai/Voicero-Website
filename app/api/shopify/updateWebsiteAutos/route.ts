import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cors } from "../../../../lib/cors";
export const dynamic = "force-dynamic";
const prisma = new PrismaClient();

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
    const {
      websiteId: providedWebsiteId,
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
    } = body;

    // First find the website ID using the access key
    const accessKeyRecord = await prisma.accessKey.findUnique({
      where: {
        key: accessKey,
      },
      select: {
        websiteId: true,
      },
    });

    if (!accessKeyRecord) {
      return cors(
        request,
        NextResponse.json({ error: "Invalid access key" }, { status: 401 })
      );
    }

    // Use the provided websiteId or the one from the access key
    const websiteId = providedWebsiteId || accessKeyRecord.websiteId;

    // Verify the website matches the one from the access key if websiteId was provided
    if (providedWebsiteId && accessKeyRecord.websiteId !== providedWebsiteId) {
      return cors(
        request,
        NextResponse.json(
          { error: "Unauthorized to update this website's settings" },
          { status: 403 }
        )
      );
    }

    // Prepare update data - only include fields that are defined in the request
    const updateData: any = {};

    if (typeof allowAutoCancel === "boolean")
      updateData.allowAutoCancel = allowAutoCancel;
    if (typeof allowAutoReturn === "boolean")
      updateData.allowAutoReturn = allowAutoReturn;
    if (typeof allowAutoExchange === "boolean")
      updateData.allowAutoExchange = allowAutoExchange;
    if (typeof allowAutoClick === "boolean")
      updateData.allowAutoClick = allowAutoClick;
    if (typeof allowAutoScroll === "boolean")
      updateData.allowAutoScroll = allowAutoScroll;
    if (typeof allowAutoHighlight === "boolean")
      updateData.allowAutoHighlight = allowAutoHighlight;
    if (typeof allowAutoRedirect === "boolean")
      updateData.allowAutoRedirect = allowAutoRedirect;
    if (typeof allowAutoGetUserOrders === "boolean")
      updateData.allowAutoGetUserOrders = allowAutoGetUserOrders;
    if (typeof allowAutoUpdateUserInfo === "boolean")
      updateData.allowAutoUpdateUserInfo = allowAutoUpdateUserInfo;
    if (typeof allowAutoFillForm === "boolean")
      updateData.allowAutoFillForm = allowAutoFillForm;
    if (typeof allowAutoTrackOrder === "boolean")
      updateData.allowAutoTrackOrder = allowAutoTrackOrder;
    if (typeof allowAutoLogout === "boolean")
      updateData.allowAutoLogout = allowAutoLogout;
    if (typeof allowAutoLogin === "boolean")
      updateData.allowAutoLogin = allowAutoLogin;
    if (typeof allowAutoGenerateImage === "boolean")
      updateData.allowAutoGenerateImage = allowAutoGenerateImage;

    // Check if there are any fields to update
    if (Object.keys(updateData).length === 0) {
      return cors(
        request,
        NextResponse.json(
          { error: "No valid auto settings provided to update" },
          { status: 400 }
        )
      );
    }

    // Update the website
    const updatedWebsite = await prisma.website.update({
      where: {
        id: websiteId,
      },
      data: updateData,
      select: {
        id: true,
        allowAutoCancel: true,
        allowAutoReturn: true,
        allowAutoExchange: true,
        allowAutoClick: true,
        allowAutoScroll: true,
        allowAutoHighlight: true,
        allowAutoRedirect: true,
        allowAutoGetUserOrders: true,
        allowAutoUpdateUserInfo: true,
        allowAutoFillForm: true,
        allowAutoTrackOrder: true,
        allowAutoLogout: true,
        allowAutoLogin: true,
        allowAutoGenerateImage: true,
      },
    });

    return cors(
      request,
      NextResponse.json({
        success: true,
        message: "Website auto settings updated successfully",
        settings: updatedWebsite,
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
