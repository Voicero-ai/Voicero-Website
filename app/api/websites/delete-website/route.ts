import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Using mysql2 via lib/db

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();
    console.log(`Deleting website with ID: ${id}`);

    // First check if website has an active subscription
    const rows = (await query(
      `SELECT active, plan FROM Website WHERE id = ? LIMIT 1`,
      [id]
    )) as { active: number; plan: string | null }[];
    const website = rows.length > 0 ? rows[0] : null;

    // Only allow Free and Beta plans to be deleted
    if (website?.active) {
      const plan = website.plan || "";
      // Case insensitive comparison - allow empty, Free or Beta plans
      const lowerPlan = plan.toLowerCase();
      if (lowerPlan !== "" && lowerPlan !== "free" && lowerPlan !== "beta") {
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
    }

    try {
      // First transaction: Delete dependent content
      await query(`DELETE FROM PopUpQuestion WHERE websiteId = ?`, [id]);
      await query(`DELETE FROM AccessKey WHERE websiteId = ?`, [id]);
      await query(
        `DELETE am FROM AiMessage am
         JOIN AiThread at ON at.id = am.threadId
         WHERE at.websiteId = ?`,
        [id]
      );
      await query(`DELETE FROM AiThread WHERE websiteId = ?`, [id]);
      await query(`DELETE FROM Session WHERE websiteId = ?`, [id]);
      await query(`DELETE FROM VectorDbConfig WHERE websiteId = ?`, [id]);
      console.log("Deleted dependent content");
    } catch (err) {
      console.error("Error in first transaction (dependent content):", err);
      throw err;
    }

    try {
      // Second transaction: Delete Shopify content
      await query(
        `DELETE sc FROM ShopifyComment sc
         JOIN ShopifyBlogPost sbp ON sbp.id = sc.postId
         WHERE sbp.websiteId = ?`,
        [id]
      );
      await query(`DELETE FROM ShopifyBlogPost WHERE websiteId = ?`, [id]);
      await query(`DELETE FROM ShopifyBlog WHERE websiteId = ?`, [id]);
      await query(
        `DELETE sr FROM ShopifyReview sr
         JOIN ShopifyProduct sp ON sp.id = sr.productId
         WHERE sp.websiteId = ?`,
        [id]
      );
      await query(
        `DELETE sm FROM ShopifyMedia sm
         JOIN ShopifyProduct sp ON sp.id = sm.productId
         WHERE sp.websiteId = ?`,
        [id]
      );
      await query(
        `DELETE spv FROM ShopifyProductVariant spv
         JOIN ShopifyProduct sp ON sp.id = spv.productId
         WHERE sp.websiteId = ?`,
        [id]
      );
      await query(`DELETE FROM ShopifyCollection WHERE websiteId = ?`, [id]);
      await query(`DELETE FROM ShopifyProduct WHERE websiteId = ?`, [id]);
      await query(`DELETE FROM ShopifyDiscount WHERE websiteId = ?`, [id]);
      await query(`DELETE FROM ShopifyPage WHERE websiteId = ?`, [id]);
      await query(`DELETE FROM ShopifyMetafield WHERE websiteId = ?`, [id]);
      await query(`DELETE FROM ShopifyReportLink WHERE websiteId = ?`, [id]);
      console.log("Deleted Shopify content");
    } catch (err) {
      console.error("Error in second transaction (Shopify content):", err);
      throw err;
    }

    try {
      // Third transaction: Delete WordPress content
      await query(
        `DELETE wc FROM WordpressComment wc
         JOIN WordpressPost wp ON wp.wpId = wc.postId
         WHERE wp.websiteId = ?`,
        [id]
      );
      await query(
        `DELETE wr FROM WordpressReview wr
         JOIN WordpressProduct wpp ON wpp.wpId = wr.productId
         WHERE wpp.websiteId = ?`,
        [id]
      );
      await query(`DELETE FROM WordpressCustomField WHERE websiteId = ?`, [id]);
      await query(`DELETE FROM WordpressCategory WHERE websiteId = ?`, [id]);
      await query(`DELETE FROM WordpressTag WHERE websiteId = ?`, [id]);
      await query(`DELETE FROM WordpressMedia WHERE websiteId = ?`, [id]);
      await query(`DELETE FROM WordpressAuthor WHERE websiteId = ?`, [id]);
      await query(`DELETE FROM WordpressPost WHERE websiteId = ?`, [id]);
      await query(`DELETE FROM WordpressPage WHERE websiteId = ?`, [id]);
      await query(`DELETE FROM WordpressProduct WHERE websiteId = ?`, [id]);
      console.log("Deleted WordPress content");
    } catch (err) {
      console.error("Error in third transaction (WordPress content):", err);
      throw err;
    }

    try {
      // Final transaction: Delete the website itself
      await query(
        `UPDATE ShopifyCustomer SET defaultAddressId = NULL WHERE websiteId = ?`,
        [id]
      );
      await query(
        `DELETE sca FROM ShopifyCustomerAddress sca
         JOIN ShopifyCustomer sc ON sc.id = sca.customerId
         WHERE sc.websiteId = ?`,
        [id]
      );
      await query(`DELETE FROM ShopifyCustomer WHERE websiteId = ?`, [id]);
      await query(`DELETE FROM Website WHERE id = ?`, [id]);
      console.log("Website deleted successfully");
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
