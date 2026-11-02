import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/session-cookie";

/** Pages anyone can open without a session. */
const PUBLIC_PATHS = new Set(["/login", "/signup", "/offline", "/health"]);

/** Firebase Auth REST endpoints the client SDK calls during sign-in. */
const FIREBASE_AUTH_ORIGINS = "https://identitytoolkit.googleapis.com https://securetoken.googleapis.com";

function contentSecurityPolicy(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // React `style={...}` attributes need inline styles; scripts stay nonce-only.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    `connect-src 'self' ${FIREBASE_AUTH_ORIGINS}${isDev ? " ws:" : ""}`,
    "media-src 'self' blob:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/**
 * Runs before every page render:
 * 1. Optimistic auth gate — no session cookie on a private page → /login.
 *    The cookie is fully verified (signature, expiry, revocation) by the
 *    page or API route itself; this only avoids rendering for signed-out users.
 * 2. Per-request CSP nonce so only Next's own scripts can execute.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!PUBLIC_PATHS.has(pathname) && !request.cookies.has(SESSION_COOKIE)) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Pages only: skip API routes, Next internals, and static files in /public.
    "/((?!api|_next/static|_next/image|icons/|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:png|svg|jpg|jpeg|webp|ico|txt|xml)$).*)",
  ],
};
