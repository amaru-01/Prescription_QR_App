import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BackendError, errorResponse } from "./errors";
import { logger } from "./logger";
import { currentContext, hashIp, setContextUser, withRequest } from "./request-context";
import { securityEvent } from "./security-log";

/** Capture the JSON lines the logger writes. */
function captureLogs() {
  const lines: Record<string, unknown>[] = [];
  const sink = (line: string) => void lines.push(JSON.parse(line));
  vi.spyOn(console, "log").mockImplementation(sink);
  vi.spyOn(console, "warn").mockImplementation(sink);
  vi.spyOn(console, "error").mockImplementation(sink);
  return lines;
}

const req = (headers: Record<string, string> = {}, url = "https://veridose.app/api/save", method = "POST") =>
  new Request(url, { method, headers });

beforeEach(() => {
  delete process.env.LOG_IP_SALT;
});
afterEach(() => {
  delete process.env.LOG_IP_SALT;
  delete process.env.TRUST_PROXY;
});

describe("withRequest", () => {
  it("gives every response an X-Request-Id and a fresh id per request", async () => {
    const handler = withRequest(async (_request: Request) => Response.json({ ok: true }));
    const a = await handler(req());
    const b = await handler(req());
    expect(a.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.headers.get("x-request-id")).not.toBe(b.headers.get("x-request-id"));
  });

  it("reuses a well-formed incoming request id so it can be followed across services", async () => {
    const handler = withRequest(async (_request: Request) => Response.json({}));
    const res = await handler(req({ "x-request-id": "trace-1234.abcd" }));
    expect(res.headers.get("x-request-id")).toBe("trace-1234.abcd");
  });

  it.each(["short", "has spaces in it", "x".repeat(200), "bad<script>id", "line\tbreak-id-1"])(
    "ignores a malformed incoming id %j instead of echoing it",
    async (bad) => {
      const handler = withRequest(async (_request: Request) => Response.json({}));
      const res = await handler(req({ "x-request-id": bad }));
      expect(res.headers.get("x-request-id")).not.toBe(bad);
      expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    }
  );

  it("exposes the context only while the handler runs", async () => {
    let inside: ReturnType<typeof currentContext>;
    const handler = withRequest(async (_request: Request) => {
      inside = currentContext();
      return Response.json({});
    });
    await handler(req({}, "https://veridose.app/api/rx/issue", "POST"));
    expect(inside!).toMatchObject({ method: "POST", path: "/api/rx/issue" });
    expect(currentContext()).toBeUndefined();
  });

  it("keeps concurrent requests apart", async () => {
    const seen: string[] = [];
    const handler = withRequest(async (request: Request) => {
      await new Promise((resolve) => setTimeout(resolve, request.headers.get("x-delay") === "slow" ? 20 : 1));
      seen.push(`${request.headers.get("x-id")}:${currentContext()?.requestId}`);
      return Response.json({});
    });
    await Promise.all([
      handler(req({ "x-id": "A", "x-delay": "slow", "x-request-id": "request-A-0001" })),
      handler(req({ "x-id": "B", "x-request-id": "request-B-0002" })),
    ]);
    expect(seen.sort()).toEqual(["A:request-A-0001", "B:request-B-0002"]);
  });

  it("still works when a handler is called without a Request (e.g. GET())", async () => {
    const handler = withRequest(async () => Response.json({}));
    const res = await handler();
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("returns the response untouched if its headers cannot be changed", async () => {
    const handler = withRequest(async (_request: Request) => Response.redirect("https://veridose.app/login"));
    await expect(handler(req())).resolves.toBeInstanceOf(Response);
  });
});

describe("logging inside a request", () => {
  it("adds request id, method, path and uid to every line", async () => {
    const lines = captureLogs();
    const handler = withRequest(async (_request: Request) => {
      setContextUser("user-42");
      logger.info("saved", { rxId: "abc" });
      return Response.json({});
    });
    const res = await handler(req({}, "https://veridose.app/api/save"));
    expect(lines[0]).toMatchObject({
      message: "saved",
      requestId: res.headers.get("x-request-id"),
      method: "POST",
      path: "/api/save",
      uid: "user-42",
      rxId: "abc",
    });
  });

  it("writes plain lines outside a request", () => {
    const lines = captureLogs();
    logger.info("startup");
    expect(lines[0]).toMatchObject({ message: "startup" });
    expect(lines[0]).not.toHaveProperty("requestId");
  });

  it("never logs the raw IP address", async () => {
    const lines = captureLogs();
    const handler = withRequest(async (_request: Request) => {
      securityEvent("forbidden", { reason: "test" });
      return Response.json({});
    });
    await handler(req({ "x-vercel-forwarded-for": "203.0.113.77" }));
    const text = JSON.stringify(lines);
    expect(text).not.toContain("203.0.113.77");
    expect(lines[0]).toMatchObject({ event: "forbidden", level: "warn", ipHash: hashIp("203.0.113.77") });
  });
});

describe("hashIp", () => {
  it("is stable, short, and depends on the salt", () => {
    const a = hashIp("1.2.3.4");
    expect(a).toBe(hashIp("1.2.3.4"));
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(hashIp("1.2.3.5")).not.toBe(a);
    process.env.LOG_IP_SALT = "another-secret";
    expect(hashIp("1.2.3.4")).not.toBe(a);
  });
});

describe("errorResponse", () => {
  it("reports the same request id in the body and the logs for unexpected errors", async () => {
    const lines = captureLogs();
    const handler = withRequest(async (_request: Request) => errorResponse(new Error("database exploded")));
    const res = await handler(req());
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.request_id).toBe(res.headers.get("x-request-id"));
    expect(lines.find((l) => l.message === "Unhandled API error")).toMatchObject({ requestId: body.request_id });
    expect(JSON.stringify(body)).not.toContain("database exploded");
  });

  it("logs a security event for 403 and 429, but not for routine 401/404/422", async () => {
    const lines = captureLogs();
    const run = (status: number) =>
      withRequest(async (_request: Request) => errorResponse(new BackendError("nope", status)))(req());
    for (const status of [401, 404, 422, 403, 429]) await run(status);
    const events = lines.filter((l) => typeof l.event === "string").map((l) => l.event);
    expect(events).toEqual(["forbidden", "rate_limited"]);
  });
});
