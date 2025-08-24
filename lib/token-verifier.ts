import bcrypt from "bcryptjs";
import { query } from "./db";

export async function verifyToken(authHeader: string | null): Promise<boolean> {
  try {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return false;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    console.log("token", token);

    // Use the improved database connection with retry logic
    // Add a more specific query with a LIMIT to reduce data transfer
    const rows = await query("SELECT hashedKey FROM hashKeys LIMIT 100");

    // Check the token against all stored hashed keys
    for (const row of rows as any[]) {
      const isValid = await bcrypt.compare(token, row.hashedKey);
      if (isValid) {
        return true;
      }
    }

    return false;
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

    const rows = await query(
      "SELECT websiteId, hashedKey FROM hashKeys LIMIT 100"
    );

    // Find the matching token and return its websiteId
    for (const row of rows as any[]) {
      const isValid = await bcrypt.compare(token, row.hashedKey);
      if (isValid) {
        return row.websiteId;
      }
    }

    return null;
  } catch (error) {
    console.error("Error getting website ID from token:", error);
    return null;
  }
}
