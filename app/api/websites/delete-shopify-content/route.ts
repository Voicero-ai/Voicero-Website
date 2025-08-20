import { query } from '../../../../lib/db';

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { websiteId } = await request.json();

    // Emulate transactional deletes with ordered deletes to maintain FK integrity
    // Delete blog-related content first (comments depend on blog posts)
    await query(
      `DELETE sc FROM ShopifyComment sc
       JOIN ShopifyBlogPost sbp ON sc.postId = sbp.id
       WHERE sbp.websiteId = ?`,
      [websiteId]
    );
    console.log("Deleted Shopify comments");

    await query(`DELETE FROM ShopifyBlogPost WHERE websiteId = ?`, [websiteId]);
    console.log("Deleted Shopify blog posts");

    await query(`DELETE FROM ShopifyBlog WHERE websiteId = ?`, [websiteId]);
    console.log("Deleted Shopify blogs");

    // Delete product-related content
    await query(
      `DELETE sr FROM ShopifyReview sr
       JOIN ShopifyProduct sp ON sr.productId = sp.id
       WHERE sp.websiteId = ?`,
      [websiteId]
    );
    console.log("Deleted Shopify reviews");

    await query(
      `DELETE sm FROM ShopifyMedia sm
       JOIN ShopifyProduct sp ON sm.productId = sp.id
       WHERE sp.websiteId = ?`,
      [websiteId]
    );
    console.log("Deleted Shopify media");

    await query(
      `DELETE spv FROM ShopifyProductVariant spv
       JOIN ShopifyProduct sp ON spv.productId = sp.id
       WHERE sp.websiteId = ?`,
      [websiteId]
    );
    console.log("Deleted Shopify product variants");

    await query(`DELETE FROM ShopifyProduct WHERE websiteId = ?`, [websiteId]);
    console.log("Deleted Shopify products");

    // Delete other content
    await query(`DELETE FROM ShopifyDiscount WHERE websiteId = ?`, [websiteId]);
    console.log("Deleted Shopify discounts");

    await query(`DELETE FROM ShopifyPage WHERE websiteId = ?`, [websiteId]);
    console.log("Deleted Shopify pages");

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
