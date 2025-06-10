// middleware.ts  (root directory)

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

function handleCors(req: NextRequest): NextResponse {
  const res = new NextResponse(null, { status: 204 });

  const origin = req.headers.get("origin") ?? "*";
  const reqHdrs = req.headers.get("access-control-request-headers"); // may be null

  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin");
  res.headers.set(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );

  if (reqHdrs) {
    res.headers.set("Access-Control-Allow-Headers", reqHdrs);
  } else {
    res.headers.set(
      "Access-Control-Allow-Headers",
      "content-type,authorization"
    );
  }

  res.headers.set("Access-Control-Allow-Credentials", "true");
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.set("X-CORS-Debug", "middleware");
  return res;
}

/* ------------------------------------------------------------- */
/* 2.  Main middleware                                           */
/* ------------------------------------------------------------- */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  /* 2 a.  Short‑circuit every API pre‑flight immediately */
  if (req.method === "OPTIONS" && pathname.startsWith("/api/"))
    return handleCors(req);

  /* 2 b.  Auth‑redirect logic (your original code) */
  try {
    // Allow the built‑in NextAuth error page through
    if (pathname.startsWith("/api/auth/error")) return NextResponse.next();

    const session = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });

    const authPages = ["/login", "/getStarted", "/forgotPassword"];

    // For API routes related to verification, always allow access
    if (
      pathname.startsWith("/api/auth/sendVerificationCode") ||
      pathname.startsWith("/api/auth/verifyEmailCode") ||
      pathname.startsWith("/api/auth/checkEmailVerified") ||
      pathname.startsWith("/api/auth/checkCredentials") ||
      pathname.startsWith("/api/auth/checkDevice") ||
      pathname.startsWith("/api/auth/addVerifiedDevice")
    ) {
      return NextResponse.next();
    }

    // Logged‑in user visiting auth pages  →  redirect to /app (or callback)
    if (session && authPages.includes(pathname)) {
      const callback = req.nextUrl.searchParams.get("callbackUrl");
      if (callback?.startsWith("/"))
        return NextResponse.redirect(new URL(callback, req.url));

      return NextResponse.redirect(new URL("/app", req.url));
    }

    // Guest visiting /app/**  →  redirect to /login with callback
    if (!session && pathname.startsWith("/app")) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set(
        "callbackUrl",
        search ? `${pathname}${search}` : pathname
      );
      return NextResponse.redirect(loginUrl);
    }

    // Everything else continues
    return NextResponse.next();
  } catch (err) {
    console.error("Middleware error:", err);
    // On error inside API routes: let the route itself handle it
    if (pathname.startsWith("/api/")) return NextResponse.next();
    // On error elsewhere: safe fallback to /login
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

/* ------------------------------------------------------------- */
/* 3.  Which paths should use this middleware                     */
/* ------------------------------------------------------------- */
export const config = {
  matcher: [
    // ALL API routes (required for universal CORS handling)
    "/api/:path*",

    // Auth pages
    "/login",
    "/getStarted",
    "/forgotPassword",

    // Protected app area
    "/app/:path*",

    // Extra protected API groups you listed earlier
    "/api/user/:path*",
    "/api/auth/:path*",

    // Add explicit protection for website routes
    "/api/websites/:path*",
  ],
};
