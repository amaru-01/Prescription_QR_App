import { beforeEach, describe, expect, it, vi } from "vitest";

import { BackendError } from "@/lib/server/errors";

const { auth, account, adminAuth, cookieStore, stats } = vi.hoisted(() => ({
  auth: {
    requireUser: vi.fn(),
    assertRecentSignIn: vi.fn(),
    invalidateUserCache: vi.fn(),
    SESSION_COOKIE: "session",
    sessionCookieOptions: (maxAge: number) => ({ maxAge }),
  },
  account: { deleteAccountData: vi.fn() },
  adminAuth: { deleteUser: vi.fn() },
  cookieStore: { set: vi.fn() },
  stats: { invalidateStatsCache: vi.fn() },
}));

vi.mock("@/lib/server/auth", () => auth);
vi.mock("@/lib/server/account", () => account);
vi.mock("@/lib/server/firebase", () => ({ getAdminAuth: () => adminAuth }));
vi.mock("@/lib/server/prescriptions", () => stats);
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("@/lib/server/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const route = await import("./auth/account/route");

const ORIGIN = "https://veridose.app";
let uidCounter = 0;

const del = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/auth/account`, {
    method: "DELETE",
    headers: { "content-type": "application/json", host: "veridose.app", origin: ORIGIN, ...headers },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
  auth.requireUser.mockResolvedValue({ uid: `user-${++uidCounter}`, isAnonymous: false });
});

describe("DELETE /api/auth/account", () => {
  it("rejects cross-site requests before doing anything", async () => {
    const res = await route.DELETE(del({ idToken: "t" }, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(account.deleteAccountData).not.toHaveBeenCalled();
  });

  it("requires a session", async () => {
    auth.requireUser.mockRejectedValue(new BackendError("Please log in to continue.", 401));
    expect((await route.DELETE(del({ idToken: "t" }))).status).toBe(401);
    expect(account.deleteAccountData).not.toHaveBeenCalled();
  });

  it("does not delete anything when the fresh sign-in check fails", async () => {
    auth.assertRecentSignIn.mockRejectedValue(new BackendError("Please confirm your password again to continue.", 401));
    const res = await route.DELETE(del({ idToken: "stale" }));
    expect(res.status).toBe(401);
    expect(account.deleteAccountData).not.toHaveBeenCalled();
    expect(adminAuth.deleteUser).not.toHaveBeenCalled();
  });

  it("erases the data, then the sign-in record, then clears the session", async () => {
    const calls: string[] = [];
    account.deleteAccountData.mockImplementation(async () => void calls.push("data"));
    adminAuth.deleteUser.mockImplementation(async () => void calls.push("auth"));

    const res = await route.DELETE(del({ idToken: "fresh" }));
    expect(res.status).toBe(200);
    expect(calls).toEqual(["data", "auth"]);
    expect(auth.assertRecentSignIn).toHaveBeenCalledWith(expect.stringMatching(/^user-/), "fresh");
    expect(cookieStore.set).toHaveBeenCalledWith("session", "", { maxAge: 0 });
    expect(stats.invalidateStatsCache).toHaveBeenCalled();
    expect(auth.invalidateUserCache).toHaveBeenCalled();
  });

  it("keeps the account (so the user can retry) when erasing the data fails", async () => {
    account.deleteAccountData.mockRejectedValue(new Error("firestore unavailable"));
    const res = await route.DELETE(del({ idToken: "fresh" }));
    expect(res.status).toBe(500);
    expect(adminAuth.deleteUser).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("lets guests delete without a password", async () => {
    auth.requireUser.mockResolvedValue({ uid: "guest-1", isAnonymous: true });
    const res = await route.DELETE(del({}));
    expect(res.status).toBe(200);
    expect(auth.assertRecentSignIn).not.toHaveBeenCalled();
    expect(account.deleteAccountData).toHaveBeenCalledWith("guest-1");
  });

  it("limits repeated attempts", async () => {
    auth.requireUser.mockResolvedValue({ uid: "hammer", isAnonymous: false });
    auth.assertRecentSignIn.mockRejectedValue(new BackendError("nope", 401));
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await route.DELETE(del({ idToken: "x" }))).status);
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
  });
});
