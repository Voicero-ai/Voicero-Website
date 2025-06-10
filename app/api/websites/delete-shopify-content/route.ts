import { PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const { websiteId } = await request.json();

    await prisma.$transaction(async (tx) => {
      // Delete blog-related content first (comments depend on blog posts)
      await tx.shopifyComment.deleteMany({
        where: {
          post: {
            websiteId,
          },
        },
      });
      console.log("Deleted Shopify comments");

      await tx.shopifyBlogPost.deleteMany({
        where: { websiteId },
      });
      console.log("Deleted Shopify blog posts");

      await tx.shopifyBlog.deleteMany({
        where: { websiteId },
      });
      console.log("Deleted Shopify blogs");

      // Delete product-related content
      await tx.shopifyReview.deleteMany({
        where: {
          product: {
            websiteId,
          },
        },
      });
      console.log("Deleted Shopify reviews");

      await tx.shopifyMedia.deleteMany({
        where: {
          product: {
            websiteId,
          },
        },
      });
      console.log("Deleted Shopify media");

      await tx.shopifyProductVariant.deleteMany({
        where: {
          product: {
            websiteId,
          },
        },
      });
      console.log("Deleted Shopify product variants");

      await tx.shopifyProduct.deleteMany({
        where: { websiteId },
      });
      console.log("Deleted Shopify products");

      // Delete other content
      await tx.shopifyDiscount.deleteMany({
        where: { websiteId },
      });
      console.log("Deleted Shopify discounts");

      await tx.shopifyPage.deleteMany({
        where: { websiteId },
      });
      console.log("Deleted Shopify pages");
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error deleting Shopify content:", message);

    return new Response(
      JSON.stringify({
        error: "Failed to delete Shopify content",
        details: message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
