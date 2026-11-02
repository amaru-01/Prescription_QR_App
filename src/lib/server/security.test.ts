import { afterEach, describe, expect, it, vi } from "vitest";

import { BackendError } from "./errors";
import { assertSameOrigin, clientIp, rateLimit, readJsonBody } from "./security";

const post = (headers: Record<string, string>, body = "{}") =>
  new Request("https://veridose.app/api/save", { method: "POST", headers, body });

function statusOf(fn: () => unknown): number | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof BackendError ? error.statusCode : -1;
  }
  return undefined;
}

describe("assertSameOrigin", () => {
  it("allows same-origin browser requests", () => {
    expect(statusOf(() => assertSameOrigin(post({ host: "veridose.app", origin: "https://veridose.app", "sec-fetch-site": "same-origin" })))).toBeUndefined();
  });

  it("allows non-browser clients that send neither header", () => {
    expect(statusOf(() => assertSameOrigin(post({ host: "veridose.app" })))).toBeUndefined();
  });

  it("rejects a foreign Origin", () => {
    expect(statusOf(() => assertSameOrigin(post({ host: "veridose.app", origin: "https://evil.example" })))).toBe(403);
  });

  it("rejects cross-site fetch metadata even without Origin", () => {
    expect(statusOf(() => assertSameOrigin(post({ host: "veridose.app", "sec-fetch-site": "cross-site" })))).toBe(403);
  });

  it("uses x-forwarded-host behind a proxy", () => {
    const request = post({ host: "internal:3000", "x-forwarded-host": "veridose.app", origin: "https://veridose.app" });
    expect(statusOf(() => assertSameOrigin(request))).toBeUndefined();
  });

  it("rejects a malformed Origin", () => {
    expect(statusOf(() => assertSameOrigin(post({ host: "veridose.app", origin: "null" })))).toBe(403);
  });
});

describe("readJsonBody", () => {
  const json = { "content-type": "application/json" };

  it("parses a JSON object", async () => {
    await expect(readJsonBody(post(json, '{"med":"A"}'))).resolves.toEqual({ med: "A" });
  });

  it("requires the JSON content type", async () => {
    await expect(readJsonBody(post({ "content-type": "text/plain" }))).rejects.toMatchObject({ statusCode: 415 });
  });

  it("rejects bodies over the limit", async () => {
    await expect(readJsonBody(post(json, JSON.stringify({ x: "a".repeat(100) })), 50)).rejects.toMatchObject({ statusCode: 413 });
  });

  it("rejects invalid JSON and non-objects", async () => {
    await expect(readJsonBody(post(json, "{oops"))).rejects.toMatchObject({ statusCode: 400 });
    await expect(readJsonBody(post(json, "[1,2]"))).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("rateLimit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to the limit, then returns 429 with Retry-After", () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 3; i += 1) rateLimit(key, 3, 60_000);
    try {
      rateLimit(key, 3, 60_000);
      expect.unreachable("should have been rate limited");
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 429 });
      expect((error as BackendError).retryAfter).toBeGreaterThan(0);
    }
  });

  it("resets after the window", () => {
    vi.useFakeTimers();
    const key = `test:${Math.random()}`;
    rateLimit(key, 1, 1_000);
    expect(() => rateLimit(key, 1, 1_000)).toThrow();
    vi.advanceTimersByTime(1_001);
    expect(() => rateLimit(key, 1, 1_000)).not.toThrow();
  });

  it("keeps separate counters per key", () => {
    rateLimit("test:a-only", 1, 60_000);
    expect(() => rateLimit("test:b-only", 1, 60_000)).not.toThrow();
  });
});

describe("clientIp", () => {
  it("takes the first x-forwarded-for hop", () => {
    expect(clientIp(new Request("https://x", { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } }))).toBe("1.2.3.4");
  });
});
