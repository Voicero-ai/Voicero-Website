import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orders, websiteId } = await request.json();

    if (!Array.isArray(orders) || !websiteId) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    // Check if the website exists and belongs to the user
    const website = await prisma.website.findFirst({
      where: {
        id: websiteId,
        userId: session.user.id,
      },
    });

    if (!website) {
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
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
    const currentShopifyIds = orders.map((order) => order.id);

    // Process all incoming orders
    const processOrders = orders.map(async (order: Order) => {
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
        const lineItemPromises = order.lineItems.edges.map(async (edge) => {
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
        });

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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating orders:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
