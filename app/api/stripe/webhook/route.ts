import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { stripe } from "../../../../lib/stripe";
import { query } from "../../../../lib/db";
export const dynamic = "force-dynamic";
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// Add route configuration
export const config = {
  api: {
    bodyParser: false,
  },
};

// Add GET handler to respond properly
export async function GET() {
  return new NextResponse("This endpoint only accepts POST requests", {
    status: 405,
  });
}

export async function POST(request: Request) {
  try {
    // Verify that the request is from Stripe
    const body = await request.text();
    const headersList = await headers();
    const signature = headersList.get("stripe-signature");

    if (!signature) {
      console.error("No stripe signature found in webhook request");
      return NextResponse.json(
        { error: "No signature found" },
        { status: 400 }
      );
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error(`⚠️ Webhook signature verification failed: ${err.message}`);
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    // Process the event
    console.log(`Received event: ${event.type}`);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        console.log("Processing checkout session completed:", {
          id: session.id,
          subscriptionId: session.subscription,
          customerId: session.customer,
        });

        // Get the subscription details
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        );

        // Get the website ID from metadata
        const websiteId = session.metadata?.websiteId;
        if (!websiteId) {
          console.error("No website ID found in session metadata");
          return NextResponse.json(
            { error: "No website ID found" },
            { status: 200 }
          );
        }

        // Set plan and queryLimit based on the price ID
        const priceId = subscription.items.data[0].price.id;
        const isEnterprisePlan =
          priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID;

        const plan = isEnterprisePlan ? "Enterprise" : "Starter";
        const queryLimit = isEnterprisePlan ? 0 : 100; // Now 100 for Starter plan (0 means unlimited for Enterprise)

        // Don't reset monthly queries - keep them for analytics
        await query(
          `UPDATE Website SET
            plan = ?,
            stripeSubscriptionId = ?,
            stripeSubscriptionItemId = ?,
            queryLimit = ?,
            renewsOn = ?
           WHERE id = ?`,
          [
            plan,
            session.subscription as string,
            subscription.items.data[0].id,
            queryLimit,
            new Date(subscription.current_period_end * 1000),
            websiteId,
          ]
        );

        console.log(`Successfully updated to ${plan} plan`);

        break;
      }

      // Handle other webhook events below
      case "customer.subscription.updated": {
        const subscription = event.data.object;

        // Find the website using subscription ID
        const websiteRows = (await query(
          `SELECT id, plan, monthlyQueries, stripeSubscriptionId
           FROM Website
           WHERE stripeSubscriptionId = ?
           LIMIT 1`,
          [subscription.id]
        )) as {
          id: string;
          plan: string;
          monthlyQueries: number;
          stripeSubscriptionId: string | null;
        }[];
        const website = websiteRows.length > 0 ? websiteRows[0] : null;

        if (!website) {
          console.error(
            "No website found with subscription ID:",
            subscription.id
          );
          return NextResponse.json(
            { error: "No website found" },
            { status: 200 }
          );
        }

        console.log("Found website for subscription:", {
          websiteId: website.id,
          currentPlan: website.plan,
          stripeSubscriptionId: website.stripeSubscriptionId,
        });

        // If subscription is cancelled or unpaid, downgrade to free
        if (
          subscription.status === "canceled" ||
          subscription.status === "unpaid" ||
          subscription.cancel_at_period_end
        ) {
          console.log("Downgrading website to free plan:", {
            websiteId: website.id,
            reason: subscription.cancel_at_period_end
              ? "scheduled_cancellation"
              : subscription.status,
          });

          // Get current query usage before downgrade
          const currentWebsiteRows = (await query(
            `SELECT monthlyQueries FROM Website WHERE id = ? LIMIT 1`,
            [website.id]
          )) as { monthlyQueries: number }[];
          const currentWebsite =
            currentWebsiteRows.length > 0 ? currentWebsiteRows[0] : null;

          // Calculate how many queries they've used relative to free tier limit
          const queryLimit = 200; // Free tier limit
          const usedQueries = currentWebsite
            ? Math.min(currentWebsite.monthlyQueries, queryLimit)
            : 0;

          await query(
            `UPDATE Website SET
               plan = '',
               stripeSubscriptionId = NULL,
               stripeSubscriptionItemId = NULL,
               renewsOn = ?,
               queryLimit = 0,
               monthlyQueries = ?
             WHERE id = ?`,
            [
              new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              usedQueries,
              website.id,
            ]
          );

          console.log("Successfully downgraded website to free plan");
        } else if (subscription.status === "active") {
          // If this is an upgrade to Enterprise plan, update settings accordingly
          const isEnterprisePlan = subscription.items.data.some(
            (item) => item.price.id === process.env.STRIPE_ENTERPRISE_PRICE_ID
          );

          const queryLimit = isEnterprisePlan ? 0 : 100; // Now 100 for Starter plan (0 means unlimited for Enterprise)
          const plan = isEnterprisePlan ? "Enterprise" : "Starter";

          console.log(
            `Updating subscription to ${plan} plan with queryLimit ${queryLimit}`
          );

          await query(
            `UPDATE Website SET
               plan = ?,
               queryLimit = ?,
               stripeSubscriptionItemId = ?,
               renewsOn = ?
             WHERE id = ?`,
            [
              plan,
              queryLimit,
              subscription.items.data[0].id,
              new Date(subscription.current_period_end * 1000),
              website.id,
            ]
          );
        }
        break;
      }

      case "customer.subscription.trial_will_end": {
        // Handle trial ending if you implement trials
        break;
      }

      default: {
        console.log(`Unhandled event type: ${event.type}`);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Error processing webhook:", {
      error: error.message,
      stack: error.stack,
    });
    // Return 200 even on errors, as per Stripe's recommendation
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 200 }
    );
  }
}
