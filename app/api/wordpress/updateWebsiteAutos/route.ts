import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { cors } from "../../../../lib/cors";
export const dynamic = "force-dynamic";

interface AccessKey {
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
    const updateParts = [];
    const updateValues = [];

    if (typeof allowAutoCancel === "boolean") {
      updateParts.push("allowAutoCancel = ?");
      updateValues.push(allowAutoCancel);
    }
    if (typeof allowAutoReturn === "boolean") {
      updateParts.push("allowAutoReturn = ?");
      updateValues.push(allowAutoReturn);
    }
    if (typeof allowAutoExchange === "boolean") {
      updateParts.push("allowAutoExchange = ?");
      updateValues.push(allowAutoExchange);
    }
    if (typeof allowAutoClick === "boolean") {
      updateParts.push("allowAutoClick = ?");
      updateValues.push(allowAutoClick);
    }
    if (typeof allowAutoScroll === "boolean") {
      updateParts.push("allowAutoScroll = ?");
      updateValues.push(allowAutoScroll);
    }
    if (typeof allowAutoHighlight === "boolean") {
      updateParts.push("allowAutoHighlight = ?");
      updateValues.push(allowAutoHighlight);
    }
    if (typeof allowAutoRedirect === "boolean") {
      updateParts.push("allowAutoRedirect = ?");
      updateValues.push(allowAutoRedirect);
    }
    if (typeof allowAutoGetUserOrders === "boolean") {
      updateParts.push("allowAutoGetUserOrders = ?");
      updateValues.push(allowAutoGetUserOrders);
    }
    if (typeof allowAutoUpdateUserInfo === "boolean") {
      updateParts.push("allowAutoUpdateUserInfo = ?");
      updateValues.push(allowAutoUpdateUserInfo);
    }
    if (typeof allowAutoFillForm === "boolean") {
      updateParts.push("allowAutoFillForm = ?");
      updateValues.push(allowAutoFillForm);
    }
    if (typeof allowAutoTrackOrder === "boolean") {
      updateParts.push("allowAutoTrackOrder = ?");
      updateValues.push(allowAutoTrackOrder);
    }
    if (typeof allowAutoLogout === "boolean") {
      updateParts.push("allowAutoLogout = ?");
      updateValues.push(allowAutoLogout);
    }
    if (typeof allowAutoLogin === "boolean") {
      updateParts.push("allowAutoLogin = ?");
      updateValues.push(allowAutoLogin);
    }
    if (typeof allowAutoGenerateImage === "boolean") {
      updateParts.push("allowAutoGenerateImage = ?");
      updateValues.push(allowAutoGenerateImage);
    }

    // Check if there are any fields to update
    if (updateParts.length === 0) {
      return cors(
        request,
        NextResponse.json(
          { error: "No valid auto settings provided to update" },
          { status: 400 }
        )
      );
    }

    // Update the website
    const updateQuery = `UPDATE Website SET ${updateParts.join(
      ", "
    )} WHERE id = ?`;
    updateValues.push(websiteId);

    await query(updateQuery, updateValues);

    // Get the updated website
    const updatedWebsites = (await query(
      `SELECT id, allowAutoCancel, allowAutoReturn, allowAutoExchange, 
       allowAutoClick, allowAutoScroll, allowAutoHighlight, allowAutoRedirect, 
       allowAutoGetUserOrders, allowAutoUpdateUserInfo, allowAutoFillForm, 
       allowAutoTrackOrder, allowAutoLogout, allowAutoLogin, allowAutoGenerateImage 
       FROM Website WHERE id = ?`,
      [websiteId]
    )) as Website[];

    const updatedWebsite = updatedWebsites[0];

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
