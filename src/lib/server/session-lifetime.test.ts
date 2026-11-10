import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: vi.fn() }) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("./firebase", () => ({ getAdminAuth: vi.fn() }));

const DAY = 24 * 60 * 60;

/** The lifetime is read once when the module loads, so each case loads a fresh copy. */
async function lifetimeWith(days: string | undefined): Promise<number> {
  vi.resetModules();
  if (days === undefined) delete process.env.SESSION_MAX_AGE_DAYS;
  else process.env.SESSION_MAX_AGE_DAYS = days;
  return (await import("./auth")).SESSION_MAX_AGE_SECONDS;
}

afterEach(() => {
  delete process.env.SESSION_MAX_AGE_DAYS;
});

describe("SESSION_MAX_AGE_DAYS", () => {
  it("defaults to 5 days", async () => {
    expect(await lifetimeWith(undefined)).toBe(5 * DAY);
  });

  it.each([
    ["1", 1 * DAY],
    ["2", 2 * DAY],
    ["14", 14 * DAY],
    ["1.5", 1.5 * DAY],
  ])("accepts %s days", async (value, seconds) => {
    expect(await lifetimeWith(value)).toBe(seconds);
  });

  it.each(["0", "0.5", "15", "100", "-3", "abc", "", "NaN", "Infinity"])(
    "falls back to the 5-day default for the invalid value %j rather than failing sign-in",
    async (value) => {
      expect(await lifetimeWith(value)).toBe(5 * DAY);
    }
  );

  it("stays within what Firebase allows (5 minutes to 14 days)", async () => {
    for (const value of ["1", "14", "999"]) {
      const seconds = await lifetimeWith(value);
      expect(seconds).toBeGreaterThanOrEqual(5 * 60);
      expect(seconds).toBeLessThanOrEqual(14 * DAY);
    }
  });
});
