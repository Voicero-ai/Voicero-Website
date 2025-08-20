import bcrypt from "bcryptjs";
import * as mysql from "mysql2/promise";

// Database connection
const dbConfig = {
  host: process.env.DATABASE_HOST!,
  user: process.env.DATABASE_USER!,
  password: process.env.DATABASE_PASSWORD!,
  database: process.env.DATABASE_NAME!,
  port: parseInt(process.env.DATABASE_PORT!) || 3306,
  charset: "utf8mb4",
};

export async function verifyToken(authHeader: string | null): Promise<boolean> {
  try {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return false;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    console.log("token", token);

    // Connect to database and check against all hashed keys
    const connection = await mysql.createConnection(dbConfig);

    try {
      const [rows] = await connection.execute("SELECT hashedKey FROM hashKeys");

      // Check the token against all stored hashed keys
      for (const row of rows as any[]) {
        const isValid = await bcrypt.compare(token, row.hashedKey);
        if (isValid) {
          return true;
        }
      }

      return false;
    } finally {
      await connection.end();
    }
  } catch (error) {
    console.error("Token verification error:", error);
    return false;
  }
}

export async function getWebsiteIdFromToken(
  authHeader: string | null
): Promise<string | null> {
  try {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return null;
    }

    const token = authHeader.substring(7);

    const connection = await mysql.createConnection(dbConfig);

    try {
      const [rows] = await connection.execute(
        "SELECT websiteId, hashedKey FROM hashKeys"
      );

      // Find the matching token and return its websiteId
      for (const row of rows as any[]) {
        const isValid = await bcrypt.compare(token, row.hashedKey);
        if (isValid) {
          return row.websiteId;
        }
      }

      return null;
    } finally {
      await connection.end();
    }
  } catch (error) {
    console.error("Error getting website ID from token:", error);
    return null;
  }
}
