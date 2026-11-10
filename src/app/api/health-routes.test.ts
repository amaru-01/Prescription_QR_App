import { beforeEach, describe, expect, it, vi } from "vitest";

const { data } = vi.hoisted(() => ({ data: { getHealth: vi.fn() } }));
vi.mock("@/lib/server/prescriptions", () => data);
vi.mock("@/lib/server/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const apiHealth = await import("./health/route");
const rootHealth = await import("../health/route");

let ipCounter = 0;
const get = (query = "", path = "/api/health", ip = `203.0.113.${++ipCounter}`) =>
  new Request(`https://veridose.app${path}${query}`, { headers: { "x-vercel-forwarded-for": ip } });

const healthy = { ok: true, status: "healthy", firebase: "connected", timestamp: "t", storage: "firebase" };
const withCron = (status: "ok" | "stale" | "unknown") => ({
  ...healthy,
  reminders: { status, lastSuccessAt: status === "unknown" ? null : "2026-11-10T11:00:00.000Z", minutesSinceLastRun: 60 },
});

beforeEach(() => data.getHealth.mockReset());

describe.each([
  ["/api/health", apiHealth, "/api/health"],
  ["/health", rootHealth, "/health"],
])("GET %s", (_name, route, path) => {
  it("is 200 when Firestore answers", async () => {
    data.getHealth.mockResolvedValue(healthy);
    const res = await route.GET(get("", path));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, firebase: "connected" });
    expect(data.getHealth).toHaveBeenCalledWith({ includeCron: false });
  });

  it("is 503 when Firestore does not answer", async () => {
    data.getHealth.mockResolvedValue({ ...healthy, ok: false, status: "unhealthy", firebase: "disconnected" });
    expect((await route.GET(get("", path))).status).toBe(503);
  });

  it("returns an X-Request-Id for correlating with logs", async () => {
    data.getHealth.mockResolvedValue(healthy);
    expect((await route.GET(get("", path))).headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("with ?cron=1 asks for the scheduler status, and is 200 while it is ok or unknown", async () => {
    for (const status of ["ok", "unknown"] as const) {
      data.getHealth.mockResolvedValue(withCron(status));
      const res = await route.GET(get("?cron=1", path));
      expect(res.status).toBe(200);
      expect((await res.json()).reminders.status).toBe(status);
    }
    expect(data.getHealth).toHaveBeenCalledWith({ includeCron: true });
  });

  it("with ?cron=1 is 503 when the scheduler has stopped", async () => {
    data.getHealth.mockResolvedValue(withCron("stale"));
    expect((await route.GET(get("?cron=1", path))).status).toBe(503);
  });

  it("a stale scheduler does not turn the plain health check red", async () => {
    // Without ?cron=1 the scheduler is not even looked at, so the Settings page never says "offline" for it.
    data.getHealth.mockResolvedValue(healthy);
    expect((await route.GET(get("", path))).status).toBe(200);
  });
});

describe("health rate limit", () => {
  it("allows 60 checks a minute from one address, then answers 429", async () => {
    data.getHealth.mockResolvedValue(healthy);
    const ip = "198.51.100.200";
    const statuses: number[] = [];
    for (let i = 0; i < 62; i += 1) statuses.push((await apiHealth.GET(get("", "/api/health", ip))).status);
    expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(60)).toEqual([429, 429]);
  });
});
