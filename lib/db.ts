import mysql from "mysql2/promise";

// Create a connection pool with sane network timeouts and keep-alive
const pool = mysql.createPool({
  host: process.env.DATABASE_HOST || "localhost",
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 15_000, // ms
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  // Add more robust connection handling
  multipleStatements: false,
  dateStrings: true,
});

// Helper function to execute queries with improved retry logic
export async function query(sql: string, params: any[] = []) {
  const maxAttempts = 5; // Increased from 3 to 5
  const baseDelay = 500; // Base delay in ms

  const isRetriable = (err: any) => {
    const code = err?.code || err?.errno || "";
    return (
      code === "ETIMEDOUT" ||
      code === "PROTOCOL_CONNECTION_LOST" ||
      code === "ECONNRESET" ||
      code === "EPIPE" ||
      code === "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR" ||
      code === "PROTOCOL_SEQUENCE_TIMEOUT" ||
      code === "ECONNREFUSED" || // Added this
      code === "ENOTFOUND" || // Added DNS resolution errors
      code === "EHOSTUNREACH" // Added host unreachable
    );
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Sanitize undefined values in params to null to avoid mysql2 throwing
      const sanitizedParams = Array.isArray(params)
        ? params.map((p) => (p === undefined ? null : p))
        : params;

      // Pass per-query timeout to abort long-running reads
      const [rows] = await (pool.execute as any)(
        { sql, timeout: 30_000 }, // Increased timeout
        sanitizedParams
      );
      return rows;
    } catch (error: any) {
      const retriable = isRetriable(error);
      console.error(
        `Database query error (attempt ${attempt}/${maxAttempts}):`,
        error
      );

      if (!retriable || attempt === maxAttempts) {
        throw error;
      }

      // Exponential backoff with jitter for retries
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
      console.log(`Retrying in ${Math.round(delay)}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// Add a function to test database connectivity
export async function testConnection() {
  try {
    await query("SELECT 1 as test");
    return true;
  } catch (error) {
    console.error("Database connection test failed:", error);
    return false;
  }
}

// Add a function to get connection pool status
export function getPoolStatus() {
  return {
    threadId: pool.threadId,
    connectionLimit: pool.config.connectionLimit,
    // Note: mysql2 doesn't expose current connection count directly
  };
}

const db = { query, testConnection, getPoolStatus };
export default db;
