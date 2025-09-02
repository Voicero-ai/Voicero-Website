import bcrypt from "bcryptjs";
import { query } from "./db";

export async function verifyToken(authHeader: string | null): Promise<boolean> {
  try {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("Invalid auth header format");
      return false;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    console.log("Verifying token:", token.substring(0, 20) + "...");

    // Special case: If the token itself is a bcrypt hash (starts with $2a$ or $2b$)
    if (token.startsWith("$2a$") || token.startsWith("$2b$")) {
      console.log(
        "Token appears to be a bcrypt hash itself - checking direct match"
      );
      // Check for direct match in the database
      const directMatches = await query(
        "SELECT id FROM AccessKey WHERE `key` = ?",
        [token]
      );
      if ((directMatches as any[]).length > 0) {
        console.log("Found direct match for hashed token in AccessKey table");
        return true;
      }
    }

    // Check AccessKey table (both plain text and hashed keys)
    console.log("Querying all access keys...");
    const accessKeys = await query("SELECT id, `key` FROM AccessKey", []);
    console.log(`Found ${(accessKeys as any[]).length} access keys to check`);

    // Check each access key (both plain text and hashed)
    for (const accessKey of accessKeys as any[]) {
      // Check if it's a bcrypt hash (starts with $2a$ or $2b$)
      if (
        accessKey.key.startsWith("$2a$") ||
        accessKey.key.startsWith("$2b$")
      ) {
        // Compare with bcrypt for hashed keys
        try {
          console.log(
            `Comparing with bcrypt hash: ${accessKey.key.substring(0, 20)}...`
          );
          const isValid = await bcrypt.compare(token, accessKey.key);
          if (isValid) {
            console.log(
              "Bcrypt comparison successful for key ID:",
              accessKey.id
            );
            return true;
          }
        } catch (err) {
          console.error("Bcrypt comparison error:", err);
        }
      } else {
        // Direct string comparison for plain text keys
        if (token === accessKey.key) {
          console.log("Direct string match for key ID:", accessKey.id);
          return true;
        }
      }
    }

    // If not found in AccessKey, check hashKeys table
    console.log("Checking hashKeys table...");
    const rows = await query("SELECT id, hashedKey FROM hashKeys LIMIT 100");
    console.log(`Found ${(rows as any[]).length} hash keys to check`);

    // Check the token against all stored hashed keys
    for (const row of rows as any[]) {
      try {
        console.log(
          `Comparing with hashKeys entry: ${row.hashedKey.substring(0, 20)}...`
        );
        const isValid = await bcrypt.compare(token, row.hashedKey);
        if (isValid) {
          console.log("Bcrypt comparison successful for hashKey ID:", row.id);
          return true;
        }
      } catch (err) {
        console.error("Bcrypt comparison error for hashKey:", err);
      }
    }

    console.log("No matching keys found in any table");
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
      console.log("Invalid auth header format");
      return null;
    }

    const token = authHeader.substring(7);
    console.log(
      "Getting website ID for token:",
      token.substring(0, 20) + "..."
    );

    // Special case: If the token itself is a bcrypt hash (starts with $2a$ or $2b$)
    if (token.startsWith("$2a$") || token.startsWith("$2b$")) {
      console.log(
        "Token appears to be a bcrypt hash itself - checking direct match"
      );
      // Check for direct match in the database
      const directMatches = await query(
        "SELECT websiteId FROM AccessKey WHERE `key` = ?",
        [token]
      );
      if ((directMatches as any[]).length > 0) {
        console.log("Found direct match for hashed token in AccessKey table");
        return (directMatches as any[])[0].websiteId;
      }
    }

    // Check AccessKey table (both plain text and hashed keys)
    console.log("Querying all access keys with website IDs...");
    const accessKeys = await query(
      "SELECT id, websiteId, `key` FROM AccessKey",
      []
    );
    console.log(
      `Found ${
        (accessKeys as any[]).length
      } access keys to check for website ID`
    );

    // Check each access key (both plain text and hashed)
    for (const accessKey of accessKeys as any[]) {
      // Check if it's a bcrypt hash (starts with $2a$ or $2b$)
      if (
        accessKey.key.startsWith("$2a$") ||
        accessKey.key.startsWith("$2b$")
      ) {
        // Compare with bcrypt for hashed keys
        try {
          console.log(
            `Comparing with bcrypt hash: ${accessKey.key.substring(0, 20)}...`
          );
          const isValid = await bcrypt.compare(token, accessKey.key);
          if (isValid) {
            console.log(
              "Bcrypt comparison successful, returning website ID:",
              accessKey.websiteId
            );
            return accessKey.websiteId;
          }
        } catch (err) {
          console.error("Bcrypt comparison error:", err);
        }
      } else {
        // Direct string comparison for plain text keys
        if (token === accessKey.key) {
          console.log(
            "Direct string match, returning website ID:",
            accessKey.websiteId
          );
          return accessKey.websiteId;
        }
      }
    }

    // If not found in AccessKey, check hashKeys table
    console.log("Checking hashKeys table for website ID...");
    const rows = await query(
      "SELECT id, websiteId, hashedKey FROM hashKeys LIMIT 100"
    );
    console.log(
      `Found ${(rows as any[]).length} hash keys to check for website ID`
    );

    // Find the matching token and return its websiteId
    for (const row of rows as any[]) {
      try {
        console.log(
          `Comparing with hashKeys entry: ${row.hashedKey.substring(0, 20)}...`
        );
        const isValid = await bcrypt.compare(token, row.hashedKey);
        if (isValid) {
          console.log(
            "Bcrypt comparison successful, returning website ID:",
            row.websiteId
          );
          return row.websiteId;
        }
      } catch (err) {
        console.error("Bcrypt comparison error for hashKey:", err);
      }
    }

    console.log("No matching website ID found for token");
    return null;
  } catch (error) {
    console.error("Error getting website ID from token:", error);
    return null;
  }
}
