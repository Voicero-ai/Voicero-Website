import { NextResponse } from "next/server";
import { stripe } from "../../../../../lib/stripe";
import prisma from "../../../../../lib/prisma";

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
  const website = await prisma.website.create({
    data: {
      name: websiteData.name,
      url: websiteData.url,
      type: websiteData.type,
      plan: plan,
      active: false,
      userId: userId,
      stripeId: checkoutSession.subscription as string,
      queryLimit: queryLimit,
      renewsOn,
      accessKeys: {
        create: { key: websiteData.accessKey },
      },
      monthlyQueries: 0,
    },
  });

  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_APP_URL}/app/websites`
  );
}
