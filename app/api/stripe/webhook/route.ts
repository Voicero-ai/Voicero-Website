import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { stripe } from "../../../../lib/stripe";
import prisma from "../../../../lib/prisma";
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
      console.error("Webhook signature verification failed:", err.message);
      return NextResponse.json(
        { error: "Webhook signature verification failed" },
        { status: 400 }
      );
    }

    console.log("Received Stripe webhook event:", {
      type: event.type,
      id: event.id,
      object: event.object,
    });

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

        // Check if this is a new plan or an upgrade
        const website = await prisma.website.findUnique({
          where: { id: websiteId },
          select: {
            plan: true,
            monthlyQueries: true,
          },
        });

        // Set plan and queryLimit based on the price ID
        const priceId = subscription.items.data[0].price.id;
        const isEnterprisePlan =
          priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID;

        const plan = isEnterprisePlan ? "Enterprise" : "Starter";
        const queryLimit = isEnterprisePlan ? 0 : 1000; // 0 means unlimited for Enterprise

        // Don't reset monthly queries - keep them for analytics
        await prisma.website.update({
          where: { id: websiteId },
          data: {
            plan,
            stripeSubscriptionId: session.subscription as string,
            queryLimit,
            renewsOn: new Date(subscription.current_period_end * 1000),
            // Don't reset monthly queries to preserve usage statistics
          },
        });

        console.log("Successfully updated website with new subscription:", {
          websiteId,
          plan,
          subscriptionId: session.subscription,
        });
        break;
      }

      case "customer.subscription.deleted":
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        console.log("Processing subscription event:", {
          id: subscription.id,
          status: subscription.status,
          customerId: subscription.customer,
        });

        // Find all websites to debug
        const allWebsites = await prisma.website.findMany({
          where: {
            NOT: {
              stripeSubscriptionId: null,
            },
          },
          select: {
            id: true,
            stripeSubscriptionId: true,
            plan: true,
          },
        });

        console.log("All websites with stripe subscriptions:", allWebsites);

        // Find website with this subscription
        const website = await prisma.website.findFirst({
          where: { stripeSubscriptionId: subscription.id },
          select: {
            id: true,
            stripeSubscriptionId: true,
            plan: true,
            monthlyQueries: true,
          },
        });

        if (!website) {
          console.error("No website found for subscription:", {
            subscriptionId: subscription.id,
            customerId: subscription.customer,
            allWebsiteIds: allWebsites.map((w) => ({
              id: w.id,
              stripeSubscriptionId: w.stripeSubscriptionId,
            })),
          });
          // Return 200 even if website not found, as per Stripe's recommendation
          return NextResponse.json(
            { error: "Website not found" },
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
          const currentWebsite = await prisma.website.findUnique({
            where: { id: website.id },
            select: { monthlyQueries: true },
          });

          // Calculate how many queries they've used relative to free tier limit
          const queryLimit = 200; // Free tier limit
          const usedQueries = currentWebsite
            ? Math.min(currentWebsite.monthlyQueries, queryLimit)
            : 0;

          await prisma.website.update({
            where: { id: website.id },
            data: {
              plan: "",
              stripeSubscriptionId: null,
              renewsOn: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Set 30 days from now
              queryLimit: 0, // Reset to free tier limit
              monthlyQueries: usedQueries, // Maintain their query usage up to the free tier limit
            },
          });

          console.log("Successfully downgraded website to free plan");
        } else if (subscription.status === "active") {
          // If this is an upgrade to Enterprise plan, update settings accordingly
          const isEnterprisePlan = subscription.items.data.some(
            (item) => item.price.id === process.env.STRIPE_ENTERPRISE_PRICE_ID
          );

          const queryLimit = isEnterprisePlan ? 0 : 1000; // 0 means unlimited for Enterprise
          const plan = isEnterprisePlan ? "Enterprise" : "Starter";

          console.log(
            `Updating subscription to ${plan} plan with queryLimit ${queryLimit}`
          );

          await prisma.website.update({
            where: { id: website.id },
            data: {
              plan,
              queryLimit,
              renewsOn: new Date(subscription.current_period_end * 1000),
              // Don't reset monthly queries to preserve usage statistics
            },
          });
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
