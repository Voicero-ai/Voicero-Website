import { PrismaClient } from "@prisma/client";

// Use global variable to prevent multiple instances in development
declare global {
  var prisma: PrismaClient | undefined;
}

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: ["query", "error", "warn"],
    // Set longer timeout for connections
    datasourceUrl: process.env.DATABASE_URL,
    // @ts-ignore - Prisma doesn't properly type these connection settings
    connectionTimeout: 20000, // 20 seconds (default is 10)
    // @ts-ignore
    connectionLimit: 20, // 20 concurrent connections (default is 5)
  });
};

const prisma = globalThis.prisma ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;
