import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import prisma from "../../../lib/prisma";
import { authOptions } from "../../../lib/auth";
export const dynamic = "force-dynamic";

interface WebsiteWithCounts {
  id: string;
  url: string;
  name: string | null;
  type: string;
  plan: string;
  active: boolean;
  renewsOn: Date | null;
  stripeId: string | null;
  monthlyQueries: number;
  syncFrequency: string;
  lastSyncedAt: Date | null;
  createdAt: Date;
  _count: {
    [key: string]: number;
  };
}

interface TransformedWebsite extends Omit<WebsiteWithCounts, "_count"> {
  queryLimit: number;
  content: {
    products: number;
    blogPosts: number;
    pages: number;
  };
  status: "active" | "inactive";
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const websites = await prisma.website.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        _count: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const transformedWebsites: TransformedWebsite[] = websites.map(
      (website) => ({
        ...website,
        queryLimit: website.plan === "Growth" ? 10000 : 1000,
        content: {
          products:
            website.type === "WordPress"
              ? website._count.products
              : website._count.shopifyProducts,
          blogPosts:
            website.type === "WordPress"
              ? website._count.posts
              : website._count.shopifyBlog || 0,
          pages:
            website.type === "WordPress"
              ? website._count.pages
              : website._count.shopifyPages,
        },
        status: website.active ? "active" : "inactive",
      })
    );

    return NextResponse.json(transformedWebsites);
  } catch (error) {
    console.error("Error fetching websites:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
