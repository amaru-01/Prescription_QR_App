import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookieStore, adminAuth } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn() },
  adminAuth: {
    verifySessionCookie: vi.fn(),
    getUser: vi.fn(),
    verifyIdToken: vi.fn(),
    createSessionCookie: vi.fn(),
  },
}));

vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("./firebase", () => ({ getAdminAuth: () => adminAuth }));

const { createSessionCookie, getSessionUser, requirePageUser, requirePrescriber, requireUser, safeNextPath } =
  await import("./auth");

const nowSeconds = () => Math.floor(Date.now() / 1000);
const authError = (code: string) => Object.assign(new Error(code), { code });

function signedIn({ authTime = nowSeconds() - 60, provider = "password", user = {} as Record<string, unknown> } = {}) {
  cookieStore.get.mockReturnValue({ value: "session-cookie" });
  adminAuth.verifySessionCookie.mockResolvedValue({ uid: "u1", auth_time: authTime, firebase: { sign_in_provider: provider } });
  adminAuth.getUser.mockResolvedValue({
    uid: "u1",
    email: "pat@example.com",
    displayName: "Pat",
    emailVerified: true,
    disabled: false,
    tokensValidAfterTime: new Date((authTime - 3600) * 1000).toUTCString(),
    ...user,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getSessionUser", () => {
  it("returns null without a cookie", async () => {
    cookieStore.get.mockReturnValue(undefined);
    await expect(getSessionUser()).resolves.toBeNull();
    expect(adminAuth.verifySessionCookie).not.toHaveBeenCalled();
  });

  it("returns the verified user", async () => {
    signedIn();
    await expect(getSessionUser()).resolves.toEqual({
      uid: "u1",
      email: "pat@example.com",
      name: "Pat",
      emailVerified: true,
      isAnonymous: false,
      role: "patient",
    });
  });

  it("reads the prescriber role from custom claims", async () => {
    signedIn({ user: { customClaims: { role: "prescriber" } } });
    await expect(getSessionUser()).resolves.toMatchObject({ role: "prescriber" });
  });

  it("ignores unknown role claims", async () => {
    signedIn({ user: { customClaims: { role: "admin" } } });
    await expect(getSessionUser()).resolves.toMatchObject({ role: "patient" });
  });

  it("flags anonymous guest sessions", async () => {
    signedIn({ provider: "anonymous", user: { email: undefined, displayName: undefined } });
    await expect(getSessionUser()).resolves.toMatchObject({ isAnonymous: true, email: null, name: null });
  });

  it("returns null for a forged or expired cookie", async () => {
    cookieStore.get.mockReturnValue({ value: "forged" });
    adminAuth.verifySessionCookie.mockRejectedValue(authError("auth/argument-error"));
    await expect(getSessionUser()).resolves.toBeNull();
  });

  it("returns null for disabled accounts", async () => {
    signedIn({ user: { disabled: true } });
    await expect(getSessionUser()).resolves.toBeNull();
  });

  it("returns null for sessions revoked after sign-in", async () => {
    const authTime = nowSeconds() - 600;
    signedIn({ authTime, user: { tokensValidAfterTime: new Date((authTime + 60) * 1000).toUTCString() } });
    await expect(getSessionUser()).resolves.toBeNull();
  });

  it("rethrows infrastructure errors instead of logging the user out", async () => {
    signedIn();
    adminAuth.getUser.mockRejectedValue(new Error("network down"));
    await expect(getSessionUser()).rejects.toThrow("network down");
  });
});

describe("requireUser / requirePageUser", () => {
  it("throws 401 for API callers without a session", async () => {
    cookieStore.get.mockReturnValue(undefined);
    await expect(requireUser()).rejects.toMatchObject({ statusCode: 401 });
  });

  it("redirects pages to login with the return path", async () => {
    cookieStore.get.mockReturnValue(undefined);
    await expect(requirePageUser("/history/abc")).rejects.toThrow("REDIRECT:/login?next=%2Fhistory%2Fabc");
  });
});

describe("requirePrescriber", () => {
  it("allows prescribers", async () => {
    signedIn({ user: { customClaims: { role: "prescriber" } } });
    await expect(requirePrescriber()).resolves.toMatchObject({ uid: "u1", role: "prescriber" });
  });

  it("returns 403 for patients", async () => {
    signedIn();
    await expect(requirePrescriber()).rejects.toMatchObject({ statusCode: 403 });
  });

  it("returns 403 for anonymous sessions even with the claim", async () => {
    signedIn({ provider: "anonymous", user: { customClaims: { role: "prescriber" } } });
    await expect(requirePrescriber()).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("createSessionCookie", () => {
  it("exchanges a fresh ID token", async () => {
    adminAuth.verifyIdToken.mockResolvedValue({ auth_time: nowSeconds() - 10 });
    adminAuth.createSessionCookie.mockResolvedValue("cookie-value");
    await expect(createSessionCookie("token")).resolves.toBe("cookie-value");
    expect(adminAuth.verifyIdToken).toHaveBeenCalledWith("token", true);
  });

  it("refuses sign-ins older than five minutes", async () => {
    adminAuth.verifyIdToken.mockResolvedValue({ auth_time: nowSeconds() - 600 });
    await expect(createSessionCookie("token")).rejects.toMatchObject({ statusCode: 401 });
    expect(adminAuth.createSessionCookie).not.toHaveBeenCalled();
  });

  it("refuses invalid tokens", async () => {
    adminAuth.verifyIdToken.mockRejectedValue(authError("auth/invalid-id-token"));
    await expect(createSessionCookie("bad")).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/history?x=1", "/history?x=1"],
    [null, "/"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["history", "/"],
  ])("%s -> %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});
