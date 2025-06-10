import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import prisma from "../../../lib/prisma";
import { authOptions } from "../../../lib/auth";

export const dynamic = "force-dynamic";

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
      select: {
        id: true,
        url: true,
        type: true,
        accessKeys: {
          select: {
            id: true,
            name: true,
            key: true,
            createdAt: true,
          },
        },
      },
    });

    return NextResponse.json(websites);
  } catch (error) {
    console.error("Error fetching access keys:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { websiteId, name } = await request.json();

    // Verify website belongs to user
    const website = await prisma.website.findFirst({
      where: {
        id: websiteId,
        userId: session.user.id,
      },
      include: {
        accessKeys: true,
      },
    });

    if (!website) {
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
    }

    if (website.accessKeys.length >= 5) {
      return NextResponse.json(
        { error: "Maximum number of keys reached" },
        { status: 400 }
      );
    }

    // Generate a random key
    const key = `vk_${Math.random()
      .toString(36)
      .substring(2, 15)}_${Math.random().toString(36).substring(2, 15)}`;

    const accessKey = await prisma.accessKey.create({
      data: {
        name: name || "Default",
        key,
        websiteId,
      },
    });

    return NextResponse.json(accessKey);
  } catch (error) {
    console.error("Error creating access key:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { keyId } = await request.json();

    // Verify the key belongs to a website owned by the user
    const accessKey = await prisma.accessKey.findFirst({
      where: {
        id: keyId,
        website: {
          userId: session.user.id,
        },
      },
    });

    if (!accessKey) {
      return NextResponse.json(
        { error: "Access key not found" },
        { status: 404 }
      );
    }

    await prisma.accessKey.delete({
      where: { id: keyId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting access key:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
