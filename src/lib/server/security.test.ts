import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BackendError } from "./errors";

vi.mock("./logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
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

describe("rateLimit (in memory)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to the limit, then returns 429 with Retry-After", async () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 3; i += 1) await rateLimit(key, 3, 60_000);
    await expect(rateLimit(key, 3, 60_000)).rejects.toMatchObject({ statusCode: 429 });
    const error = (await rateLimit(key, 3, 60_000).catch((e) => e)) as BackendError;
    expect(error.retryAfter).toBeGreaterThan(0);
  });

  it("resets after the window", async () => {
    vi.useFakeTimers();
    const key = `test:${Math.random()}`;
    await rateLimit(key, 1, 1_000);
    await expect(rateLimit(key, 1, 1_000)).rejects.toThrow();
    vi.advanceTimersByTime(1_001);
    await expect(rateLimit(key, 1, 1_000)).resolves.toBeUndefined();
  });

  it("keeps separate counters per key", async () => {
    await rateLimit("test:a-only", 1, 60_000);
    await expect(rateLimit("test:b-only", 1, 60_000)).resolves.toBeUndefined();
  });
});

describe("rateLimit (shared, Upstash)", () => {
  const fetchMock = vi.fn();
  const redisReply = (count: number, pttl = 42_000) =>
    new Response(JSON.stringify([{ result: count }, { result: 1 }, { result: pttl }]));

  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.upstash.io/";
    process.env.UPSTASH_REDIS_REST_TOKEN = "secret-token";
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.unstubAllGlobals();
  });

  it("counts in Redis so every instance shares one limit", async () => {
    fetchMock.mockResolvedValueOnce(redisReply(1));
    await expect(rateLimit("shared:a", 2, 60_000)).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://redis.example.upstash.io/pipeline");
    expect(init.headers.Authorization).toBe("Bearer secret-token");
    expect(JSON.parse(init.body)).toEqual([["INCR", "rl:shared:a"], ["PEXPIRE", "rl:shared:a", 60000, "NX"], ["PTTL", "rl:shared:a"]]);
  });

  it("returns 429 using the window time left in Redis", async () => {
    fetchMock.mockResolvedValueOnce(redisReply(3, 42_000));
    const error = (await rateLimit("shared:b", 2, 60_000).catch((e) => e)) as BackendError;
    expect(error).toMatchObject({ statusCode: 429, retryAfter: 42 });
  });

  it("falls back to per-instance limits when Redis is down, without blocking requests", async () => {
    fetchMock.mockRejectedValue(new Error("connect timeout"));
    const key = `shared:down:${Math.random()}`;
    await expect(rateLimit(key, 1, 60_000)).resolves.toBeUndefined();
    await expect(rateLimit(key, 1, 60_000)).rejects.toMatchObject({ statusCode: 429 });
  });

  it("falls back when Redis answers with an error", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(rateLimit(`shared:err:${Math.random()}`, 5, 60_000)).resolves.toBeUndefined();
  });
});

describe("clientIp", () => {
  afterEach(() => {
    delete process.env.TRUST_PROXY;
  });
  const req = (headers: Record<string, string>) => new Request("https://x", { headers });

  it("uses the platform-set Vercel header", () => {
    expect(clientIp(req({ "x-vercel-forwarded-for": "9.9.9.9" }))).toBe("9.9.9.9");
  });

  it("ignores spoofable forwarding headers by default", () => {
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8" }))).toBe("unknown");
  });

  it("prefers the Vercel header over a forged x-forwarded-for", () => {
    process.env.TRUST_PROXY = "1";
    expect(clientIp(req({ "x-vercel-forwarded-for": "9.9.9.9", "x-forwarded-for": "1.1.1.1" }))).toBe("9.9.9.9");
  });

  it("trusts x-forwarded-for / x-real-ip only behind TRUST_PROXY=1", () => {
    process.env.TRUST_PROXY = "1";
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientIp(req({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
  });
});
