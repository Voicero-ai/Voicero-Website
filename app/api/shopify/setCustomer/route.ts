import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { cors } from "../../../../lib/cors";
import { query } from '../../../../lib/db';

export const dynamic = "force-dynamic";

// Using mysql2 via lib/db

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Enhanced system prompt for personalized customer interactions
const WELCOME_BACK_PROMPT = `You are a helpful, friendly AI shopping assistant for a Shopify store. 
The customer has returned to the store. Create a brief, personalized message (1-2 sentences) based on their data by starting with Welcome back, .

GOALS:
1. Make the customer feel welcomed and recognized
2. Gently guide them toward a purchase without being pushy
3. Focus on addressing the customer's specific needs based on their behavior

GUIDELINES:
- Keep messages short, friendly, and natural - sound like a helpful store assistant
- Be conversational but professional
- Don't use emojis or exclamation marks excessively
- If they have past orders, consider subtly reminding them (e.g. "Need to restock on [product]?")
- If they have tracking/shipping info, offer to help check order status
- If they've been browsing specific categories, reference those interests
- If they have items in cart, acknowledge that
- Use their first name if available, but don't overdo personalization

IMPORTANT: Analyze their previous conversation threads (if available) to understand their needs and interests.

FORMAT:
- Keep responses to 1-2 short sentences maximum
- Don't introduce yourself or explain that you're an AI
- Just provide the welcome message directly`;

// ---- Pre‑flight -------------------------------------------------
export async function OPTIONS(req: NextRequest) {
  return cors(req, new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest) {
  try {
    console.log("Received customer data request");

    // Get request headers
    const headersList = req.headers;
    const authorization = headersList.get("Authorization");

    // Parse request body
    const body = await req.json();
    const { shop, customer, source, timestamp } = body;

    // Log received data
    console.log("Shop:", shop);
    console.log("Source:", source);
    console.log("Timestamp:", timestamp);
    console.log("Customer data received:", JSON.stringify(customer, null, 2));

    // Validate required fields
    if (!shop) {
      return cors(
        req,
        NextResponse.json({ error: "Shop domain is required" }, { status: 400 })
      );
    }

    if (!customer) {
      return cors(
        req,
        NextResponse.json(
          { error: "Customer data is required" },
          { status: 400 }
        )
      );
    }

    // Find website by shop domain
    const websiteRows = (await query(
      `SELECT id, url, type FROM Website
       WHERE url LIKE CONCAT('%', ?, '%') AND (type = 'shopify' OR type = 'Shopify')
       LIMIT 1`,
      [shop]
    )) as any[];
    const website = websiteRows[0];

    if (!website) {
      console.log(`No website found with domain containing ${shop}`);
      return cors(
        req,
        NextResponse.json({ error: "Website not found" }, { status: 404 })
      );
    }

    console.log(`Found website: ${website.id} for shop: ${shop}`);

    // Extract customer ID and email from data
    const shopifyId = customer.id || "";
    const email = customer.email || "";

    if (!shopifyId && !email) {
      return cors(
        req,
        NextResponse.json(
          { error: "Customer ID or email is required" },
          { status: 400 }
        )
      );
    }

    // Try to find existing customer record
    let existingCustomer: any = null;
    let welcomeBackMessage = null;

    if (shopifyId) {
      const customerRows = (await query(
        `SELECT * FROM ShopifyCustomer WHERE websiteId = ? AND shopifyId = ? LIMIT 1`,
        [website.id, shopifyId.toString()]
      )) as any[];
      existingCustomer = customerRows[0] || null;
    }

    if (!existingCustomer && email) {
      const customerRowsByEmail = (await query(
        `SELECT * FROM ShopifyCustomer WHERE websiteId = ? AND email = ? LIMIT 1`,
        [website.id, email]
      )) as any[];
      existingCustomer = customerRowsByEmail[0] || null;
    }

    // Extract basic customer fields
    const customerData = {
      shopifyId: shopifyId.toString(),
      email: email,
      firstName: customer.firstName || customer.first_name || "",
      lastName: customer.lastName || customer.last_name || "",
      phone: customer.phone || "",
      acceptsMarketing:
        customer.acceptsMarketing || customer.accepts_marketing || false,
      tags: customer.tags || [],
      ordersCount: customer.orders_count || 0,
      totalSpent: parseFloat(customer.total_spent || "0"),
      customerData: JSON.stringify(customer),
      websiteId: website.id,
      updatedAt: new Date(),
    };

    // Process addresses if they exist
    const addresses = [];

    // Process default address if it exists
    if (customer.defaultAddress) {
      const defaultAddressData = {
        addressId: customer.defaultAddress.id?.toString(),
        firstName:
          customer.defaultAddress.first_name ||
          customer.defaultAddress.firstName ||
          "",
        lastName:
          customer.defaultAddress.last_name ||
          customer.defaultAddress.lastName ||
          "",
        address1: customer.defaultAddress.address1 || "",
        city: customer.defaultAddress.city || "",
        province: customer.defaultAddress.province || "",
        zip: customer.defaultAddress.zip || "",
        country: customer.defaultAddress.country || "",
        isDefault: true,
      };
      addresses.push(defaultAddressData);
    }

    // Process all addresses if they exist (from the GraphQL format)
    if (customer.addresses && customer.addresses.edges) {
      for (const edge of customer.addresses.edges) {
        if (edge.node) {
          const addr = edge.node;
          // Skip if this is the same as default address
          if (
            customer.defaultAddress &&
            addr.id === customer.defaultAddress.id
          ) {
            continue;
          }

          const addressData = {
            addressId: addr.id?.toString(),
            firstName: addr.first_name || addr.firstName || "",
            lastName: addr.last_name || addr.lastName || "",
            address1: addr.address1 || "",
            city: addr.city || "",
            province: addr.province || "",
            zip: addr.zip || "",
            country: addr.country || "",
            isDefault: false,
          };
          addresses.push(addressData);
        }
      }
    }

    // Process orders if they exist (from the GraphQL format)
    const orders: any[] = [];
    if (customer.orders && customer.orders.edges) {
      for (const edge of customer.orders.edges) {
        if (edge.node) {
          const order = edge.node;

          // Prepare line items
          const lineItems = [];
          if (order.lineItems && order.lineItems.edges) {
            for (const itemEdge of order.lineItems.edges) {
              if (itemEdge.node) {
                lineItems.push({
                  title: itemEdge.node.title || "",
                  quantity: itemEdge.node.quantity || 0,
                });
              }
            }
          }

          // Prepare fulfillments
          const fulfillments = [];
          if (order.fulfillments && order.fulfillments.length > 0) {
            for (const fulfillment of order.fulfillments) {
              fulfillments.push({
                trackingCompany: fulfillment.trackingCompany || "",
                trackingNumbers: fulfillment.trackingNumbers?.join(", ") || "",
                trackingUrls: fulfillment.trackingUrls?.join(", ") || "",
              });
            }
          }

          // Prepare shipping address
          let shippingAddress = null;
          if (order.shippingAddress) {
            shippingAddress = {
              address1: order.shippingAddress.address1 || "",
              city: order.shippingAddress.city || "",
              province: order.shippingAddress.province || "",
              country: order.shippingAddress.country || "",
              zip: order.shippingAddress.zip || "",
            };
          }

          // Create order object
          const orderData = {
            orderId: order.id?.toString(),
            orderNumber: order.orderNumber?.toString() || "",
            processedAt: order.processedAt ? new Date(order.processedAt) : null,
            fulfillmentStatus: order.fulfillmentStatus || "",
            financialStatus: order.financialStatus || "",
            totalAmount: order.totalPriceV2?.amount
              ? parseFloat(order.totalPriceV2.amount)
              : null,
            currencyCode: order.totalPriceV2?.currencyCode || "",
            lineItems: lineItems,
            fulfillments: fulfillments,
            shippingAddress: shippingAddress,
          };

          orders.push(orderData);
        }
      }
    }

    // Create or update customer record with nested data
    let result: any;

    if (existingCustomer) {
      console.log(`Updating existing customer: ${existingCustomer.id}`);

      // Check if welcome back message is needed (if more than 1 hour since last update)
      const hoursSinceLastUpdate =
        Math.abs(
          new Date().getTime() - new Date(existingCustomer.updatedAt).getTime()
        ) / 36e5;
      console.log(
        `Hours since last update: ${hoursSinceLastUpdate.toFixed(4)}`
      );

      // Use 1 hour threshold for welcome message
      const needsWelcomeMessage = hoursSinceLastUpdate > 1;

      if (needsWelcomeMessage) {
        console.log(
          `Customer has been away for ${hoursSinceLastUpdate.toFixed(
            2
          )} hours. Generating welcome back message.`
        );

        // Prepare data for AI to analyze
        const customerSummary = {
          customer: {
            firstName: customerData.firstName,
            lastName: customerData.lastName,
            email: customerData.email,
            ordersCount: customerData.ordersCount,
            totalSpent: customerData.totalSpent,
            tags: customerData.tags,
            lastVisit: hoursSinceLastUpdate.toFixed(2) + " hours ago",
          },
          addresses: addresses,
          orderHistory:
            existingCustomer.orders?.map((order: any) => ({
              orderNumber: order.orderNumber,
              date: order.processedAt,
              status: order.fulfillmentStatus,
              totalAmount: order.totalAmount,
              currency: order.currencyCode,
              items: order.lineItems?.map((item: any) => ({
                product: item.title,
                quantity: item.quantity,
              })),
              hasTracking: order.fulfillments?.some(
                (f: any) => f.trackingNumbers
              ),
            })) || [],
          conversations:
            existingCustomer.sessions?.flatMap(
              (session: any) =>
                session.threads?.flatMap((thread: any) =>
                  thread.messages?.map((msg: any) => ({
                    role: msg.role,
                    content: msg.content,
                    date: msg.createdAt,
                  }))
                ) || []
            ) || [],
        };

        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [
              { role: "system", content: WELCOME_BACK_PROMPT },
              {
                role: "user",
                content: `Customer Data: ${JSON.stringify(
                  customerSummary,
                  null,
                  2
                )}`,
              },
            ],
            temperature: 0.7,
          });

          welcomeBackMessage = completion.choices[0]?.message?.content || null;
          console.log("Generated welcome back message:", welcomeBackMessage);
        } catch (error) {
          console.error("Error generating welcome back message:", error);
        }
      } else {
        console.log(
          `Customer was active recently (${hoursSinceLastUpdate.toFixed(
            2
          )} hours ago). No welcome message needed.`
        );
      }

      // First clear the defaultAddressId to avoid constraint violations
      await query(
        `UPDATE ShopifyCustomer SET defaultAddressId = NULL, updatedAt = NOW() WHERE id = ?`,
        [existingCustomer.id]
      );

      // Handle address updates - delete old ones first if needed
      if (addresses.length > 0) {
        await query(`DELETE FROM ShopifyCustomerAddress WHERE customerId = ?`, [
          existingCustomer.id,
        ]);
      }

      // Update customer record
      await query(
        `UPDATE ShopifyCustomer SET
           shopifyId = ?, email = ?, firstName = ?, lastName = ?, phone = ?,
           acceptsMarketing = ?, tags = ?, ordersCount = ?, totalSpent = ?,
           customerData = ?, updatedAt = NOW()
         WHERE id = ?`,
        [
          customerData.shopifyId,
          customerData.email,
          customerData.firstName,
          customerData.lastName,
          customerData.phone,
          customerData.acceptsMarketing,
          JSON.stringify(customerData.tags || []),
          customerData.ordersCount,
          customerData.totalSpent,
          customerData.customerData,
          existingCustomer.id,
        ]
      );
      // Insert new addresses
      for (const addr of addresses) {
        await query(
          `INSERT INTO ShopifyCustomerAddress (
             id, addressId, customerId, firstName, lastName, address1,
             city, province, zip, country, isDefault
           ) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            addr.addressId || null,
            existingCustomer.id,
            addr.firstName || null,
            addr.lastName || null,
            addr.address1 || null,
            addr.city || null,
            addr.province || null,
            addr.zip || null,
            addr.country || null,
            !!addr.isDefault,
          ]
        );
      }
      result = { id: existingCustomer.id };

      // Update orders separately since they have nested relationships
      if (orders.length > 0) {
        // Process each order individually instead of bulk deleting
        for (const orderData of orders) {
          const { lineItems, fulfillments, shippingAddress, ...orderFields } =
            orderData;

          // Check if order already exists
          const existingOrderRows = orderData.orderId
            ? ((await query(
                `SELECT id FROM ShopifyCustomerOrder WHERE customerId = ? AND orderId = ? LIMIT 1`,
                [existingCustomer.id, orderData.orderId]
              )) as { id: string }[])
            : [];
          const existingOrder =
            existingOrderRows && existingOrderRows.length > 0
              ? existingOrderRows[0]
              : null;

          if (existingOrder) {
            // Delete related records first
            await query(
              `DELETE FROM ShopifyCustomerLineItem WHERE orderId = ?`,
              [existingOrder.id]
            );

            await query(
              `DELETE FROM ShopifyCustomerFulfillment WHERE orderId = ?`,
              [existingOrder.id]
            );

            // Update the existing order
            await query(
              `UPDATE ShopifyCustomerOrder SET
                 orderId = ?, orderNumber = ?, processedAt = ?,
                 fulfillmentStatus = ?, financialStatus = ?, totalAmount = ?,
                 currencyCode = ?, updatedAt = NOW()
               WHERE id = ?`,
              [
                orderFields.orderId || null,
                orderFields.orderNumber || null,
                orderFields.processedAt || null,
                orderFields.fulfillmentStatus || null,
                orderFields.financialStatus || null,
                orderFields.totalAmount || null,
                orderFields.currencyCode || null,
                existingOrder.id,
              ]
            );
            // Recreate line items
            for (const li of lineItems) {
              await query(
                `INSERT INTO ShopifyCustomerLineItem (id, orderId, title, quantity)
                 VALUES (UUID(), ?, ?, ?)`,
                [existingOrder.id, li.title || null, li.quantity || 0]
              );
            }
            // Recreate fulfillments
            for (const f of fulfillments) {
              await query(
                `INSERT INTO ShopifyCustomerFulfillment (
                   id, orderId, trackingCompany, trackingNumbers, trackingUrls
                 ) VALUES (UUID(), ?, ?, ?, ?)`,
                [
                  existingOrder.id,
                  f.trackingCompany || null,
                  f.trackingNumbers || null,
                  f.trackingUrls || null,
                ]
              );
            }

            // Handle shipping address with upsert to avoid unique constraint issues
            if (shippingAddress) {
              // First check if shipping address exists
              const existingShippingRows = (await query(
                `SELECT id FROM ShopifyCustomerShippingAddress WHERE orderId = ? LIMIT 1`,
                [existingOrder.id]
              )) as { id: string }[];
              const existingShippingAddress =
                existingShippingRows.length > 0
                  ? existingShippingRows[0]
                  : null;

              if (existingShippingAddress) {
                // Update existing shipping address
                await query(
                  `UPDATE ShopifyCustomerShippingAddress SET
                     address1 = ?, city = ?, province = ?, country = ?, zip = ?
                   WHERE orderId = ?`,
                  [
                    shippingAddress.address1 || null,
                    shippingAddress.city || null,
                    shippingAddress.province || null,
                    shippingAddress.country || null,
                    shippingAddress.zip || null,
                    existingOrder.id,
                  ]
                );
              } else {
                // Create new shipping address
                await query(
                  `INSERT INTO ShopifyCustomerShippingAddress (
                     id, orderId, address1, city, province, country, zip
                   ) VALUES (UUID(), ?, ?, ?, ?, ?, ?)`,
                  [
                    existingOrder.id,
                    shippingAddress.address1 || null,
                    shippingAddress.city || null,
                    shippingAddress.province || null,
                    shippingAddress.country || null,
                    shippingAddress.zip || null,
                  ]
                );
              }
            } else {
              // If no shipping address provided but one exists, delete it
              try {
                await query(
                  `DELETE FROM ShopifyCustomerShippingAddress WHERE orderId = ?`,
                  [existingOrder.id]
                );
              } catch (e) {
                // Ignore if no shipping address exists to delete
              }
            }
          } else {
            // Create new order if it doesn't exist
            const newOrderId = crypto.randomUUID();
            await query(
              `INSERT INTO ShopifyCustomerOrder (
                 id, orderId, orderNumber, customerId, processedAt, fulfillmentStatus,
                 financialStatus, totalAmount, currencyCode, createdAt, updatedAt
               ) VALUES (
                 ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW()
               )`,
              [
                newOrderId,
                orderFields.orderId || null,
                orderFields.orderNumber || null,
                existingCustomer.id,
                orderFields.processedAt || null,
                orderFields.fulfillmentStatus || null,
                orderFields.financialStatus || null,
                orderFields.totalAmount || null,
                orderFields.currencyCode || null,
              ]
            );
            for (const li of lineItems) {
              await query(
                `INSERT INTO ShopifyCustomerLineItem (id, orderId, title, quantity)
                 VALUES (UUID(), ?, ?, ?)`,
                [newOrderId, li.title || null, li.quantity || 0]
              );
            }
            for (const f of fulfillments) {
              await query(
                `INSERT INTO ShopifyCustomerFulfillment (
                   id, orderId, trackingCompany, trackingNumbers, trackingUrls
                 ) VALUES (UUID(), ?, ?, ?, ?)`,
                [
                  newOrderId,
                  f.trackingCompany || null,
                  f.trackingNumbers || null,
                  f.trackingUrls || null,
                ]
              );
            }
            if (shippingAddress) {
              await query(
                `INSERT INTO ShopifyCustomerShippingAddress (
                   id, orderId, address1, city, province, country, zip
                 ) VALUES (UUID(), ?, ?, ?, ?, ?, ?)`,
                [
                  newOrderId,
                  shippingAddress.address1 || null,
                  shippingAddress.city || null,
                  shippingAddress.province || null,
                  shippingAddress.country || null,
                  shippingAddress.zip || null,
                ]
              );
            }
          }
        }
      }

      // Check if active session exists for this customer
      const activeSessionRows = (await query(
        `SELECT id FROM Session
         WHERE websiteId = ? AND createdAt >= (NOW() - INTERVAL 24 HOUR)
         ORDER BY createdAt DESC
         LIMIT 1`,
        [website.id]
      )) as { id: string }[];
      const activeSession =
        activeSessionRows.length > 0 ? activeSessionRows[0] : null;

      // Link customer to recent session if found
      if (activeSession) {
        await query(`UPDATE Session SET shopifyCustomerId = ? WHERE id = ?`, [
          result.id,
          activeSession.id,
        ]);
        console.log(`Linked customer to active session: ${activeSession.id}`);
      }

      console.log("Customer updated successfully with associated data");
    } else {
      console.log("Creating new customer record");

      // Create customer with addresses
      const newCustomerId = crypto.randomUUID();
      await query(
        `INSERT INTO ShopifyCustomer (
           id, shopifyId, email, firstName, lastName, phone, acceptsMarketing,
           tags, ordersCount, totalSpent, createdAt, updatedAt, websiteId, customerData
         ) VALUES (
           ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?, ?
         )`,
        [
          newCustomerId,
          customerData.shopifyId,
          customerData.email,
          customerData.firstName,
          customerData.lastName,
          customerData.phone,
          customerData.acceptsMarketing,
          JSON.stringify(customerData.tags || []),
          customerData.ordersCount,
          customerData.totalSpent,
          website.id,
          customerData.customerData,
        ]
      );
      for (const addr of addresses) {
        await query(
          `INSERT INTO ShopifyCustomerAddress (
             id, addressId, customerId, firstName, lastName, address1,
             city, province, zip, country, isDefault
           ) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            addr.addressId || null,
            newCustomerId,
            addr.firstName || null,
            addr.lastName || null,
            addr.address1 || null,
            addr.city || null,
            addr.province || null,
            addr.zip || null,
            addr.country || null,
            !!addr.isDefault,
          ]
        );
      }
      result = { id: newCustomerId };

      // Create orders separately
      if (orders.length > 0) {
        for (const orderData of orders) {
          const { lineItems, fulfillments, shippingAddress, ...orderFields } =
            orderData;

          const newOrderId = crypto.randomUUID();
          await query(
            `INSERT INTO ShopifyCustomerOrder (
               id, orderId, orderNumber, customerId, processedAt, fulfillmentStatus,
               financialStatus, totalAmount, currencyCode, createdAt, updatedAt
             ) VALUES (
               ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW()
             )`,
            [
              newOrderId,
              orderFields.orderId || null,
              orderFields.orderNumber || null,
              result.id,
              orderFields.processedAt || null,
              orderFields.fulfillmentStatus || null,
              orderFields.financialStatus || null,
              orderFields.totalAmount || null,
              orderFields.currencyCode || null,
            ]
          );
          for (const li of lineItems) {
            await query(
              `INSERT INTO ShopifyCustomerLineItem (id, orderId, title, quantity)
               VALUES (UUID(), ?, ?, ?)`,
              [newOrderId, li.title || null, li.quantity || 0]
            );
          }
          for (const f of fulfillments) {
            await query(
              `INSERT INTO ShopifyCustomerFulfillment (
                 id, orderId, trackingCompany, trackingNumbers, trackingUrls
               ) VALUES (UUID(), ?, ?, ?, ?)`,
              [
                newOrderId,
                f.trackingCompany || null,
                f.trackingNumbers || null,
                f.trackingUrls || null,
              ]
            );
          }
          if (shippingAddress) {
            await query(
              `INSERT INTO ShopifyCustomerShippingAddress (
                 id, orderId, address1, city, province, country, zip
               ) VALUES (UUID(), ?, ?, ?, ?, ?, ?)`,
              [
                newOrderId,
                shippingAddress.address1 || null,
                shippingAddress.city || null,
                shippingAddress.province || null,
                shippingAddress.country || null,
                shippingAddress.zip || null,
              ]
            );
          }
        }
      }

      // Check if active session exists and link it
      const activeSessionRows2 = (await query(
        `SELECT id FROM Session
         WHERE websiteId = ? AND createdAt >= (NOW() - INTERVAL 24 HOUR)
         ORDER BY createdAt DESC
         LIMIT 1`,
        [website.id]
      )) as { id: string }[];
      const activeSession =
        activeSessionRows2.length > 0 ? activeSessionRows2[0] : null;

      // Link customer to recent session if found
      if (activeSession) {
        await query(`UPDATE Session SET shopifyCustomerId = ? WHERE id = ?`, [
          result.id,
          activeSession.id,
        ]);
        console.log(`Linked customer to active session: ${activeSession.id}`);
      }

      console.log("New customer created successfully with associated data");
    }

    // Update default address reference if needed
    if (addresses.length > 0) {
      const defaultAddressRows = (await query(
        `SELECT id FROM ShopifyCustomerAddress WHERE customerId = ? AND isDefault = TRUE LIMIT 1`,
        [result.id]
      )) as { id: string }[];
      const defaultAddress =
        defaultAddressRows.length > 0 ? defaultAddressRows[0] : null;

      if (defaultAddress) {
        await query(
          `UPDATE ShopifyCustomer SET defaultAddressId = ? WHERE id = ?`,
          [defaultAddress.id, result.id]
        );
      }
    }

    return cors(
      req,
      NextResponse.json({
        success: true,
        message: existingCustomer
          ? "Customer data updated"
          : "Customer data created",
        customerId: result.id,
        welcomeBackMessage,
      })
    );
  } catch (error) {
    console.error("Error in setCustomer API:", error);
    return cors(
      req,
      NextResponse.json({ error: "Internal server error" }, { status: 500 })
    );
  }
}
