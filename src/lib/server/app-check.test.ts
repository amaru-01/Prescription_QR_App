import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { verifyToken, logger } = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("firebase-admin/app-check", () => ({ getAppCheck: () => ({ verifyToken }) }));
vi.mock("./firebase", () => ({ initializeFirebase: vi.fn() }));
vi.mock("./logger", () => ({ logger }));

const { appCheckMode, assertAppCheck } = await import("./app-check");

const req = (token?: string) =>
  new Request("https://veridose.app/api/auth/session", {
    method: "POST",
    headers: token ? { "x-firebase-appcheck": token } : {},
  });

beforeEach(() => {
  verifyToken.mockReset();
  logger.warn.mockClear();
});
afterEach(() => {
  delete process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY;
  delete process.env.APP_CHECK_ENFORCE;
});

describe("appCheckMode", () => {
  it("is off by default, monitor with a site key, enforce when asked", () => {
    expect(appCheckMode()).toBe("off");
    process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY = "site-key";
    expect(appCheckMode()).toBe("monitor");
    process.env.APP_CHECK_ENFORCE = "1";
    expect(appCheckMode()).toBe("enforce");
  });
});

describe("assertAppCheck", () => {
  it("does nothing when App Check is not configured", async () => {
    await expect(assertAppCheck(req())).resolves.toBeUndefined();
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it("in monitor mode logs a missing or invalid token but lets the request through", async () => {
    process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY = "site-key";
    await expect(assertAppCheck(req())).resolves.toBeUndefined();
    verifyToken.mockRejectedValue(new Error("bad token"));
    await expect(assertAppCheck(req("forged"))).resolves.toBeUndefined();
    const events = logger.warn.mock.calls.filter(([message]) => message === "security: app_check_rejected");
    expect(events.map(([, details]) => details)).toEqual([
      expect.objectContaining({ event: "app_check_rejected", reason: "missing", mode: "monitor" }),
      expect.objectContaining({ event: "app_check_rejected", reason: "invalid", mode: "monitor" }),
    ]);
  });

  it("in enforce mode rejects missing and invalid tokens with 403", async () => {
    process.env.APP_CHECK_ENFORCE = "1";
    await expect(assertAppCheck(req())).rejects.toMatchObject({ statusCode: 403 });
    verifyToken.mockRejectedValue(new Error("bad token"));
    await expect(assertAppCheck(req("forged"))).rejects.toMatchObject({ statusCode: 403 });
  });

  it("accepts a valid token in enforce mode", async () => {
    process.env.APP_CHECK_ENFORCE = "1";
    verifyToken.mockResolvedValue({ appId: "app" });
    await expect(assertAppCheck(req("good"))).resolves.toBeUndefined();
    expect(verifyToken).toHaveBeenCalledWith("good");
  });
});
