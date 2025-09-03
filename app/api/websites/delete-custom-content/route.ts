import { query } from "../../../../lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { websiteId } = await request.json();

    // Delete Custom website content - both CustomPage and legacy Page tables
    await query(`DELETE FROM CustomPage WHERE websiteId = ?`, [websiteId]);
    console.log("Deleted Custom pages");

    await query(`DELETE FROM Page WHERE websiteId = ?`, [websiteId]);
    console.log("Deleted legacy Custom pages");

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error deleting Custom content:", message);

    return new Response(
      JSON.stringify({
        error: "Failed to delete Custom content",
        details: message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
