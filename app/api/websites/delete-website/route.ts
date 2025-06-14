import { PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();
    console.log(`Deleting website with ID: ${id}`);

    // First check if website has an active subscription
    const website = await prisma.website.findUnique({
      where: { id },
      select: {
        active: true,
        plan: true,
      },
    });

    if (website?.active && website.plan.toLowerCase() !== "free") {
      return new Response(
        JSON.stringify({
          error: "Cannot delete website with active subscription",
          message:
            "Please cancel the subscription first before deleting this website.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    try {
      // First transaction: Delete dependent content
      await prisma.$transaction(
        async (tx) => {
          // Delete PopUpQuestions first
          await tx.popUpQuestion.deleteMany({
            where: { websiteId: id },
          });
          console.log("Deleted PopUpQuestions");

          // Delete AccessKeys
          await tx.accessKey.deleteMany({
            where: { websiteId: id },
          });
          console.log("Deleted AccessKeys");

          // Delete AI related content
          await tx.aiMessage.deleteMany({
            where: {
              thread: {
                websiteId: id,
              },
            },
          });
          console.log("Deleted AI Messages");

          await tx.aiThread.deleteMany({
            where: { websiteId: id },
          });
          console.log("Deleted AI Threads");

          // Delete Session data
          await tx.session.deleteMany({
            where: { websiteId: id },
          });
          console.log("Deleted Session data");

          // Delete VectorDbConfig
          await tx.vectorDbConfig.deleteMany({
            where: { websiteId: id },
          });
          console.log("Deleted VectorDbConfig");
        },
        {
          timeout: 20000, // 20 second timeout for first transaction
        }
      );
    } catch (err) {
      console.error("Error in first transaction (dependent content):", err);
      throw err;
    }

    try {
      // Second transaction: Delete Shopify content
      await prisma.$transaction(
        async (tx) => {
          // Delete any remaining Shopify content
          // Comments depend on blog posts
          await tx.shopifyComment.deleteMany({
            where: {
              post: {
                websiteId: id,
              },
            },
          });
          console.log("Deleted remaining Shopify comments");

          await tx.shopifyBlogPost.deleteMany({
            where: { websiteId: id },
          });
          console.log("Deleted remaining Shopify blog posts");

          await tx.shopifyBlog.deleteMany({
            where: { websiteId: id },
          });
          console.log("Deleted remaining Shopify blogs");

          // Delete product-related content
          await tx.shopifyReview.deleteMany({
            where: {
              product: {
                websiteId: id,
              },
            },
          });
          console.log("Deleted remaining Shopify reviews");

          await tx.shopifyMedia.deleteMany({
            where: {
              product: {
                websiteId: id,
              },
            },
          });
          console.log("Deleted remaining Shopify media");

          await tx.shopifyProductVariant.deleteMany({
            where: {
              product: {
                websiteId: id,
              },
            },
          });
          console.log("Deleted remaining Shopify product variants");

          // Delete ShopifyCollection (fix for constraint violation error)
          await tx.shopifyCollection.deleteMany({
            where: { websiteId: id },
          });
          console.log("Deleted Shopify collections");

          await tx.shopifyProduct.deleteMany({
            where: { websiteId: id },
          });
          console.log("Deleted remaining Shopify products");

          await tx.shopifyDiscount.deleteMany({
            where: { websiteId: id },
          });
          console.log("Deleted remaining Shopify discounts");

          await tx.shopifyPage.deleteMany({
            where: { websiteId: id },
          });
          console.log("Deleted remaining Shopify pages");

          // Delete ShopifyMetafield
          await tx.shopifyMetafield.deleteMany({
            where: { websiteId: id },
          });
          console.log("Deleted Shopify metafields");

          // Delete ShopifyReportLink
          await tx.shopifyReportLink.deleteMany({
            where: { websiteId: id },
          });
          console.log("Deleted Shopify report links");
        },
        {
          timeout: 20000, // 20 second timeout for second transaction
        }
      );
    } catch (err) {
      console.error("Error in second transaction (Shopify content):", err);
      throw err;
    }

    try {
      // Third transaction: Delete WordPress content
      await prisma.$transaction(
        async (tx) => {
          // Get all posts and products
          const posts = await tx.wordpressPost.findMany({
            where: { websiteId: id },
            select: { wpId: true },
          });
          const products = await tx.wordpressProduct.findMany({
            where: { websiteId: id },
            select: { wpId: true },
          });

          // First delete comments and reviews
          await tx.wordpressComment.deleteMany({
            where: {
              postId: { in: posts.map((p) => p.wpId) },
            },
          });
          console.log("Deleted WordPress comments");

          await tx.wordpressReview.deleteMany({
            where: {
              productId: { in: products.map((p) => p.wpId) },
            },
          });
          console.log("Deleted WordPress reviews");

          // Delete custom fields
          await tx.wordpressCustomField.deleteMany({
            where: { websiteId: id },
          });
          console.log("Deleted WordPress custom fields");

          // Delete categories, tags, media, authors
          await tx.wordpressCategory.deleteMany({ where: { websiteId: id } });
          console.log("Deleted WordPress categories");

          await tx.wordpressTag.deleteMany({ where: { websiteId: id } });
          console.log("Deleted WordPress tags");

          await tx.wordpressMedia.deleteMany({ where: { websiteId: id } });
          console.log("Deleted WordPress media");

          await tx.wordpressAuthor.deleteMany({ where: { websiteId: id } });
          console.log("Deleted WordPress authors");

          // Now delete the main content
          await tx.wordpressPost.deleteMany({ where: { websiteId: id } });
          console.log("Deleted WordPress posts");

          await tx.wordpressPage.deleteMany({ where: { websiteId: id } });
          console.log("Deleted WordPress pages");

          await tx.wordpressProduct.deleteMany({ where: { websiteId: id } });
          console.log("Deleted WordPress products");
        },
        {
          timeout: 20000, // 20 second timeout for WordPress content deletion
        }
      );
    } catch (err) {
      console.error("Error in third transaction (WordPress content):", err);
      throw err;
    }

    try {
      // Final transaction: Delete the website itself
      await prisma.$transaction(
        async (tx) => {
          // First update customers to remove default address references
          await tx.shopifyCustomer.updateMany({
            where: { websiteId: id },
            data: { defaultAddressId: null },
          });
          console.log("Removed default address references from customers");

          // Now delete addresses
          await tx.shopifyCustomerAddress.deleteMany({
            where: {
              customer: {
                websiteId: id,
              },
            },
          });
          console.log("Deleted Shopify customer addresses");

          // Delete Shopify customers
          await tx.shopifyCustomer.deleteMany({
            where: { websiteId: id },
          });
          console.log("Deleted Shopify customers");

          await tx.website.delete({
            where: { id },
          });
          console.log("Website deleted successfully");
        },
        {
          timeout: 15000, // 15 second timeout for final transaction
        }
      );
    } catch (err) {
      console.error("Error in final website deletion step:", err);
      throw err;
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error deleting website:", message);
    if (error instanceof Error && error.stack) {
      console.error("Stack trace:", error.stack);
    }

    return new Response(
      JSON.stringify({
        error: "Failed to delete website",
        details: message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
