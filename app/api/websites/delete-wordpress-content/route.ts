import { PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const { websiteId } = await request.json();

    await prisma.$transaction(async (tx) => {
      // Get all posts and products
      const posts = await tx.wordpressPost.findMany({
        where: { websiteId },
        select: { wpId: true },
      });
      const products = await tx.wordpressProduct.findMany({
        where: { websiteId },
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
        where: { websiteId },
      });
      console.log("Deleted WordPress custom fields");

      // Delete categories, tags, media, authors
      await tx.wordpressCategory.deleteMany({ where: { websiteId } });
      await tx.wordpressTag.deleteMany({ where: { websiteId } });
      await tx.wordpressMedia.deleteMany({ where: { websiteId } });
      await tx.wordpressAuthor.deleteMany({ where: { websiteId } });
      console.log("Deleted WordPress metadata");

      // Now delete the main content
      await tx.wordpressPost.deleteMany({ where: { websiteId } });
      console.log("Deleted WordPress posts");

      await tx.wordpressPage.deleteMany({ where: { websiteId } });
      console.log("Deleted WordPress pages");

      await tx.wordpressProduct.deleteMany({ where: { websiteId } });
      console.log("Deleted WordPress products");
    });

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
