import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const authModule = await import("./auth");
const {
  clearUserCache,
  createSessionCookie,
  getSessionUser,
  invalidateUserCache,
  requirePageUser,
  requirePrescriber,
  requireRegisteredUser,
  requireUser,
  safeNextPath,
} = authModule;

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
  clearUserCache();
  delete process.env.AUTH_CACHE_TTL_MS;
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
      credentialName: null,
    });
  });

  it("reads the vouched credential name from custom claims", async () => {
    signedIn({ user: { customClaims: { role: "prescriber", credentialName: "  Dr. Jane Smith " } } });
    await expect(getSessionUser()).resolves.toMatchObject({ credentialName: "Dr. Jane Smith" });
  });

  it("ignores malformed credential names", async () => {
    signedIn({ user: { customClaims: { role: "prescriber", credentialName: 42 } } });
    await expect(getSessionUser()).resolves.toMatchObject({ credentialName: null });
  });

  it("does not use the editable display name as the credential name", async () => {
    signedIn({ user: { displayName: "Dr. Impostor", customClaims: { role: "prescriber" } } });
    await expect(getSessionUser()).resolves.toMatchObject({ name: "Dr. Impostor", credentialName: null });
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
  it("rejects prescribers whose email is not verified", async () => {
    signedIn({ user: { emailVerified: false, customClaims: { role: "prescriber" } } });
    await expect(requirePrescriber()).rejects.toMatchObject({ statusCode: 403 });
  });

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

describe("user lookup cache", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("looks the user up once for repeated requests within the TTL", async () => {
    signedIn();
    await getSessionUser();
    await getSessionUser();
    await getSessionUser();
    expect(adminAuth.getUser).toHaveBeenCalledTimes(1);
    expect(adminAuth.verifySessionCookie).toHaveBeenCalledTimes(3); // the cookie is still verified every time
  });

  it("looks the user up again after the TTL", async () => {
    vi.useFakeTimers();
    signedIn();
    await getSessionUser();
    vi.advanceTimersByTime(31_000);
    await getSessionUser();
    expect(adminAuth.getUser).toHaveBeenCalledTimes(2);
  });

  it("picks up changes right away once the entry is invalidated", async () => {
    signedIn();
    await getSessionUser();
    signedIn({ user: { customClaims: { role: "prescriber", credentialName: "Dr. Jane Smith" } } });
    invalidateUserCache("u1");
    await expect(getSessionUser()).resolves.toMatchObject({ role: "prescriber" });
  });

  it("still applies the revocation check to cached users", async () => {
    const authTime = nowSeconds() - 60;
    signedIn({ authTime, user: { tokensValidAfterTime: new Date((authTime + 10) * 1000).toUTCString() } });
    await expect(getSessionUser()).resolves.toBeNull();
    await expect(getSessionUser()).resolves.toBeNull();
    expect(adminAuth.getUser).toHaveBeenCalledTimes(1);
  });

  it("can be turned off with AUTH_CACHE_TTL_MS=0", async () => {
    process.env.AUTH_CACHE_TTL_MS = "0";
    signedIn();
    await getSessionUser();
    await getSessionUser();
    expect(adminAuth.getUser).toHaveBeenCalledTimes(2);
  });
});

describe("requireRegisteredUser", () => {
  it("lets registered users through", async () => {
    signedIn();
    await expect(requireRegisteredUser()).resolves.toMatchObject({ uid: "u1" });
  });

  it("rejects guests with 403", async () => {
    signedIn({ provider: "anonymous" });
    await expect(requireRegisteredUser()).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects signed-out requests with 401", async () => {
    cookieStore.get.mockReturnValue(undefined);
    await expect(requireRegisteredUser()).rejects.toMatchObject({ statusCode: 401 });
  });
});
