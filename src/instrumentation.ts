import type { Instrumentation } from "next";

/**
 * Next.js calls this for every unhandled error while rendering a page, running
 * a server action or handling a route. We write it as one structured log line
 * (with the route and any request id), so it shows up in Vercel logs and any
 * log drain or alerting built on them.
 *
 * API routes catch their own errors and answer with a `request_id`; this hook
 * covers what escapes them, chiefly server-rendered pages.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  // The logger uses Node APIs, so skip the edge runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { logger } = await import("@/lib/server/logger");
  const header = request.headers["x-request-id"];
  logger.error("Unhandled request error", {
    error,
    requestId: Array.isArray(header) ? header[0] : header,
    method: request.method,
    path: request.path,
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
    digest: (error as { digest?: string }).digest,
  });
};
