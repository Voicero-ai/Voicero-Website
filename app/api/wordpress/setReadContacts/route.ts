import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cors } from "../../../../lib/cors";
export const dynamic = "force-dynamic";

// Create a new PrismaClient instance or use the existing one
const prisma = new PrismaClient();

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  console.log("📝 setReadContacts API called");
  try {
    // Get the authorization header
    const authHeader = request.headers.get("authorization");
    console.log("🔑 Auth header present:", !!authHeader);

    if (!authHeader?.startsWith("Bearer ")) {
      console.log("❌ Invalid auth header format");
      return cors(
        request,
        NextResponse.json(
          { error: "Missing or invalid authorization header" },
          { status: 401 }
        )
      );
    }

    // Extract the access key
    const accessKey = authHeader.split(" ")[1];
    console.log("🔑 Access key extracted:", accessKey ? "✅" : "❌");

    if (!accessKey) {
      console.log("❌ No access key provided");
      return cors(
        request,
        NextResponse.json({ error: "No access key provided" }, { status: 401 })
      );
    }

    // Get request body
    const body = await request.json();
    const { id } = body;
    console.log("📦 Request body:", body);
    console.log("🆔 Contact ID:", id);

    // Validate required fields
    if (!id) {
      console.log("❌ Missing required field: id");
      return cors(
        request,
        NextResponse.json(
          { error: "Missing required field: id" },
          { status: 400 }
        )
      );
    }

    // First find the website ID using the access key
    console.log("🔍 Looking up access key in database");
    const accessKeyRecord = await prisma.accessKey.findUnique({
      where: {
        key: accessKey,
      },
      select: {
        websiteId: true,
      },
    });
    console.log("🔑 Access key record found:", !!accessKeyRecord);

    if (!accessKeyRecord) {
      console.log("❌ Invalid access key");
      return cors(
        request,
        NextResponse.json({ error: "Invalid access key" }, { status: 401 })
      );
    }

    console.log("🌐 Website ID:", accessKeyRecord.websiteId);

    // Find the contact to ensure it exists and belongs to the website owner
    console.log("🔍 Looking up contact");
    const contact = await prisma.contact.findFirst({
      where: {
        id,
        user: {
          websites: {
            some: {
              id: accessKeyRecord.websiteId,
            },
          },
        },
      },
    });
    console.log("📞 Contact found:", !!contact);

    if (!contact) {
      console.log("❌ Contact not found");
      return cors(
        request,
        NextResponse.json({ error: "Contact not found" }, { status: 404 })
      );
    }

    console.log("📞 Contact details:", {
      id: contact.id,
      currentReadStatus: contact.read,
    });

    // Check if contact is already marked as read
    if (contact.read === true) {
      console.log("ℹ️ Contact already marked as read");
      return cors(
        request,
        NextResponse.json({
          success: true,
          message: "Contact was already marked as read",
          contact: {
            id: contact.id,
            read: contact.read,
            unchanged: true,
          },
        })
      );
    }

    // Update the contact to mark as read
    console.log("✏️ Attempting to update contact read status");
    try {
      const updatedContact = await prisma.contact.update({
        where: {
          id,
        },
        data: {
          read: true,
        },
      });

      console.log("✅ Update operation completed");
      console.log("📞 Updated contact details:", {
        id: updatedContact.id,
        newReadStatus: updatedContact.read,
      });

      // Verify the update was successful
      if (!updatedContact || updatedContact.read !== true) {
        console.error("❌ Update verification failed:", {
          contactId: id,
          beforeUpdate: contact.read,
          afterUpdate: updatedContact.read,
        });

        return cors(
          request,
          NextResponse.json(
            {
              error: "Failed to mark contact as read",
              details: "The update operation did not change the read status",
            },
            { status: 500 }
          )
        );
      }

      console.log("✅ Update verified successfully");
      return cors(
        request,
        NextResponse.json({
          success: true,
          message: "Contact marked as read",
          contact: {
            id: updatedContact.id,
            read: updatedContact.read,
          },
        })
      );
    } catch (updateError) {
      console.error("❌ Prisma update error:", updateError);
      return cors(
        request,
        NextResponse.json(
          {
            error: "Failed to update contact",
            details:
              updateError instanceof Error
                ? updateError.message
                : String(updateError),
          },
          { status: 500 }
        )
      );
    }
  } catch (error) {
    console.error("❌ API Error:", error);
    return cors(
      request,
      NextResponse.json(
        {
          error: "Internal server error",
          details: error instanceof Error ? error.message : String(error),
        },
        { status: 500 }
      )
    );
  } finally {
    console.log("🏁 API call completed");
  }
}
