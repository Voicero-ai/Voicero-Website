import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cors } from "@/lib/cors";

export const dynamic = "force-dynamic";

interface OrderLineItem {
  name: string;
  quantity: number;
  variant: {
    price: string;
    title: string;
  };
}

interface Order {
  id: string;
  name: string;
  createdAt: string;
  totalPriceSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  customer?: {
    email?: string;
    firstName?: string;
    lastName?: string;
  };
  displayFulfillmentStatus?: string;
  lineItems: {
    edges: {
      node: OrderLineItem;
    }[];
  };
}

interface OrderEdge {
  node: Order;
  cursor?: string;
}

export async function OPTIONS(request: NextRequest) {
  return cors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
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

    if (!accessKey) {
      return cors(
        request,
        NextResponse.json({ error: "No access key provided" }, { status: 401 })
      );
    }

    // Find the website ID using the access key
    const accessKeyRecord = await prisma.accessKey.findUnique({
      where: {
        key: accessKey,
      },
      select: {
        websiteId: true,
      },
    });

    if (!accessKeyRecord) {
      return cors(
        request,
        NextResponse.json({ error: "Invalid access key" }, { status: 401 })
      );
    }

    const websiteId = accessKeyRecord.websiteId;
    const body = await request.json();
    console.log("Received body:", JSON.stringify(body, null, 2));

    // Handle GraphQL-style nested structure
    let ordersData: Order[] = [];
    if (body.orders && body.orders.edges && Array.isArray(body.orders.edges)) {
      ordersData = body.orders.edges.map((edge: OrderEdge) => edge.node);
    } else if (Array.isArray(body.orders)) {
      ordersData = body.orders;
    } else {
      return cors(
        request,
        NextResponse.json(
          { error: "Invalid orders data structure" },
          { status: 400 }
        )
      );
    }

    if (ordersData.length === 0) {
      return cors(
        request,
        NextResponse.json({ success: true, message: "No orders to process" })
      );
    }

    // Check if the website exists
    const website = await prisma.website.findUnique({
      where: {
        id: websiteId,
      },
    });

    if (!website) {
      return cors(
        request,
        NextResponse.json({ error: "Website not found" }, { status: 404 })
      );
    }

    // Get current date minus 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get existing orders for the website
    const existingOrders = await prisma.shopifyOrder.findMany({
      where: {
        websiteId,
      },
      include: {
        lineItems: true,
      },
    });

    // Create a map of existing orders by shopifyId for quick lookup
    const existingOrdersMap = new Map();
    existingOrders.forEach((order) => {
      existingOrdersMap.set(order.shopifyId, order);
    });

    // Track new shopifyIds to determine which ones to delete
    const currentShopifyIds = ordersData.map((order) => order.id);

    // Process all incoming orders
    const processOrders = ordersData.map(async (order: Order) => {
      const existingOrder = existingOrdersMap.get(order.id);

      // Create or update order
      const createdOrUpdatedOrder = await prisma.shopifyOrder.upsert({
        where: {
          websiteId_shopifyId: {
            websiteId,
            shopifyId: order.id,
          },
        },
        update: {
          name: order.name,
          displayFulfillmentStatus: order.displayFulfillmentStatus || null,
          totalPriceAmount: order.totalPriceSet?.shopMoney?.amount || null,
          totalPriceCurrencyCode:
            order.totalPriceSet?.shopMoney?.currencyCode || null,
          customerEmail: order.customer?.email || null,
          customerFirstName: order.customer?.firstName || null,
          customerLastName: order.customer?.lastName || null,
        },
        create: {
          shopifyId: order.id,
          name: order.name,
          createdAt: new Date(order.createdAt),
          displayFulfillmentStatus: order.displayFulfillmentStatus || null,
          websiteId,
          totalPriceAmount: order.totalPriceSet?.shopMoney?.amount || null,
          totalPriceCurrencyCode:
            order.totalPriceSet?.shopMoney?.currencyCode || null,
          customerEmail: order.customer?.email || null,
          customerFirstName: order.customer?.firstName || null,
          customerLastName: order.customer?.lastName || null,
        },
      });

      // If it's an existing order, delete all line items to recreate them
      if (existingOrder) {
        await prisma.shopifyOrderLineItem.deleteMany({
          where: {
            orderId: existingOrder.id,
          },
        });
      }

      // Create line items for the order
      if (order.lineItems?.edges) {
        const lineItemPromises = order.lineItems.edges.map(
          async (edge: { node: OrderLineItem }) => {
            const item = edge.node;
            return prisma.shopifyOrderLineItem.create({
              data: {
                orderId: createdOrUpdatedOrder.id,
                name: item.name || null,
                quantity: item.quantity || null,
                variantTitle: item.variant?.title || null,
                variantPrice: item.variant?.price || null,
              },
            });
          }
        );

        await Promise.all(lineItemPromises);
      }
    });

    await Promise.all(processOrders);

    // Delete orders older than 30 days or that aren't in the current set
    await prisma.shopifyOrder.deleteMany({
      where: {
        websiteId,
        OR: [
          {
            createdAt: {
              lt: thirtyDaysAgo,
            },
          },
          {
            shopifyId: {
              notIn: currentShopifyIds,
            },
          },
        ],
      },
    });

    return cors(request, NextResponse.json({ success: true }));
  } catch (error) {
    console.error("Error updating orders:", error);
    return cors(
      request,
      NextResponse.json({ error: "Internal server error" }, { status: 500 })
    );
  }
}
