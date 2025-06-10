import { PrismaClient } from "@prisma/client";
import { Pinecone } from "@pinecone-database/pinecone";

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});
const index = pinecone.index(process.env.PINECONE_INDEX!);

export async function POST(request: Request) {
  try {
    console.log("Starting vector deletion process...");
    const { websiteId } = await request.json();
    console.log(`Processing website ID: ${websiteId}`);

    // Check vector config
    const vectorConfig = await prisma.vectorDbConfig.findUnique({
      where: { websiteId },
    });

    if (!vectorConfig) {
      console.log(`No vector configuration found for website ${websiteId}`);
      return Response.json({ success: true });
    }

    console.log("Vector config found, proceeding with deletion...");

    try {
      // Delete from default namespace
      console.log("Querying default namespace...");
      const defaultQuery = await index.query({
        vector: Array(3072).fill(0),
        topK: 100,
        filter: { websiteId: { $eq: websiteId } },
        includeMetadata: true,
      });

      if (defaultQuery.matches.length > 0) {
        console.log(`Found ${defaultQuery.matches.length} vectors to delete`);
        await index.deleteMany(defaultQuery.matches.map((m) => m.id));
        console.log(
          `Successfully deleted ${defaultQuery.matches.length} legacy vectors`
        );
      } else {
        console.log("No vectors found in default namespace");
      }

      // Try to delete from website namespace, but don't fail if it doesn't exist
      try {
        console.log(`Attempting to delete namespace ${websiteId}...`);
        await index.namespace(websiteId).deleteAll();
        console.log(`Successfully deleted vectors from namespace ${websiteId}`);
      } catch (namespaceError) {
        console.log(
          `No namespace found for ${websiteId} or already deleted:`,
          namespaceError
        );
      }

      // Delete vector config
      console.log("Deleting vector config from database...");
      await prisma.vectorDbConfig.delete({
        where: { websiteId },
      });
      console.log("Vector config deleted successfully");

      return Response.json({ success: true });
    } catch (vectorError) {
      console.error("Vector deletion error details:", vectorError);
      // Continue with vector config deletion even if vector deletion fails
      try {
        console.log(
          "Attempting to delete vector config after vector deletion failure..."
        );
        await prisma.vectorDbConfig.delete({
          where: { websiteId },
        });
        console.log(
          "Vector config deleted successfully despite vector deletion failure"
        );
        return Response.json({ success: true });
      } catch (configError) {
        console.error("Failed to delete vector config:", configError);
        throw configError;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Fatal error in delete-vectors route:", message);
    if (error instanceof Error && error.stack) {
      console.error("Stack trace:", error.stack);
    }

    return new Response(
      JSON.stringify({
        error: "Failed to delete vectors",
        details: message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
