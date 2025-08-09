import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { query } from "../../../../lib/db";
import { stripe } from "../../../../lib/stripe";
import { authOptions } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { websiteId } = body;

    if (!websiteId) {
      return NextResponse.json(
        { error: "Website ID is required" },
        { status: 400 }
      );
    }

    // Get website and verify ownership
    const rows = (await query(
      `SELECT w.stripeId, u.stripeCustomerId
       FROM Website w
       JOIN User u ON u.id = w.userId
       WHERE w.id = ? AND w.userId = ?
       LIMIT 1`,
      [websiteId, session.user.id]
    )) as any[];
    const website = rows[0];

    if (!website) {
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
    }

    if (!website.stripeId || !website.stripeCustomerId) {
      return NextResponse.json(
        { error: "No subscription found" },
        { status: 400 }
      );
    }

    // Create Stripe portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: website.stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/app/websites/website?id=${websiteId}`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    console.error("Error creating portal session:", error);
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 }
    );
  }
}
