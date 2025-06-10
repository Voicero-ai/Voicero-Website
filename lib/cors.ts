// lib/cors.ts
import { NextRequest, NextResponse } from "next/server";

const ALLOWED_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
].join(", ");

export function cors(req: NextRequest, res: NextResponse): NextResponse {
  const origin = req.headers.get("origin") ?? "*";

  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin");
  res.headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
  res.headers.set(
    "Access-Control-Allow-Headers",
    req.headers.get("access-control-request-headers") ??
      "Content-Type, Authorization"
  );
  res.headers.set("Access-Control-Allow-Credentials", "true");
  res.headers.set("Access-Control-Max-Age", "86400"); // 24 h

  return res;
}
