import { BackendError } from "./errors";

/** Default cap for JSON request bodies. Prescription payloads are tiny. */
const DEFAULT_MAX_BODY_BYTES = 16 * 1024;

/**
 * Reject cross-site state-changing requests (CSRF defence in depth on top of
 * the SameSite session cookie). Browsers always send Origin and/or
 * Sec-Fetch-Site on fetch POST/PATCH/DELETE; non-browser clients may send
 * neither, which is fine because they cannot ride a victim's cookies.
 */
export function assertSameOrigin(request: Request): void {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new BackendError("Cross-site requests are not allowed.", 403);
  }

  const origin = request.headers.get("origin");
  if (!origin) return;

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new BackendError("Cross-site requests are not allowed.", 403);
  }
  if (!host || originHost !== host) {
    throw new BackendError("Cross-site requests are not allowed.", 403);
  }
}

/** Parse a JSON object body, enforcing content type and a size limit. */
export async function readJsonBody(
  request: Request,
  maxBytes = DEFAULT_MAX_BODY_BYTES
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new BackendError("Send the request body as application/json.", 415);
  }

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    throw new BackendError("Request body is too large.", 413);
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new BackendError("Request body is too large.", 413);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackendError("Request body is not valid JSON.", 400);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new BackendError("Request body must be a JSON object.", 400);
  }
  return parsed as Record<string, unknown>;
}

/** Best-effort client IP for rate limiting anonymous endpoints. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

/**
 * Fixed-window rate limiter.
 *
 * NOTE: state lives in this server instance's memory. That is enough for a
 * single Node server and still blunts bursts on serverless, but each Vercel
 * instance keeps its own counters. Swap this for a shared store (e.g. Upstash
 * Redis) when you need a hard global limit.
 */
export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();

  if (now - lastSweep > 60_000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
    lastSweep = now;
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    throw new BackendError("Too many requests. Please wait a moment and try again.", 429, undefined, retryAfter);
  }
}
