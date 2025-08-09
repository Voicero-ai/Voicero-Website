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
});

// Helper function to execute queries
export async function query(sql: string, params: any[] = []) {
  const maxAttempts = 3;
  const isRetriable = (err: any) => {
    const code = err?.code || err?.errno || "";
    return (
      code === "ETIMEDOUT" ||
      code === "PROTOCOL_CONNECTION_LOST" ||
      code === "ECONNRESET" ||
      code === "EPIPE" ||
      code === "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR" ||
      code === "PROTOCOL_SEQUENCE_TIMEOUT"
    );
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Pass per-query timeout to abort long-running reads
      const [rows] = await (pool.execute as any)(
        { sql, timeout: 20_000 },
        params
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
      // Backoff before retrying
      await new Promise((r) => setTimeout(r, attempt * 300));
    }
  }
}

export default {
  query,
};
