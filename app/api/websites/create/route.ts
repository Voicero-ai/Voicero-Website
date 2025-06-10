import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import prisma from "../../../../lib/prisma";
import { authOptions } from "../../../../lib/auth";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createWebsiteSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  url: z.string().url("Invalid URL"),
  type: z.enum(["WordPress", "Shopify", "Custom"]),
  customType: z.string().optional().default(""),
  accessKey: z.string(),
  plan: z.enum(["Starter", "Enterprise"]),
});

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createWebsiteSchema.parse(body);

    // Always return Stripe checkout flow for paid plans
    return NextResponse.json({
      websiteData: validatedData,
      checkoutUrl: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error("Error creating website:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
