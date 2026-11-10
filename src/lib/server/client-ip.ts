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
