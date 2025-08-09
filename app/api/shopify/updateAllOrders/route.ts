import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cors } from "@/lib/cors";
import { query } from "@/lib/db";

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

interface AccessKey {
  websiteId: string;
}

interface Website {
  id: string;
}

interface ShopifyOrder {
  id: string;
  shopifyId: string;
  name: string;
  createdAt: Date;
  displayFulfillmentStatus: string | null;
  websiteId: string;
  totalPriceAmount: string | null;
  totalPriceCurrencyCode: string | null;
  customerEmail: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
}

interface ShopifyOrderLineItem {
  id: string;
  orderId: string;
  name: string | null;
  quantity: number | null;
  variantTitle: string | null;
  variantPrice: string | null;
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
    const accessKeys = (await query(
      "SELECT websiteId FROM AccessKey WHERE `key` = ?",
      [accessKey]
    )) as AccessKey[];

    if (accessKeys.length === 0) {
      return cors(
        request,
        NextResponse.json({ error: "Invalid access key" }, { status: 401 })
      );
    }

    const websiteId = accessKeys[0].websiteId;
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
    const websites = (await query("SELECT id FROM Website WHERE id = ?", [
      websiteId,
    ])) as Website[];

    if (websites.length === 0) {
      return cors(
        request,
        NextResponse.json({ error: "Website not found" }, { status: 404 })
      );
    }

    // Get current date minus 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

    // Get existing orders for the website
    const existingOrders = (await query(
      "SELECT * FROM ShopifyOrder WHERE websiteId = ?",
      [websiteId]
    )) as ShopifyOrder[];

    // Get existing line items for these orders
    const existingOrderIds = existingOrders.map((order) => order.id);

    let existingLineItems: ShopifyOrderLineItem[] = [];
    if (existingOrderIds.length > 0) {
      const placeholders = existingOrderIds.map(() => "?").join(",");
      existingLineItems = (await query(
        `SELECT * FROM ShopifyOrderLineItem WHERE orderId IN (${placeholders})`,
        existingOrderIds
      )) as ShopifyOrderLineItem[];
    }

    // Create a map of existing orders by shopifyId for quick lookup
    const existingOrdersMap = new Map();
    existingOrders.forEach((order) => {
      existingOrdersMap.set(order.shopifyId, order);
    });

    // Track new shopifyIds to determine which ones to delete
    const currentShopifyIds = ordersData.map((order) => order.id);

    // Process all incoming orders
    for (const order of ordersData) {
      const existingOrder = existingOrdersMap.get(order.id);

      if (existingOrder) {
        // Update existing order
        await query(
          `UPDATE ShopifyOrder SET 
            name = ?,
            displayFulfillmentStatus = ?,
            totalPriceAmount = ?,
            totalPriceCurrencyCode = ?,
            customerEmail = ?,
            customerFirstName = ?,
            customerLastName = ?
          WHERE id = ?`,
          [
            order.name,
            order.displayFulfillmentStatus || null,
            order.totalPriceSet?.shopMoney?.amount || null,
            order.totalPriceSet?.shopMoney?.currencyCode || null,
            order.customer?.email || null,
            order.customer?.firstName || null,
            order.customer?.lastName || null,
            existingOrder.id,
          ]
        );

        // Delete existing line items for this order
        await query("DELETE FROM ShopifyOrderLineItem WHERE orderId = ?", [
          existingOrder.id,
        ]);

        // Create new line items
        if (order.lineItems?.edges) {
          for (const edge of order.lineItems.edges) {
            const item = edge.node;
            const lineItemId = crypto.randomUUID();
            await query(
              `INSERT INTO ShopifyOrderLineItem 
                (id, orderId, name, quantity, variantTitle, variantPrice) 
              VALUES (?, ?, ?, ?, ?, ?)`,
              [
                lineItemId,
                existingOrder.id,
                item.name || null,
                item.quantity || null,
                item.variant?.title || null,
                item.variant?.price || null,
              ]
            );
          }
        }
      } else {
        // Create new order with explicit UUID primary key
        const newOrderId = crypto.randomUUID();
        await query(
          `INSERT INTO ShopifyOrder 
            (id, shopifyId, name, createdAt, displayFulfillmentStatus, websiteId, 
            totalPriceAmount, totalPriceCurrencyCode, customerEmail, customerFirstName, customerLastName) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newOrderId,
            order.id,
            order.name,
            new Date(order.createdAt),
            order.displayFulfillmentStatus || null,
            websiteId,
            order.totalPriceSet?.shopMoney?.amount || null,
            order.totalPriceSet?.shopMoney?.currencyCode || null,
            order.customer?.email || null,
            order.customer?.firstName || null,
            order.customer?.lastName || null,
          ]
        );

        // Create line items for the new order
        if (order.lineItems?.edges) {
          for (const edge of order.lineItems.edges) {
            const item = edge.node;
            const lineItemId = crypto.randomUUID();
            await query(
              `INSERT INTO ShopifyOrderLineItem 
                (id, orderId, name, quantity, variantTitle, variantPrice) 
              VALUES (?, ?, ?, ?, ?, ?)`,
              [
                lineItemId,
                newOrderId,
                item.name || null,
                item.quantity || null,
                item.variant?.title || null,
                item.variant?.price || null,
              ]
            );
          }
        }
      }
    }

    // Delete orders older than 30 days
    await query(
      "DELETE FROM ShopifyOrder WHERE websiteId = ? AND createdAt < ?",
      [websiteId, thirtyDaysAgoISO]
    );

    // Delete orders that aren't in the current set
    if (currentShopifyIds.length > 0) {
      const placeholders = currentShopifyIds.map(() => "?").join(",");
      await query(
        `DELETE FROM ShopifyOrder WHERE websiteId = ? AND shopifyId NOT IN (${placeholders})`,
        [websiteId, ...currentShopifyIds]
      );
    }

    return cors(request, NextResponse.json({ success: true }));
  } catch (error) {
    console.error("Error updating orders:", error);
    return cors(
      request,
      NextResponse.json({ error: "Internal server error" }, { status: 500 })
    );
  }
}
