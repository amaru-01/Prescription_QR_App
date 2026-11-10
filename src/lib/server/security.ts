import { BackendError } from "./errors";
import { logger } from "./logger";

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

/**
 * Best-effort client IP for rate limiting anonymous endpoints.
 *
 * Only headers a trusted platform sets are used: `x-vercel-forwarded-for` is
 * written by Vercel and cannot be forged by the client. `x-forwarded-for` and
 * `x-real-ip` are honoured only when TRUST_PROXY=1, i.e. you run behind a
 * reverse proxy that overwrites them; otherwise anyone could rotate a fake
 * address to dodge limits. With no trusted header all callers share "unknown".
 */
export function clientIp(request: Request): string {
  const vercel = request.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0].trim();

  if (process.env.TRUST_PROXY === "1") {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    const real = request.headers.get("x-real-ip");
    if (real) return real.trim();
  }
  return "unknown";
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

/** Fixed-window counter in this instance's memory. Returns the retry delay when over the limit. */
function memoryRateLimit(key: string, limit: number, windowMs: number): number | null {
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
    return null;
  }

  bucket.count += 1;
  return bucket.count > limit ? Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) : null;
}

/** Shared counter in Upstash Redis (REST). Returns the retry delay when over the limit. */
async function redisRateLimit(key: string, limit: number, windowMs: number): Promise<number | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const redisKey = `rl:${key}`;

  const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    // INCR, start the window on the first hit only (NX), and read what is left of it.
    body: JSON.stringify([["INCR", redisKey], ["PEXPIRE", redisKey, windowMs, "NX"], ["PTTL", redisKey]]),
    signal: AbortSignal.timeout(1_500),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Upstash responded ${res.status}`);

  const [incr, , pttl] = (await res.json()) as { result?: number; error?: string }[];
  if (typeof incr?.result !== "number") throw new Error(incr?.error ?? "Unexpected Upstash response");
  if (incr.result <= limit) return null;
  const remainingMs = typeof pttl?.result === "number" && pttl.result > 0 ? pttl.result : windowMs;
  return Math.max(1, Math.ceil(remainingMs / 1000));
}

const sharedLimiterConfigured = () =>
  Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

let lastRedisWarning = 0;

/**
 * Fixed-window rate limiter; throws a 429 BackendError when `key` exceeds
 * `limit` requests per `windowMs`.
 *
 * With UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN set, counters are
 * shared by every server instance, so the limit is global. Without them (local
 * dev, tests) counters live in this instance's memory. If Redis is slow or
 * down the limiter falls back to the in-memory counters rather than blocking
 * requests: the limit becomes per-instance, but the app stays available.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<void> {
  let retryAfter: number | null;
  if (sharedLimiterConfigured()) {
    try {
      retryAfter = await redisRateLimit(key, limit, windowMs);
    } catch (error) {
      if (Date.now() - lastRedisWarning > 60_000) {
        lastRedisWarning = Date.now();
        logger.warn("Shared rate limiter unavailable; using per-instance limits", { error });
      }
      retryAfter = memoryRateLimit(key, limit, windowMs);
    }
  } else {
    retryAfter = memoryRateLimit(key, limit, windowMs);
  }

  if (retryAfter !== null) {
    throw new BackendError("Too many requests. Please wait a moment and try again.", 429, undefined, retryAfter);
  }
}
