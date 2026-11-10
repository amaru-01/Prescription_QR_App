import { Timestamp } from "firebase-admin/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    pingResult: "ok" as "ok" | "fail" | "hang",
    lastSuccess: null as Date | null,
    cronWrites: [] as Record<string, unknown>[],
  },
}));

vi.mock("./firebase", () => ({
  getDb: () => ({
    collection: (name: string) => ({
      doc: () => ({
        get: async () => {
          if (name === "_health") {
            if (state.pingResult === "fail") throw new Error("UNAVAILABLE");
            if (state.pingResult === "hang") return new Promise(() => undefined);
            return { exists: false };
          }
          return { get: () => (state.lastSuccess ? Timestamp.fromDate(state.lastSuccess) : undefined) };
        },
        set: async (data: Record<string, unknown>) => void state.cronWrites.push(data),
      }),
    }),
  }),
}));
vi.mock("./logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { getHealth } = await import("./prescriptions");
const { getCronStatus, recordCronSuccess } = await import("./reminders");

const NOW = new Date("2026-11-10T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

beforeEach(() => {
  state.pingResult = "ok";
  state.lastSuccess = null;
  state.cronWrites = [];
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.CRON_STALE_MINUTES;
});

describe("getHealth", () => {
  it("is healthy when Firestore answers", async () => {
    expect(await getHealth()).toMatchObject({ ok: true, status: "healthy", firebase: "connected" });
  });

  it("is unhealthy when Firestore errors", async () => {
    state.pingResult = "fail";
    expect(await getHealth()).toMatchObject({ ok: false, status: "unhealthy", firebase: "disconnected" });
  });

  it("is unhealthy, not hanging, when Firestore does not answer within 2 seconds", async () => {
    vi.useFakeTimers();
    state.pingResult = "hang";
    const pending = getHealth();
    await vi.advanceTimersByTimeAsync(2_001);
    expect(await pending).toMatchObject({ ok: false, firebase: "disconnected" });
  });

  it("leaves the scheduler out unless asked", async () => {
    expect(await getHealth()).not.toHaveProperty("reminders");
  });

  it("includes the scheduler status on request, without changing `ok`", async () => {
    state.lastSuccess = new Date(Date.now() - 3 * 60 * 60_000);
    const health = await getHealth({ includeCron: true });
    expect(health.ok).toBe(true);
    expect(health.reminders).toMatchObject({ status: "stale" });
  });
});

describe("getCronStatus", () => {
  it("is unknown until the scheduler has run once, so setups without one are not flagged", async () => {
    expect(await getCronStatus(NOW)).toEqual({ status: "unknown", lastSuccessAt: null, minutesSinceLastRun: null });
  });

  it("is ok within the limit and stale beyond it (default 30 minutes)", async () => {
    state.lastSuccess = minutesAgo(10);
    expect(await getCronStatus(NOW)).toMatchObject({ status: "ok", minutesSinceLastRun: 10 });
    state.lastSuccess = minutesAgo(31);
    expect(await getCronStatus(NOW)).toMatchObject({ status: "stale", minutesSinceLastRun: 31 });
  });

  it("honours CRON_STALE_MINUTES, and 0 turns the check off", async () => {
    state.lastSuccess = minutesAgo(90);
    process.env.CRON_STALE_MINUTES = "120";
    expect((await getCronStatus(NOW)).status).toBe("ok");
    process.env.CRON_STALE_MINUTES = "0";
    state.lastSuccess = minutesAgo(5000);
    expect((await getCronStatus(NOW)).status).toBe("ok");
  });
});

describe("recordCronSuccess", () => {
  it("stores when the run happened and its counts, nothing about users", async () => {
    await recordCronSuccess({ due: 5, sent: 4, sentSubscriptions: 6, skipped: 1, failed: 0, retried: 0 });
    expect(state.cronWrites[0]).toMatchObject({ due: 5, sent: 4, failed: 0 });
    expect(Object.keys(state.cronWrites[0]).sort()).toEqual(["due", "failed", "last_success_at", "sent"]);
  });
});
