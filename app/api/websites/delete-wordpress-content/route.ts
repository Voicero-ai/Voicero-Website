import { query } from '../../../../lib/db';

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { websiteId } = await request.json();

    // Delete dependent rows using ordered deletes
    // Delete comments tied to posts of this website
    await query(
      `DELETE wc FROM WordpressComment wc
       JOIN WordpressPost wp ON wc.postId = wp.wpId
       WHERE wp.websiteId = ?`,
      [websiteId]
    );
    console.log("Deleted WordPress comments");

    // Delete reviews tied to products of this website
    await query(
      `DELETE wr FROM WordpressReview wr
       JOIN WordpressProduct wprod ON wr.productId = wprod.wpId
       WHERE wprod.websiteId = ?`,
      [websiteId]
    );
    console.log("Deleted WordPress reviews");

    // Custom fields
    await query(`DELETE FROM WordpressCustomField WHERE websiteId = ?`, [
      websiteId,
    ]);
    console.log("Deleted WordPress custom fields");

    // Categories, tags, media, authors
    await query(`DELETE FROM WordpressCategory WHERE websiteId = ?`, [
      websiteId,
    ]);
    await query(`DELETE FROM WordpressTag WHERE websiteId = ?`, [websiteId]);
    await query(`DELETE FROM WordpressMedia WHERE websiteId = ?`, [websiteId]);
    await query(`DELETE FROM WordpressAuthor WHERE websiteId = ?`, [websiteId]);
    console.log("Deleted WordPress metadata");

    // Main content
    await query(`DELETE FROM WordpressPost WHERE websiteId = ?`, [websiteId]);
    console.log("Deleted WordPress posts");
    await query(`DELETE FROM WordpressPage WHERE websiteId = ?`, [websiteId]);
    console.log("Deleted WordPress pages");
    await query(`DELETE FROM WordpressProduct WHERE websiteId = ?`, [
      websiteId,
    ]);
    console.log("Deleted WordPress products");

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error deleting WordPress content:", message);

    return new Response(
      JSON.stringify({
        error: "Failed to delete WordPress content",
        details: message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
