import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cors } from "@/lib/cors";

export async function POST(request: NextRequest) {
  // For OPTIONS request, return CORS headers
  if (request.method === "OPTIONS") {
    return cors(request, NextResponse.json({}));
  }

  try {
    // Get session
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      const authResponse = NextResponse.json(
        { message: "Authentication required" },
        { status: 401 }
      );
      return cors(request, authResponse);
    }

    // Parse customer data from request
    const customerData = await request.json();

    // Connect to the database
    const connection = await mysql.createConnection(
      "mysql://tester:PQPrzTKuIq20yENMgUOr@test-voicero-pitr.cra8awecqziq.us-east-2.rds.amazonaws.com:3306/voicero-test"
    );

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
    const [result] = await connection.execute(
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

    // Close the database connection
    await connection.end();

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
