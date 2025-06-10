import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../lib/auth";
import prisma from "../../../lib/prisma";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { siteUrl, wpRedirect, websiteId, type } = await request.json();

    if (!siteUrl || !wpRedirect || !type) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    // Validate type
    if (!["WordPress", "Shopify"].includes(type)) {
      return NextResponse.json({ error: "Invalid site type" }, { status: 400 });
    }

    let website;
    let accessKey;
    const websiteName = extractWebsiteName(siteUrl);

    if (websiteId) {
      // Use existing website
      website = await prisma.website.findFirst({
        where: {
          id: websiteId,
          userId: session.user.id,
          type: type,
        },
        include: {
          accessKeys: true,
        },
      });

      if (!website) {
        return NextResponse.json(
          { error: "Website not found" },
          { status: 404 }
        );
      }
    } else {
      // Use upsert to prevent duplicates
      website = await prisma.website.upsert({
        where: {
          userId_url_type: {
            url: siteUrl,
            userId: session.user.id,
            type: type,
          },
        },
        update: {},
        create: {
          url: siteUrl,
          name: websiteName,
          userId: session.user.id,
          type: type,
          plan: "",
          queryLimit: 0,
          renewsOn: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Set 30 days from now
          accessKeys: {
            create: {
              key: generateAccessKey(),
            },
          },
        },
        include: {
          accessKeys: true,
        },
      });
    }

    // Use existing access key or create new one if needed
    accessKey =
      website.accessKeys[0] ||
      (await prisma.accessKey.create({
        data: {
          key: generateAccessKey(),
          websiteId: website.id,
        },
      }));

    // Construct redirect URL with access key
    const redirectUrl = new URL(wpRedirect);
    redirectUrl.searchParams.set("access_key", accessKey.key);

    return NextResponse.json({
      redirectUrl: redirectUrl.toString(),
      accessKey: accessKey.key,
    });
  } catch (error) {
    console.error("Connection error:", error);
    return NextResponse.json(
      { error: "Failed to process connection" },
      { status: 500 }
    );
  }
}

function generateAccessKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

function extractWebsiteName(url: string): string {
  try {
    // Get the part between // and the next /
    const match = url.match(/\/\/(.*?)(?:\/|$)/);
    if (!match) return "My Website";

    // Get the domain without the TLD
    const domain = match[1].split(".")[0];

    // Capitalize first letter and replace hyphens/underscores with spaces
    return (
      domain.charAt(0).toUpperCase() + domain.slice(1).replace(/[-_]/g, " ")
    );
  } catch (error) {
    return "My Website";
  }
}
