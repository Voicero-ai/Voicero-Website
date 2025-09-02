import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { cors } from "../../../../lib/cors";
import { query } from "../../../../lib/db";

export const dynamic = "force-dynamic";

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
    console.log("Auth header received:", authorization);

    // Extract access key from Authorization header
    let accessKey = null;
    if (authorization) {
      // Authorization header format: "Bearer <access_key>"
      const match = authorization.match(/Bearer\s+(\S+)/);
      if (match && match[1]) {
        accessKey = match[1];
        console.log(`Access key from header: ${accessKey.substring(0, 10)}...`);
      } else {
        console.log("Could not extract access key from Authorization header");
      }
    } else {
      console.log("No Authorization header found");
    }

    if (!accessKey) {
      return cors(
        req,
        NextResponse.json(
          { error: "Authorization header with access key is required" },
          { status: 401 }
        )
      );
    }

    // Find access key record first using MySQL query
    const accessKeyResults = await query(
      `SELECT ak.*, w.id as websiteId, w.name as websiteName, w.url as websiteUrl 
       FROM AccessKey ak 
       JOIN Website w ON ak.websiteId = w.id 
       WHERE ak.key = ?`,
      [accessKey]
    );

    if (!accessKeyResults || accessKeyResults.length === 0) {
      console.log(`No website found with the provided access key`);
      return cors(
        req,
        NextResponse.json({ error: "Website not found" }, { status: 404 })
      );
    }

    const website = {
      id: accessKeyResults[0].websiteId,
      name: accessKeyResults[0].websiteName,
      url: accessKeyResults[0].websiteUrl,
    };
    console.log(`Found website: ${website.id}`);

    // Parse request body
    const body = await req.json();
    const { customer, source, timestamp } = body;

    // Log received data
    console.log("Source:", source);
    console.log("Timestamp:", timestamp);
    console.log("Customer data received:", JSON.stringify(customer, null, 2));

    if (!customer) {
      return cors(
        req,
        NextResponse.json(
          { error: "Customer data is required" },
          { status: 400 }
        )
      );
    }

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

    // Try to find existing customer record using direct MySQL query
    let existingCustomer = null;
    let welcomeBackMessage = null;

    if (shopifyId) {
      const customerResults = await query(
        `SELECT * FROM ShopifyCustomer WHERE websiteId = ? AND shopifyId = ?`,
        [website.id, shopifyId.toString()]
      );

      if (customerResults && customerResults.length > 0) {
        existingCustomer = customerResults[0];

        // Get customer addresses
        const addressesResults = await query(
          `SELECT * FROM ShopifyCustomerAddress WHERE customerId = ?`,
          [existingCustomer.id]
        );
        existingCustomer.addresses = addressesResults || [];

        // Get customer orders
        const ordersResults = await query(
          `SELECT * FROM ShopifyCustomerOrder WHERE customerId = ?`,
          [existingCustomer.id]
        );

        if (ordersResults && ordersResults.length > 0) {
          existingCustomer.orders = [];

          for (const order of ordersResults) {
            // Get line items for each order
            const lineItemsResults = await query(
              `SELECT * FROM ShopifyCustomerOrderLineItem WHERE orderId = ?`,
              [order.id]
            );
            order.lineItems = lineItemsResults || [];

            // Get fulfillments for each order
            const fulfillmentsResults = await query(
              `SELECT * FROM ShopifyCustomerOrderFulfillment WHERE orderId = ?`,
              [order.id]
            );
            order.fulfillments = fulfillmentsResults || [];

            // Get shipping address for each order
            const shippingAddressResults = await query(
              `SELECT * FROM ShopifyCustomerOrderShippingAddress WHERE orderId = ?`,
              [order.id]
            );
            order.shippingAddress =
              shippingAddressResults.length > 0
                ? shippingAddressResults[0]
                : null;

            existingCustomer.orders.push(order);
          }
        } else {
          existingCustomer.orders = [];
        }

        // Get customer sessions and associated messages
        const sessionsResults = await query(
          `SELECT s.* FROM Session s WHERE s.shopifyCustomerId = ?`,
          [existingCustomer.id]
        );

        existingCustomer.sessions = [];

        if (sessionsResults && sessionsResults.length > 0) {
          for (const session of sessionsResults) {
            // Get threads for each session
            const threadsResults = await query(
              `SELECT t.* FROM Thread t WHERE t.sessionId = ?`,
              [session.id]
            );

            session.threads = [];

            if (threadsResults && threadsResults.length > 0) {
              for (const thread of threadsResults) {
                // Get messages for each thread
                const messagesResults = await query(
                  `SELECT m.* FROM Message m WHERE m.threadId = ?`,
                  [thread.id]
                );

                thread.messages = messagesResults || [];
                session.threads.push(thread);
              }
            }

            existingCustomer.sessions.push(session);
          }
        }
      }
    }

    // If no customer found by shopifyId, try with email
    if (!existingCustomer && email) {
      const customerResults = await query(
        `SELECT * FROM ShopifyCustomer WHERE websiteId = ? AND email = ?`,
        [website.id, email]
      );

      if (customerResults && customerResults.length > 0) {
        existingCustomer = customerResults[0];

        // Fetch the same data as above for email-based customer lookup
        // Get customer addresses
        const addressesResults = await query(
          `SELECT * FROM ShopifyCustomerAddress WHERE customerId = ?`,
          [existingCustomer.id]
        );
        existingCustomer.addresses = addressesResults || [];

        // Get customer orders with line items, fulfillments, and shipping address
        const ordersResults = await query(
          `SELECT * FROM ShopifyCustomerOrder WHERE customerId = ?`,
          [existingCustomer.id]
        );

        if (ordersResults && ordersResults.length > 0) {
          existingCustomer.orders = [];

          for (const order of ordersResults) {
            // Get line items for each order
            const lineItemsResults = await query(
              `SELECT * FROM ShopifyCustomerOrderLineItem WHERE orderId = ?`,
              [order.id]
            );
            order.lineItems = lineItemsResults || [];

            // Get fulfillments for each order
            const fulfillmentsResults = await query(
              `SELECT * FROM ShopifyCustomerOrderFulfillment WHERE orderId = ?`,
              [order.id]
            );
            order.fulfillments = fulfillmentsResults || [];

            // Get shipping address for each order
            const shippingAddressResults = await query(
              `SELECT * FROM ShopifyCustomerOrderShippingAddress WHERE orderId = ?`,
              [order.id]
            );
            order.shippingAddress =
              shippingAddressResults.length > 0
                ? shippingAddressResults[0]
                : null;

            existingCustomer.orders.push(order);
          }
        } else {
          existingCustomer.orders = [];
        }

        // Get customer sessions and associated threads/messages
        const sessionsResults = await query(
          `SELECT s.* FROM Session s WHERE s.shopifyCustomerId = ?`,
          [existingCustomer.id]
        );

        existingCustomer.sessions = [];

        if (sessionsResults && sessionsResults.length > 0) {
          for (const session of sessionsResults) {
            // Get threads for each session
            const threadsResults = await query(
              `SELECT t.* FROM Thread t WHERE t.sessionId = ?`,
              [session.id]
            );

            session.threads = [];

            if (threadsResults && threadsResults.length > 0) {
              for (const thread of threadsResults) {
                // Get messages for each thread
                const messagesResults = await query(
                  `SELECT m.* FROM Message m WHERE m.threadId = ?`,
                  [thread.id]
                );

                thread.messages = messagesResults || [];
                session.threads.push(thread);
              }
            }

            existingCustomer.sessions.push(session);
          }
        }
      }
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
      tags: JSON.stringify(customer.tags || []),
      ordersCount: customer.orders_count || 0,
      totalSpent: parseFloat(customer.total_spent || "0"),
      customerData: JSON.stringify({
        ...customer,
        source: source || "unknown",
      }),
      websiteId: website.id,
      updatedAt: new Date(),
    };

    // Determine customer type based on source
    const isWooCommerce = source === "woocommerce";
    const customerType = isWooCommerce ? "woocommerce" : "shopify";
    console.log(`Processing ${customerType} customer`);

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
    const orders = [];
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
            lineItems,
            fulfillments,
            shippingAddress,
          };

          orders.push(orderData);
        }
      }
    }

    // Create or update customer record with nested data
    let result: any = null;

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
        `UPDATE ShopifyCustomer SET defaultAddressId = NULL WHERE id = ?`,
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
          shopifyId = ?,
          email = ?,
          firstName = ?,
          lastName = ?,
          phone = ?,
          acceptsMarketing = ?,
          tags = ?,
          ordersCount = ?,
          totalSpent = ?,
          customerData = ?,
          updatedAt = ?
         WHERE id = ?`,
        [
          customerData.shopifyId,
          customerData.email,
          customerData.firstName,
          customerData.lastName,
          customerData.phone,
          customerData.acceptsMarketing ? 1 : 0,
          customerData.tags,
          customerData.ordersCount,
          customerData.totalSpent,
          customerData.customerData,
          new Date(),
          existingCustomer.id,
        ]
      );

      // Insert new addresses
      for (const address of addresses) {
        await query(
          `INSERT INTO ShopifyCustomerAddress (
            customerId, addressId, firstName, lastName, address1, 
            city, province, zip, country, isDefault
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            existingCustomer.id,
            address.addressId,
            address.firstName,
            address.lastName,
            address.address1,
            address.city,
            address.province,
            address.zip,
            address.country,
            address.isDefault ? 1 : 0,
          ]
        );
      }

      // Update orders separately since they have nested relationships
      if (orders.length > 0) {
        // Get all order IDs
        const existingOrderResults = await query(
          `SELECT id FROM ShopifyCustomerOrder WHERE customerId = ?`,
          [existingCustomer.id]
        );

        // Delete existing orders
        if (existingOrderResults && existingOrderResults.length > 0) {
          for (const orderRecord of existingOrderResults) {
            // Delete line items
            await query(
              `DELETE FROM ShopifyCustomerOrderLineItem WHERE orderId = ?`,
              [orderRecord.id]
            );

            // Delete fulfillments
            await query(
              `DELETE FROM ShopifyCustomerOrderFulfillment WHERE orderId = ?`,
              [orderRecord.id]
            );

            // Delete shipping address
            await query(
              `DELETE FROM ShopifyCustomerOrderShippingAddress WHERE orderId = ?`,
              [orderRecord.id]
            );
          }

          // Delete the orders themselves
          await query(`DELETE FROM ShopifyCustomerOrder WHERE customerId = ?`, [
            existingCustomer.id,
          ]);
        }

        // Create new orders
        for (const orderData of orders) {
          const { lineItems, fulfillments, shippingAddress, ...orderFields } =
            orderData;

          // Insert order record
          const [orderResult] = await query(
            `INSERT INTO ShopifyCustomerOrder (
              customerId, orderId, orderNumber, processedAt, 
              fulfillmentStatus, financialStatus, totalAmount, currencyCode
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              existingCustomer.id,
              orderFields.orderId,
              orderFields.orderNumber,
              orderFields.processedAt,
              orderFields.fulfillmentStatus,
              orderFields.financialStatus,
              orderFields.totalAmount,
              orderFields.currencyCode,
            ]
          );

          const newOrderId = orderResult.insertId;

          // Insert line items
          if (lineItems && lineItems.length > 0) {
            for (const item of lineItems) {
              await query(
                `INSERT INTO ShopifyCustomerOrderLineItem (
                  orderId, title, quantity
                ) VALUES (?, ?, ?)`,
                [newOrderId, item.title, item.quantity]
              );
            }
          }

          // Insert fulfillments
          if (fulfillments && fulfillments.length > 0) {
            for (const fulfillment of fulfillments) {
              await query(
                `INSERT INTO ShopifyCustomerOrderFulfillment (
                  orderId, trackingCompany, trackingNumbers, trackingUrls
                ) VALUES (?, ?, ?, ?)`,
                [
                  newOrderId,
                  fulfillment.trackingCompany,
                  fulfillment.trackingNumbers,
                  fulfillment.trackingUrls,
                ]
              );
            }
          }

          // Insert shipping address
          if (shippingAddress) {
            await query(
              `INSERT INTO ShopifyCustomerOrderShippingAddress (
                orderId, address1, city, province, country, zip
              ) VALUES (?, ?, ?, ?, ?, ?)`,
              [
                newOrderId,
                shippingAddress.address1,
                shippingAddress.city,
                shippingAddress.province,
                shippingAddress.country,
                shippingAddress.zip,
              ]
            );
          }
        }
      }

      // Check if active session exists for this customer
      const activeSessionResults = await query(
        `SELECT * FROM Session 
         WHERE websiteId = ? 
         AND createdAt >= ? 
         ORDER BY createdAt DESC 
         LIMIT 1`,
        [website.id, new Date(Date.now() - 24 * 60 * 60 * 1000)]
      );

      // Link customer to recent session if found
      if (activeSessionResults && activeSessionResults.length > 0) {
        const activeSession = activeSessionResults[0];
        await query(`UPDATE Session SET shopifyCustomerId = ? WHERE id = ?`, [
          existingCustomer.id,
          activeSession.id,
        ]);
        console.log(`Linked customer to active session: ${activeSession.id}`);
      }

      result = { id: existingCustomer.id };
      console.log("Customer updated successfully with associated data");
    } else {
      console.log("Creating new customer record");

      // Create customer
      const [customerResult] = await query(
        `INSERT INTO ShopifyCustomer (
          websiteId, shopifyId, email, firstName, lastName, 
          phone, acceptsMarketing, tags, ordersCount, 
          totalSpent, customerData, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          website.id,
          customerData.shopifyId,
          customerData.email,
          customerData.firstName,
          customerData.lastName,
          customerData.phone,
          customerData.acceptsMarketing ? 1 : 0,
          customerData.tags,
          customerData.ordersCount,
          customerData.totalSpent,
          customerData.customerData,
          new Date(),
        ]
      );

      const newCustomerId = customerResult.insertId;

      // Insert addresses
      for (const address of addresses) {
        await query(
          `INSERT INTO ShopifyCustomerAddress (
            customerId, addressId, firstName, lastName, address1, 
            city, province, zip, country, isDefault
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newCustomerId,
            address.addressId,
            address.firstName,
            address.lastName,
            address.address1,
            address.city,
            address.province,
            address.zip,
            address.country,
            address.isDefault ? 1 : 0,
          ]
        );
      }

      // Create orders separately
      if (orders.length > 0) {
        for (const orderData of orders) {
          const { lineItems, fulfillments, shippingAddress, ...orderFields } =
            orderData;

          // Insert order record
          const [orderResult] = await query(
            `INSERT INTO ShopifyCustomerOrder (
              customerId, orderId, orderNumber, processedAt, 
              fulfillmentStatus, financialStatus, totalAmount, currencyCode
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              newCustomerId,
              orderFields.orderId,
              orderFields.orderNumber,
              orderFields.processedAt,
              orderFields.fulfillmentStatus,
              orderFields.financialStatus,
              orderFields.totalAmount,
              orderFields.currencyCode,
            ]
          );

          const newOrderId = orderResult.insertId;

          // Insert line items
          if (lineItems && lineItems.length > 0) {
            for (const item of lineItems) {
              await query(
                `INSERT INTO ShopifyCustomerOrderLineItem (
                  orderId, title, quantity
                ) VALUES (?, ?, ?)`,
                [newOrderId, item.title, item.quantity]
              );
            }
          }

          // Insert fulfillments
          if (fulfillments && fulfillments.length > 0) {
            for (const fulfillment of fulfillments) {
              await query(
                `INSERT INTO ShopifyCustomerOrderFulfillment (
                  orderId, trackingCompany, trackingNumbers, trackingUrls
                ) VALUES (?, ?, ?, ?)`,
                [
                  newOrderId,
                  fulfillment.trackingCompany,
                  fulfillment.trackingNumbers,
                  fulfillment.trackingUrls,
                ]
              );
            }
          }

          // Insert shipping address
          if (shippingAddress) {
            await query(
              `INSERT INTO ShopifyCustomerOrderShippingAddress (
                orderId, address1, city, province, country, zip
              ) VALUES (?, ?, ?, ?, ?, ?)`,
              [
                newOrderId,
                shippingAddress.address1,
                shippingAddress.city,
                shippingAddress.province,
                shippingAddress.country,
                shippingAddress.zip,
              ]
            );
          }
        }
      }

      // Check if active session exists and link it
      const activeSessionResults = await query(
        `SELECT * FROM Session 
         WHERE websiteId = ? 
         AND createdAt >= ? 
         ORDER BY createdAt DESC 
         LIMIT 1`,
        [website.id, new Date(Date.now() - 24 * 60 * 60 * 1000)]
      );

      // Link customer to recent session if found
      if (activeSessionResults && activeSessionResults.length > 0) {
        const activeSession = activeSessionResults[0];
        await query(`UPDATE Session SET shopifyCustomerId = ? WHERE id = ?`, [
          newCustomerId,
          activeSession.id,
        ]);
        console.log(`Linked customer to active session: ${activeSession.id}`);
      }

      result = { id: newCustomerId };
      console.log("New customer created successfully with associated data");
    }

    // Update default address reference if needed
    if (addresses.length > 0) {
      const defaultAddressResults = await query(
        `SELECT * FROM ShopifyCustomerAddress 
         WHERE customerId = ? AND isDefault = 1 
         LIMIT 1`,
        [result.id]
      );

      if (defaultAddressResults && defaultAddressResults.length > 0) {
        const defaultAddress = defaultAddressResults[0];
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
