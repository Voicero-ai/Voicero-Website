import { NextRequest, NextResponse } from "next/server";
import { cors } from "../../../../lib/cors";
import { query } from "../../../../lib/db";

export const dynamic = "force-dynamic";

interface AccessKey {
  id: string;
  key: string;
  websiteId: string;
}

interface Website {
  id: string;
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
    const accessKeys = (await query(
      "SELECT websiteId FROM AccessKey WHERE `key` = ?",
      [accessKey]
    )) as AccessKey[];

    if (accessKeys.length === 0) {
      return cors(
        request,
        NextResponse.json({ error: "Invalid access key" }, { status: 401 })
      );
    }

    const accessKeyRecord = accessKeys[0];

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

    // Prepare update fields and values
    const updateFields = [];
    const updateValues = [];

    if (typeof allowAutoCancel === "boolean") {
      updateFields.push("allowAutoCancel = ?");
      updateValues.push(allowAutoCancel);
    }

    if (typeof allowAutoReturn === "boolean") {
      updateFields.push("allowAutoReturn = ?");
      updateValues.push(allowAutoReturn);
    }

    if (typeof allowAutoExchange === "boolean") {
      updateFields.push("allowAutoExchange = ?");
      updateValues.push(allowAutoExchange);
    }

    if (typeof allowAutoClick === "boolean") {
      updateFields.push("allowAutoClick = ?");
      updateValues.push(allowAutoClick);
    }

    if (typeof allowAutoScroll === "boolean") {
      updateFields.push("allowAutoScroll = ?");
      updateValues.push(allowAutoScroll);
    }

    if (typeof allowAutoHighlight === "boolean") {
      updateFields.push("allowAutoHighlight = ?");
      updateValues.push(allowAutoHighlight);
    }

    if (typeof allowAutoRedirect === "boolean") {
      updateFields.push("allowAutoRedirect = ?");
      updateValues.push(allowAutoRedirect);
    }

    if (typeof allowAutoGetUserOrders === "boolean") {
      updateFields.push("allowAutoGetUserOrders = ?");
      updateValues.push(allowAutoGetUserOrders);
    }

    if (typeof allowAutoUpdateUserInfo === "boolean") {
      updateFields.push("allowAutoUpdateUserInfo = ?");
      updateValues.push(allowAutoUpdateUserInfo);
    }

    if (typeof allowAutoFillForm === "boolean") {
      updateFields.push("allowAutoFillForm = ?");
      updateValues.push(allowAutoFillForm);
    }

    if (typeof allowAutoTrackOrder === "boolean") {
      updateFields.push("allowAutoTrackOrder = ?");
      updateValues.push(allowAutoTrackOrder);
    }

    if (typeof allowAutoLogout === "boolean") {
      updateFields.push("allowAutoLogout = ?");
      updateValues.push(allowAutoLogout);
    }

    if (typeof allowAutoLogin === "boolean") {
      updateFields.push("allowAutoLogin = ?");
      updateValues.push(allowAutoLogin);
    }

    if (typeof allowAutoGenerateImage === "boolean") {
      updateFields.push("allowAutoGenerateImage = ?");
      updateValues.push(allowAutoGenerateImage);
    }

    // Check if there are any fields to update
    if (updateFields.length === 0) {
      return cors(
        request,
        NextResponse.json(
          { error: "No valid auto settings provided to update" },
          { status: 400 }
        )
      );
    }

    // Update the website
    await query(`UPDATE Website SET ${updateFields.join(", ")} WHERE id = ?`, [
      ...updateValues,
      websiteId,
    ]);

    // Get the updated website
    const updatedWebsites = (await query(
      `SELECT id, allowAutoCancel, allowAutoReturn, allowAutoExchange, 
      allowAutoClick, allowAutoScroll, allowAutoHighlight, allowAutoRedirect, 
      allowAutoGetUserOrders, allowAutoUpdateUserInfo, allowAutoFillForm, 
      allowAutoTrackOrder, allowAutoLogout, allowAutoLogin, allowAutoGenerateImage 
      FROM Website WHERE id = ?`,
      [websiteId]
    )) as Website[];

    return cors(
      request,
      NextResponse.json({
        success: true,
        message: "Website auto settings updated successfully",
        settings: updatedWebsites[0],
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
