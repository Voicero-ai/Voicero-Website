import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // Get the session to verify the user is authenticated
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse the request body
    const { websiteId, contentId, contentType } = await request.json();

    // Validate required fields
    if (!websiteId) {
      return NextResponse.json(
        { error: "Website ID is required" },
        { status: 400 }
      );
    }

    if (!contentId) {
      return NextResponse.json(
        { error: "Content ID is required" },
        { status: 400 }
      );
    }

    if (
      !contentType ||
      !["product", "post", "page", "collection", "discount"].includes(
        contentType
      )
    ) {
      return NextResponse.json(
        { error: "Valid content type is required" },
        { status: 400 }
      );
    }

    // Verify the user owns the website
    const website = await prisma.website.findFirst({
      where: {
        id: websiteId,
        userId: session.user.id,
      },
    });

    if (!website) {
      return NextResponse.json(
        { error: "Website not found or you don't have permission" },
        { status: 404 }
      );
    }

    // Delete the content based on type
    let result;

    switch (contentType) {
      case "product":
        // Delete product
        result = await prisma.shopifyProduct.delete({
          where: {
            id: contentId,
            websiteId: websiteId,
          },
        });
        break;

      case "post":
        // Delete blog post
        result = await prisma.shopifyBlogPost.delete({
          where: {
            id: contentId,
            websiteId: websiteId,
          },
        });
        break;

      case "page":
        // Delete page
        result = await prisma.shopifyPage.delete({
          where: {
            id: contentId,
            websiteId: websiteId,
          },
        });
        break;

      case "collection":
        // Delete collection
        result = await prisma.shopifyCollection.delete({
          where: {
            id: contentId,
            websiteId: websiteId,
          },
        });
        break;

      case "discount":
        // Delete discount
        result = await prisma.shopifyDiscount.delete({
          where: {
            id: contentId,
            websiteId: websiteId,
          },
        });
        break;
    }

    return NextResponse.json({
      success: true,
      message: `${contentType} deleted successfully`,
    });
  } catch (error) {
    console.error("Error deleting content:", error);
    return NextResponse.json(
      { error: "Failed to delete content" },
      { status: 500 }
    );
  }
}
