import { NextRequest, NextResponse } from "next/server";
import { cors } from "@/lib/cors";
import db from "@/lib/db";
import { verifyToken, getWebsiteIdFromToken } from "@/lib/token-verifier";

export async function POST(request: NextRequest) {
  // For OPTIONS request, return CORS headers
  if (request.method === "OPTIONS") {
    return cors(request, NextResponse.json({}));
  }

  try {
    // Auth
    const authHeader = request.headers.get("authorization");
    const isTokenValid = await verifyToken(authHeader);
    if (!isTokenValid) {
      const authResponse = NextResponse.json(
        { error: "Unauthorized - Invalid token" },
        { status: 401 }
      );
      return cors(request, authResponse);
    }

    // Parse customer data from request
    const customerData = await request.json();

    // Prepare data for insertion
    const {
      id,
      email,
      first_name,
      last_name,
      username,
      display_name,
      date_registered,
      orders_count,
      total_spent,
      roles,
      billing,
      shipping,
      recent_orders,
    } = customerData;

    // Store customer in the database
    await db.query(
      `INSERT INTO wordpress_customers 
       (customer_id, email, first_name, last_name, username, display_name, date_registered,
       orders_count, total_spent, roles, billing_info, shipping_info, recent_orders)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
       first_name = VALUES(first_name),
       last_name = VALUES(last_name),
       display_name = VALUES(display_name),
       date_registered = VALUES(date_registered),
       orders_count = VALUES(orders_count),
       total_spent = VALUES(total_spent),
       roles = VALUES(roles),
       billing_info = VALUES(billing_info),
       shipping_info = VALUES(shipping_info),
       recent_orders = VALUES(recent_orders)`,
      [
        id,
        email,
        first_name || "",
        last_name || "",
        username || "",
        display_name || "",
        date_registered ? new Date(date_registered) : null,
        orders_count || 0,
        total_spent || 0.0,
        JSON.stringify(roles || []),
        JSON.stringify(billing || {}),
        JSON.stringify(shipping || {}),
        JSON.stringify(recent_orders || []),
      ]
    );

    const response = NextResponse.json({
      message: "WordPress customer data saved successfully",
      success: true,
    });
    return cors(request, response);
  } catch (error: any) {
    console.error("Error saving WordPress customer data:", error);
    const errorResponse = NextResponse.json(
      { message: `Error: ${error.message}`, success: false },
      { status: 500 }
    );
    return cors(request, errorResponse);
  }
}

export async function OPTIONS(request: NextRequest) {
  return cors(request, NextResponse.json({}));
}
