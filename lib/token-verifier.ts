import bcrypt from "bcryptjs";
import { query } from "./db";

export async function verifyToken(authHeader: string | null): Promise<boolean> {
  try {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return false;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    console.log("token", token);

    // Check AccessKey table (both plain text and hashed keys)
    const accessKeys = await query("SELECT `key` FROM AccessKey", []);

    // Check each access key (both plain text and hashed)
    for (const accessKey of accessKeys as any[]) {
      // Check if it's a bcrypt hash (starts with $2a$ or $2b$)
      if (
        accessKey.key.startsWith("$2a$") ||
        accessKey.key.startsWith("$2b$")
      ) {
        // Compare with bcrypt for hashed keys
        const isValid = await bcrypt.compare(token, accessKey.key);
        if (isValid) {
          return true;
        }
      } else {
        // Direct string comparison for plain text keys
        if (token === accessKey.key) {
          return true;
        }
      }
    }

    // If not found in AccessKey, check hashKeys table
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

    // Check AccessKey table (both plain text and hashed keys)
    const accessKeys = await query(
      "SELECT websiteId, `key` FROM AccessKey",
      []
    );

    // Check each access key (both plain text and hashed)
    for (const accessKey of accessKeys as any[]) {
      // Check if it's a bcrypt hash (starts with $2a$ or $2b$)
      if (
        accessKey.key.startsWith("$2a$") ||
        accessKey.key.startsWith("$2b$")
      ) {
        // Compare with bcrypt for hashed keys
        const isValid = await bcrypt.compare(token, accessKey.key);
        if (isValid) {
          return accessKey.websiteId;
        }
      } else {
        // Direct string comparison for plain text keys
        if (token === accessKey.key) {
          return accessKey.websiteId;
        }
      }
    }

    // If not found in AccessKey, check hashKeys table
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
