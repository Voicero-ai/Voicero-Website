import { NextRequest, NextResponse } from "next/server";
import { stripe } from "../../../../../lib/stripe";
import { query } from "@/lib/db";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json({ error: "No session ID" }, { status: 400 });
  }

  const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);
  const websiteData = JSON.parse(checkoutSession.metadata?.websiteData || "{}");

  // Get subscription details to determine renewal date
  const subscription = await stripe.subscriptions.retrieve(
    checkoutSession.subscription as string
  );

  // Calculate renewsOn date from the current period end
  const renewsOn = new Date(subscription.current_period_end * 1000);

  const userId = checkoutSession.metadata?.userId;
  if (!userId) {
    return NextResponse.json({ error: "No user ID found" }, { status: 400 });
  }

  // Determine plan and query limit
  let plan = websiteData.plan;
  let queryLimit = 100;
  if (plan === "Growth") queryLimit = 10000;

  // Create website with subscription data
  // Create website and access key
  const websiteIdRows = (await query(
    `INSERT INTO Website (id, name, url, type, plan, active, userId, stripeId, queryLimit, renewsOn, monthlyQueries)
     VALUES (UUID(), ?, ?, ?, ?, FALSE, ?, ?, ?, ?, 0)`,
    [
      websiteData.name,
      websiteData.url,
      websiteData.type,
      plan,
      userId,
      checkoutSession.subscription as string,
      queryLimit,
      renewsOn,
    ]
  )) as any;

  // Fetch the created website id by stripeId to avoid relying on insertId for UUID
  const websites = (await query(
    `SELECT id FROM Website WHERE stripeId = ? LIMIT 1`,
    [checkoutSession.subscription as string]
  )) as { id: string }[];
  const websiteId = websites[0]?.id;

  if (websiteId) {
    // Hash the access key before storage
    const hashedAccessKey = await hashAccessKey(websiteData.accessKey);

    // Store the hashed access key
    await query(
      `INSERT INTO AccessKey (id, name, key, websiteId) VALUES (UUID(), ?, ?, ?)`,
      ["Default Access Key", hashedAccessKey, websiteId]
    );
  }

  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_APP_URL}/app/websites`
  );
}

// Hash the access key before storage
async function hashAccessKey(accessKey: string): Promise<string> {
  return await bcrypt.hash(accessKey, 12);
}
