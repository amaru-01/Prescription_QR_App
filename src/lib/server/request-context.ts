import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";

import { clientIp } from "./client-ip";

/** What every log line written while handling one request should carry. */
export interface RequestContext {
  requestId: string;
  method: string;
  path: string;
  /** Short salted hash of the client IP: enough to spot one abuser, not to identify a person. */
  ipHash: string;
  /** Set once the request is authenticated. */
  uid?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** The request being handled right now, if the handler was wrapped with `withRequest`. */
export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Record who the request belongs to, so later log lines include their uid. */
export function setContextUser(uid: string): void {
  const context = storage.getStore();
  if (context) context.uid = uid;
}

/**
 * Salted hash for logging an IP address without storing it. Set LOG_IP_SALT to
 * a random secret: IPv4 space is small, so an unsalted (or publicly salted) hash
 * could be reversed by brute force.
 */
export function hashIp(ip: string): string {
  const salt = process.env.LOG_IP_SALT ?? "veridose-logs";
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 12);
}

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

function contextFor(request: Request | undefined): RequestContext {
  const incoming = request?.headers.get("x-request-id");
  const requestId = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
  if (!request) return { requestId, method: "", path: "", ipHash: hashIp("unknown") };

  let path = "";
  try {
    path = new URL(request.url).pathname;
  } catch {
    /* leave blank */
  }
  return { requestId, method: request.method, path, ipHash: hashIp(clientIp(request)) };
}

/**
 * Wrap a route handler so that everything it logs carries the same request id,
 * path and hashed IP, and so its response returns the id in `X-Request-Id`
 * (support can then find the exact log lines for a failing request). A valid
 * incoming `X-Request-Id` is reused so ids can be followed across services.
 */
export function withRequest<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    const request = args.find((arg): arg is Request => arg instanceof Request);
    const context = contextFor(request);
    const response = await storage.run(context, () => handler(...args));
    try {
      response.headers.set("X-Request-Id", context.requestId);
    } catch {
      /* immutable response (e.g. a redirect): the id is still in the logs */
    }
    return response;
  };
}
