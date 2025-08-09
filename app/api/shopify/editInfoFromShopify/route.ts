import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { cors } from "../../../../lib/cors";
export const dynamic = "force-dynamic";

interface AccessKey {
  websiteId: string;
}

interface PopUpQuestion {
  id: string;
  question: string;
  websiteId: string;
}

interface Website {
  id: string;
  name: string;
  url: string;
  customInstructions: string | null;
  active: boolean;
  plan: string;
  queryLimit: number;
  monthlyQueries: number;
  renewsOn: Date | null;
  lastSyncedAt: Date | null;
  syncFrequency: string | null;
  color: string | null;
}

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    console.log("Received editInfoFromShopify request");

    // Get the authorization header
    const authHeader = request.headers.get("authorization");
    console.log("Auth header:", authHeader?.substring(0, 20) + "...");

    if (!authHeader?.startsWith("Bearer ")) {
      console.log("Invalid auth header format");
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
    console.log("Access key:", accessKey?.substring(0, 10) + "...");

    if (!accessKey) {
      console.log("No access key found");
      return cors(
        request,
        NextResponse.json({ error: "No access key provided" }, { status: 401 })
      );
    }

    // Get request body
    const body = await request.json();
    console.log("Request body:", JSON.stringify(body, null, 2));

    const {
      name,
      url,
      customInstructions,
      popUpQuestions,
      active,
      plan,
      queryLimit,
      monthlyQueries,
      renewsOn,
      lastSyncedAt,
      syncFrequency,
      color,
    } = body;

    console.log("Color received:", color);
    console.log("PopUpQuestions received:", popUpQuestions);

    // Validate color format if provided
    if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      console.log("Invalid color format:", color);
      return cors(
        request,
        NextResponse.json(
          {
            error:
              "Invalid color format. Must be a valid hex color code (e.g. #FF0000)",
          },
          { status: 400 }
        )
      );
    }

    // Parse popUpQuestions if it's a string
    let parsedPopUpQuestions = [];
    try {
      parsedPopUpQuestions =
        typeof popUpQuestions === "string"
          ? JSON.parse(popUpQuestions)
          : popUpQuestions || [];
      console.log("Parsed popUpQuestions:", parsedPopUpQuestions);
    } catch (e) {
      console.error("Error parsing popUpQuestions:", e);
      parsedPopUpQuestions = [];
    }

    // Find the website ID using the access key
    const accessKeyRecords = (await query(
      "SELECT websiteId FROM AccessKey WHERE `key` = ?",
      [accessKey]
    )) as AccessKey[];

    console.log(
      "Access key record found:",
      accessKeyRecords.length > 0 ? "yes" : "no"
    );

    if (accessKeyRecords.length === 0) {
      console.log("No access key record found");
      return cors(
        request,
        NextResponse.json({ error: "Invalid access key" }, { status: 401 })
      );
    }

    const accessKeyRecord = accessKeyRecords[0];

    console.log("Updating website with data:", {
      name,
      url,
      customInstructions,
      active,
      plan,
      queryLimit,
      monthlyQueries,
      renewsOn,
      syncFrequency,
      color,
      popUpQuestions: parsedPopUpQuestions,
    });

    // Update the website using the found website ID
    await query(
      `UPDATE Website SET 
       name = ?, 
       url = ?, 
       customInstructions = ?, 
       active = ?, 
       plan = ?, 
       queryLimit = ?, 
       monthlyQueries = ?, 
       renewsOn = ?, 
       syncFrequency = ?, 
       color = ?
       WHERE id = ?`,
      [
        name,
        url,
        customInstructions,
        active,
        plan,
        queryLimit,
        monthlyQueries,
        renewsOn ? new Date(renewsOn) : null,
        syncFrequency,
        color || null,
        accessKeyRecord.websiteId,
      ]
    );

    // Delete existing pop-up questions
    await query("DELETE FROM PopUpQuestion WHERE websiteId = ?", [
      accessKeyRecord.websiteId,
    ]);

    // Insert new pop-up questions
    for (const q of parsedPopUpQuestions) {
      await query(
        "INSERT INTO PopUpQuestion (question, websiteId) VALUES (?, ?)",
        [q.question, accessKeyRecord.websiteId]
      );
    }

    // Get the updated website
    const websites = (await query("SELECT * FROM Website WHERE id = ?", [
      accessKeyRecord.websiteId,
    ])) as Website[];

    const website = websites[0];

    // Get the pop-up questions
    const popUpQuestionsResult = (await query(
      "SELECT * FROM PopUpQuestion WHERE websiteId = ?",
      [accessKeyRecord.websiteId]
    )) as PopUpQuestion[];

    console.log("Website updated successfully:", {
      id: website.id,
      name: website.name,
      color: website.color,
      popUpQuestions: popUpQuestionsResult,
    });

    return cors(
      request,
      NextResponse.json({
        success: true,
        website: {
          id: website.id,
          name: website.name,
          url: website.url,
          customInstructions: website.customInstructions,
          active: website.active,
          plan: website.plan,
          queryLimit: website.queryLimit,
          monthlyQueries: website.monthlyQueries,
          renewsOn: website.renewsOn,
          lastSyncedAt: website.lastSyncedAt,
          syncFrequency: website.syncFrequency,
          popUpQuestions: popUpQuestionsResult,
          color: website.color,
        },
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
