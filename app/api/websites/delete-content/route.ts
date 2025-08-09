import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/auth";
import { query } from "@/lib/db";

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
    const websites = (await query(
      `SELECT id FROM Website WHERE id = ? AND userId = ? LIMIT 1`,
      [websiteId, session.user.id]
    )) as { id: string }[];
    const website = websites.length > 0 ? websites[0] : null;

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
        await query(
          `DELETE FROM ShopifyProduct WHERE id = ? AND websiteId = ?`,
          [contentId, websiteId]
        );
        break;

      case "post":
        // Delete blog post
        await query(
          `DELETE FROM ShopifyBlogPost WHERE id = ? AND websiteId = ?`,
          [contentId, websiteId]
        );
        break;

      case "page":
        // Delete page
        await query(`DELETE FROM ShopifyPage WHERE id = ? AND websiteId = ?`, [
          contentId,
          websiteId,
        ]);
        break;

      case "collection":
        // Delete collection
        await query(
          `DELETE FROM ShopifyCollection WHERE id = ? AND websiteId = ?`,
          [contentId, websiteId]
        );
        break;

      case "discount":
        // Delete discount
        await query(
          `DELETE FROM ShopifyDiscount WHERE id = ? AND websiteId = ?`,
          [contentId, websiteId]
        );
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
