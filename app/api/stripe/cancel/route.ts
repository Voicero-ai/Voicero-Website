import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { query } from '../../../../lib/db';
import { stripe } from '../../../../lib/stripe';
import { authOptions } from '../../../../lib/auth';

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { websiteId } = await request.json();
    if (!websiteId) {
      return NextResponse.json(
        { error: "Website ID is required" },
        { status: 400 }
      );
    }
    const rows = (await query(
      `SELECT stripeSubscriptionId FROM Website WHERE id = ? AND userId = ? LIMIT 1`,
      [websiteId, session.user.id]
    )) as any[];
    const website = rows[0];
    if (!website || !website.stripeSubscriptionId) {
      return NextResponse.json(
        { error: "No active subscription found" },
        { status: 400 }
      );
    }
    // Cancel the Stripe subscription at period end
    await stripe.subscriptions.update(website.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    // Remove stripeSubscriptionId and blank the plan
    await query(
      `UPDATE Website
       SET stripeSubscriptionId = NULL,
           stripeSubscriptionItemId = NULL,
           queryLimit = 0,
           monthlyQueries = 0,
           plan = '',
           active = 0
       WHERE id = ?`,
      [websiteId]
    );
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error cancelling subscription:", error);
    return NextResponse.json(
      { error: error.message || "Failed to cancel subscription" },
      { status: 500 }
    );
  }
}
