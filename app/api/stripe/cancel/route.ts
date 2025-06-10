import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import prisma from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { authOptions } from "@/lib/auth";

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
    const website = await prisma.website.findFirst({
      where: { id: websiteId, userId: session.user.id },
      select: { stripeSubscriptionId: true },
    });
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
    await prisma.website.update({
      where: { id: websiteId },
      data: {
        stripeSubscriptionId: null,
        stripeSubscriptionItemId: null,
        queryLimit: 0,
        monthlyQueries: 0,
        plan: "",
        active: false,
      },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error cancelling subscription:", error);
    return NextResponse.json(
      { error: error.message || "Failed to cancel subscription" },
      { status: 500 }
    );
  }
}
