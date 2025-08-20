import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../../lib/auth";
import { stripe } from "../../../../lib/stripe";
import { query } from "../../../../lib/db";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";
// Handle POST request for creating a new checkout session
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { websiteId, websiteData, successUrl, cancelUrl } = body;

    // Get or create customer
    let customerId;
    const userRows = (await query(
      `SELECT stripeCustomerId FROM User WHERE id = ? LIMIT 1`,
      [session.user.id]
    )) as { stripeCustomerId: string | null }[];
    const user = userRows.length > 0 ? userRows[0] : null;

    if (user?.stripeCustomerId) {
      customerId = user.stripeCustomerId;
    } else {
      const customer = await stripe.customers.create({
        email: session.user.email!,
        metadata: { userId: session.user.id },
      });

      await query(`UPDATE User SET stripeCustomerId = ? WHERE id = ?`, [
        customer.id,
        session.user.id,
      ]);
      customerId = customer.id;
    }

    // If websiteId is provided, verify ownership and check for existing subscription
    let existingWebsite = null;
    let existingSubscriptionId = null;
    if (websiteId) {
      const websiteRows = (await query(
        `SELECT stripeSubscriptionId FROM Website WHERE id = ? AND userId = ? LIMIT 1`,
        [websiteId, session.user.id]
      )) as { stripeSubscriptionId: string | null }[];
      existingWebsite = websiteRows.length > 0 ? websiteRows[0] : null;
      if (!existingWebsite) {
        return NextResponse.json(
          { error: "Website not found" },
          { status: 404 }
        );
      }
      existingSubscriptionId = existingWebsite.stripeSubscriptionId;
    }

    // Use only Starter plan price ID
    const priceId = process.env.STRIPE_PRICE_ID_STARTER;
    if (!priceId) {
      return NextResponse.json(
        { error: "Stripe price ID not configured" },
        { status: 500 }
      );
    }

    // If there is an existing subscription, update it instead of creating a new one
    if (existingSubscriptionId) {
      // Get the subscription
      const subscription = await stripe.subscriptions.retrieve(
        existingSubscriptionId
      );
      // Update the subscription to use the new price
      await stripe.subscriptions.update(existingSubscriptionId, {
        items: [
          {
            id: subscription.items.data[0].id,
            price: priceId,
          },
        ],
        proration_behavior: "create_prorations",
      });

      // Don't update the plan here - the webhook will handle this when payment is confirmed
      // We'll add metadata to the website record about the pending upgrade
      console.log(
        "Updated subscription - waiting for webhook to confirm payment"
      );

      return NextResponse.json({ success: true });
    }

    // Otherwise, create checkout session as before
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId }],
      mode: "subscription",
      success_url:
        successUrl ||
        `${
          process.env.NEXT_PUBLIC_APP_URL
        }/app/websites/website?id=${websiteId}&upgraded=true&t=${Date.now()}`,
      cancel_url:
        cancelUrl ||
        `${
          process.env.NEXT_PUBLIC_APP_URL
        }/app/websites/website?id=${websiteId}&upgrade_canceled=true&t=${Date.now()}`,
      metadata: websiteId
        ? {
            websiteId,
            userId: session.user.id,
            plan: "Starter",
          }
        : {
            plan: "Starter",
            userId: session.user.id,
            // Only include essential fields to stay under 500 char limit
            websiteData: JSON.stringify({
              name: websiteData?.name || "",
              url: websiteData?.url || "",
              type: websiteData?.type || "",
              accessKey: websiteData?.accessKey || "",
            }),
          },
    });

    // Don't update anything here - wait for webhook confirmation
    // This ensures plan updates only happen after payment is confirmed

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}

// Handle GET request for completing the subscription
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");
    const websiteId = searchParams.get("id");

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
    }

    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);
    const subscription = await stripe.subscriptions.retrieve(
      checkoutSession.subscription as string
    );
    const renewsOn = new Date(subscription.current_period_end * 1000);

    // Get the website ID either from query params or metadata
    const targetWebsiteId = websiteId || checkoutSession.metadata?.websiteId;

    // Get subscription item ID for usage-based billing
    const subscriptionItemId = subscription.items.data[0].id;

    if (!targetWebsiteId) {
      // If no website ID, this is a new website creation
      // Check if websiteData is present in metadata
      if (!checkoutSession.metadata?.websiteData) {
        console.error("No website data found in session metadata");
        return NextResponse.json(
          { error: "Website data not found" },
          { status: 400 }
        );
      }

      let websiteData;
      try {
        websiteData = JSON.parse(checkoutSession.metadata.websiteData || "{}");
      } catch (error) {
        console.error("Error parsing websiteData:", error);
        return NextResponse.json(
          { error: "Invalid website data format" },
          { status: 400 }
        );
      }

      const userId = checkoutSession.metadata?.userId;

      if (!userId) {
        return NextResponse.json(
          { error: "No user ID found" },
          { status: 400 }
        );
      }

      // Validate required fields
      if (
        !websiteData.url ||
        !websiteData.name ||
        !websiteData.type ||
        !websiteData.accessKey
      ) {
        console.error("Missing required website data fields:", websiteData);
        return NextResponse.json(
          { error: "Missing required website data" },
          { status: 400 }
        );
      }

      // Set plan and queryLimit
      const plan = "Starter";
      const queryLimit = 100;

      // Create new website ONLY after payment is confirmed
      await query(
        `INSERT INTO Website (
           id, name, url, type, plan, active, userId,
           stripeSubscriptionId, stripeSubscriptionItemId,
           queryLimit, renewsOn, monthlyQueries, createdAt, updatedAt
         ) VALUES (
           UUID(), ?, ?, ?, ?, TRUE, ?, ?, ?, ?, ?, 0, NOW(), NOW()
         )`,
        [
          websiteData.name,
          websiteData.url,
          websiteData.type,
          plan,
          userId,
          checkoutSession.subscription as string,
          subscriptionItemId,
          queryLimit,
          renewsOn,
        ]
      );

      const websiteIdRows = (await query(
        `SELECT id FROM Website WHERE stripeSubscriptionId = ? LIMIT 1`,
        [checkoutSession.subscription as string]
      )) as { id: string }[];
      const createdWebsiteId = websiteIdRows[0]?.id;

      if (createdWebsiteId) {
        // Hash the access key before storage
        const hashedAccessKey = await hashAccessKey(websiteData.accessKey);

        // Store the hashed access key
        await query(
          `INSERT INTO AccessKey (id, name, key, websiteId) VALUES (UUID(), ?, ?, ?)`,
          ["Default Access Key", hashedAccessKey, createdWebsiteId]
        );
      }

      return NextResponse.json({ success: true, websiteId: createdWebsiteId });
    }

    // Update existing website - always to Starter plan
    const plan = "Starter";
    const queryLimit = 100;

    // Update the website with the new subscription data
    await query(
      `UPDATE Website SET
        plan = ?,
        stripeSubscriptionId = ?,
        stripeSubscriptionItemId = ?,
        queryLimit = ?,
        renewsOn = ?,
        active = TRUE
       WHERE id = ?`,
      [
        plan,
        checkoutSession.subscription as string,
        subscriptionItemId,
        queryLimit,
        renewsOn,
        targetWebsiteId,
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in session route:", error);
    return NextResponse.json(
      { error: "Session handling failed" },
      { status: 500 }
    );
  }
}

// Hash the access key before storage
async function hashAccessKey(accessKey: string): Promise<string> {
  return await bcrypt.hash(accessKey, 12);
}
