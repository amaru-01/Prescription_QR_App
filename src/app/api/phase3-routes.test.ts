import crypto from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BackendError } from "@/lib/server/errors";
import { resetSigningKeyCache, signRx } from "@/lib/server/rx-signing";

const { auth, data, rx, reminders, push, adminAuth } = vi.hoisted(() => ({
  adminAuth: { updateUser: vi.fn() },
  auth: { requireUser: vi.fn(), requirePrescriber: vi.fn(), requireRegisteredUser: vi.fn(), invalidateUserCache: vi.fn() },
  data: { savePrescription: vi.fn() },
  rx: { issuePrescription: vi.fn(), listIssued: vi.fn(), checkRx: vi.fn(), revokeIssued: vi.fn() },
  reminders: {
    runDueReminders: vi.fn(),
    recordCronSuccess: vi.fn(),
    updateReminder: vi.fn(),
    setDoseTaken: vi.fn(),
    savePushSubscription: vi.fn(),
    deletePushSubscription: vi.fn(),
  },
  push: { isPushConfigured: vi.fn(), sendPush: vi.fn() },
}));

vi.mock("@/lib/server/auth", () => auth);
vi.mock("@/lib/server/prescriptions", () => data);
vi.mock("@/lib/server/rx", () => rx);
vi.mock("@/lib/server/reminders", () => reminders);
vi.mock("@/lib/server/push", () => push);
vi.mock("@/lib/server/firebase", () => ({ getAdminAuth: () => adminAuth }));
vi.mock("@/lib/server/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const save = await import("./save/route");
const issue = await import("./rx/issue/route");
const revoke = await import("./rx/[id]/revoke/route");
const cron = await import("./cron/reminders/route");
const reminder = await import("./reminders/[id]/route");
const doses = await import("./reminders/[id]/doses/route");
const subscription = await import("./push/subscription/route");
const profile = await import("./auth/profile/route");

const ORIGIN = "https://veridose.app";
const signed = { med: "Amoxicillin", dose: "500mg", duration: "7 days" };
let uidCounter = 0;

const post = (path: string, body: unknown, method = "POST") =>
  new Request(`${ORIGIN}${path}`, {
    method,
    headers: { "content-type": "application/json", host: "veridose.app", origin: ORIGIN },
    body: JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(() => {
  process.env.RX_SIGNING_PRIVATE_KEY = crypto
    .generateKeyPairSync("ed25519")
    .privateKey.export({ format: "der", type: "pkcs8" })
    .toString("base64");
  resetSigningKeyCache();
});

afterAll(() => {
  delete process.env.RX_SIGNING_PRIVATE_KEY;
  delete process.env.CRON_SECRET;
  resetSigningKeyCache();
});

beforeEach(() => {
  vi.resetAllMocks();
  const user = { uid: `user-${++uidCounter}`, role: "patient", isAnonymous: false };
  auth.requireUser.mockResolvedValue(user);
  auth.requireRegisteredUser.mockResolvedValue(user);
  auth.requirePrescriber.mockResolvedValue({ ...user, role: "prescriber", name: "Dr Wanjiru" });
  data.savePrescription.mockImplementation(async (_uid, input, options) => ({
    documentId: "doc1",
    prescription: { id: "doc1", ...input },
    rx: options?.rx ? { status: "verified", prescriberName: options.rx.isn, issuedAt: "x", matches: true } : { status: "none" },
  }));
});

describe("POST /api/save with a signed code", () => {
  const token = () => signRx({ jti: `rx-${uidCounter}`, iss: "doc", isn: "Dr Wanjiru", ...signed }).token;

  it("passes a valid, unedited signature to the claim transaction", async () => {
    const res = await save.POST(post("/api/save", { ...signed, rx: token() }));
    expect(res.status).toBe(200);
    expect(data.savePrescription.mock.calls[0][2].rx).toMatchObject({ isn: "Dr Wanjiru", med: "Amoxicillin" });
    expect((await res.json()).rx).toMatchObject({ status: "verified" });
  });

  it("saves edited details unverified and says why", async () => {
    const res = await save.POST(post("/api/save", { ...signed, dose: "1000mg", rx: token() }));
    expect(res.status).toBe(200);
    expect(data.savePrescription.mock.calls[0][2].rx).toBeUndefined();
    expect((await res.json()).rx).toEqual({ status: "invalid", reason: "edited" });
  });

  it("saves forged tokens unverified", async () => {
    const res = await save.POST(post("/api/save", { ...signed, rx: "vd1.forged.token" }));
    expect(data.savePrescription.mock.calls[0][2].rx).toBeUndefined();
    expect((await res.json()).rx).toEqual({ status: "invalid", reason: "malformed" });
  });

  it("passes a valid PIN through to the claim transaction", async () => {
    await save.POST(post("/api/save", { ...signed, rx: token(), pin: "042917" }));
    expect(data.savePrescription.mock.calls[0][2].pin).toBe("042917");
  });

  it.each(["12345", "1234567", "abcdef", "12 345"])("rejects a malformed PIN %j", async (pin) => {
    const res = await save.POST(post("/api/save", { ...signed, rx: token(), pin }));
    expect(res.status).toBe(422);
    expect(data.savePrescription).not.toHaveBeenCalled();
  });

  it("surfaces a wrong-PIN refusal", async () => {
    data.savePrescription.mockRejectedValue(new BackendError("That PIN doesn't match. 4 attempts left.", 403));
    const res = await save.POST(post("/api/save", { ...signed, rx: token(), pin: "000000" }));
    expect(res.status).toBe(403);
    expect((await res.json()).detail).toContain("4 attempts left");
  });

  it("surfaces the duplicate-claim conflict", async () => {
    data.savePrescription.mockRejectedValue(new BackendError("You've already saved this prescription.", 409));
    const res = await save.POST(post("/api/save", { ...signed, rx: token() }));
    expect(res.status).toBe(409);
  });
});

describe("POST /api/rx/issue", () => {
  it("is forbidden for patients", async () => {
    auth.requirePrescriber.mockRejectedValue(new BackendError("Only prescriber accounts can do this.", 403));
    const res = await issue.POST(post("/api/rx/issue", signed));
    expect(res.status).toBe(403);
    expect(rx.issuePrescription).not.toHaveBeenCalled();
  });

  it("validates fields before signing", async () => {
    const res = await issue.POST(post("/api/rx/issue", { med: "", dose: "1", duration: "1" }));
    expect(res.status).toBe(422);
    expect(rx.issuePrescription).not.toHaveBeenCalled();
  });

  it("returns QR text for prescribers", async () => {
    rx.issuePrescription.mockResolvedValue({ qrText: '{"rx":"vd1..."}', issued: { rxId: "r1" } });
    const res = await issue.POST(post("/api/rx/issue", signed));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ qr_text: '{"rx":"vd1..."}', issued: { rxId: "r1" } });
  });

  it("defaults to a 7-day window and no PIN", async () => {
    rx.issuePrescription.mockResolvedValue({ qrText: "{}", issued: { rxId: "r1" }, pin: null });
    await issue.POST(post("/api/rx/issue", signed));
    expect(rx.issuePrescription).toHaveBeenCalledWith(expect.anything(), signed, { validityDays: 7, requirePin: false });
  });

  it("passes the chosen window and PIN option, keeping them out of the signed fields", async () => {
    rx.issuePrescription.mockResolvedValue({ qrText: "{}", issued: { rxId: "r1" }, pin: "042917" });
    const res = await issue.POST(post("/api/rx/issue", { ...signed, validityDays: 1, requirePin: true }));
    expect(rx.issuePrescription).toHaveBeenCalledWith(expect.anything(), signed, { validityDays: 1, requirePin: true });
    expect(await res.json()).toMatchObject({ pin: "042917" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it.each([2, 365, "7", 0])("rejects an unsupported window %j", async (validityDays) => {
    const res = await issue.POST(post("/api/rx/issue", { ...signed, validityDays }));
    expect(res.status).toBe(422);
    expect(rx.issuePrescription).not.toHaveBeenCalled();
  });
});

describe("POST /api/rx/[id]/revoke", () => {
  const call = (id = "abc123") => revoke.POST(post(`/api/rx/${id}/revoke`, {}), params(id));

  it("is forbidden for patients", async () => {
    auth.requirePrescriber.mockRejectedValue(new BackendError("Only prescriber accounts can do this.", 403));
    expect((await call()).status).toBe(403);
    expect(rx.revokeIssued).not.toHaveBeenCalled();
  });

  it("revokes only within the signed-in prescriber's own codes", async () => {
    auth.requirePrescriber.mockResolvedValue({ uid: "doc-1", role: "prescriber" });
    expect((await call("abc123")).status).toBe(200);
    expect(rx.revokeIssued).toHaveBeenCalledWith("doc-1", "abc123");
  });

  it("returns 409 for a code a patient already saved", async () => {
    rx.revokeIssued.mockRejectedValue(new BackendError("A patient has already saved this prescription.", 409));
    expect((await call()).status).toBe(409);
  });

  it("rejects malformed ids without touching the database", async () => {
    expect((await call("../users")).status).toBe(404);
    expect(rx.revokeIssued).not.toHaveBeenCalled();
  });

  it("rejects cross-site requests", async () => {
    const res = await revoke.POST(
      new Request(`${ORIGIN}/api/rx/abc/revoke`, {
        method: "POST",
        headers: { "content-type": "application/json", host: "veridose.app", origin: "https://evil.example" },
        body: "{}",
      }),
      params("abc")
    );
    expect(res.status).toBe(403);
  });
});

describe("/api/cron/reminders", () => {
  const call = (authorization?: string) =>
    cron.GET(new Request(`${ORIGIN}/api/cron/reminders`, { headers: authorization ? { authorization } : {} }));

  it("is disabled until CRON_SECRET is set", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("Bearer anything")).status).toBe(503);
  });

  it("rejects missing or wrong secrets", async () => {
    process.env.CRON_SECRET = "s3cret-value";
    push.isPushConfigured.mockReturnValue(true);
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect(reminders.runDueReminders).not.toHaveBeenCalled();
  });

  it("runs due reminders with the right secret", async () => {
    process.env.CRON_SECRET = "s3cret-value";
    push.isPushConfigured.mockReturnValue(true);
    reminders.runDueReminders.mockResolvedValue({ due: 2, sent: 1, sentSubscriptions: 1, skipped: 1, failed: 0, retried: 0 });
    const res = await call("Bearer s3cret-value");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, due: 2, sent: 1, sentSubscriptions: 1, skipped: 1, failed: 0, retried: 0 });
  });

  it("records each successful run so monitoring can tell when the scheduler stops", async () => {
    process.env.CRON_SECRET = "s3cret-value";
    push.isPushConfigured.mockReturnValue(true);
    const result = { due: 0, sent: 0, sentSubscriptions: 0, skipped: 0, failed: 0, retried: 0 };
    reminders.runDueReminders.mockResolvedValue(result);
    await call("Bearer s3cret-value");
    expect(reminders.recordCronSuccess).toHaveBeenCalledWith(result);
  });

  it("does not fail a run that worked just because recording it failed", async () => {
    process.env.CRON_SECRET = "s3cret-value";
    push.isPushConfigured.mockReturnValue(true);
    reminders.runDueReminders.mockResolvedValue({ due: 1, sent: 1, sentSubscriptions: 1, skipped: 0, failed: 0, retried: 0 });
    reminders.recordCronSuccess.mockRejectedValue(new Error("firestore down"));
    expect((await call("Bearer s3cret-value")).status).toBe(200);
  });

  it("does not record a run that failed", async () => {
    process.env.CRON_SECRET = "s3cret-value";
    push.isPushConfigured.mockReturnValue(true);
    reminders.runDueReminders.mockRejectedValue(new Error("boom"));
    expect((await call("Bearer s3cret-value")).status).toBe(500);
    expect(reminders.recordCronSuccess).not.toHaveBeenCalled();
  });

  it("does not record when the caller is not authorised", async () => {
    process.env.CRON_SECRET = "s3cret-value";
    await call("Bearer wrong");
    expect(reminders.recordCronSuccess).not.toHaveBeenCalled();
  });
});

describe("reminder and push routes", () => {
  it("rejects invalid times and timezones", async () => {
    expect((await reminder.PUT(post("/api/reminders/abc", { time: "25:00", timezone: "UTC" }, "PUT"), params("abc"))).status).toBe(422);
    expect((await reminder.PUT(post("/api/reminders/abc", { time: "08:00", timezone: "Nowhere/City" }, "PUT"), params("abc"))).status).toBe(422);
    expect(reminders.updateReminder).not.toHaveBeenCalled();
  });

  it("updates a reminder for the signed-in user", async () => {
    reminders.updateReminder.mockResolvedValue({ time: "21:00", timezone: "Africa/Nairobi", notify: true, takenDays: [] });
    const res = await reminder.PUT(post("/api/reminders/abc", { time: "21:00", notify: true, timezone: "Africa/Nairobi" }, "PUT"), params("abc"));
    expect(res.status).toBe(200);
    expect(reminders.updateReminder).toHaveBeenCalledWith(expect.stringMatching(/^user-/), "abc", {
      time: "21:00",
      notify: true,
      timezone: "Africa/Nairobi",
    });
  });

  it("validates dose check-ins", async () => {
    expect((await doses.POST(post("/api/reminders/abc/doses", { day: "yesterday", taken: true }), params("abc"))).status).toBe(422);
    expect((await doses.POST(post("/api/reminders/../doses", { day: "2026-11-02", taken: true }), params("..")) ).status).toBe(404);
  });

  it("only accepts https push endpoints", async () => {
    push.isPushConfigured.mockReturnValue(true);
    const bad = { endpoint: "http://push.example/abc", keys: { p256dh: "k", auth: "a" } };
    expect((await subscription.POST(post("/api/push/subscription", bad))).status).toBe(422);
    const good = { ...bad, endpoint: "https://fcm.googleapis.com/fcm/send/abc" };
    expect((await subscription.POST(post("/api/push/subscription", good))).status).toBe(200);
    expect(reminders.savePushSubscription).toHaveBeenCalled();
  });

  it("rejects https endpoints that are not a known push service", async () => {
    push.isPushConfigured.mockReturnValue(true);
    for (const endpoint of ["https://169.254.169.254/latest", "https://fcm.googleapis.com.evil.com/x", "https://example.com/hook"]) {
      const res = await subscription.POST(post("/api/push/subscription", { endpoint, keys: { p256dh: "k", auth: "a" } }));
      expect(res.status).toBe(422);
    }
    expect(reminders.savePushSubscription).not.toHaveBeenCalled();
  });

  it("reports when push is not configured", async () => {
    push.isPushConfigured.mockReturnValue(false);
    const good = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "k", auth: "a" } };
    expect((await subscription.POST(post("/api/push/subscription", good))).status).toBe(503);
  });
});

describe("PATCH /api/auth/profile", () => {
  it("lets patients change their display name", async () => {
    auth.requireUser.mockResolvedValue({ uid: "p1", role: "patient", isAnonymous: false, name: "Pat" });
    adminAuth.updateUser.mockResolvedValue(undefined);
    const res = await profile.PATCH(post("/api/auth/profile", { name: "Pat Jones" }, "PATCH"));
    expect(res.status).toBe(200);
    expect(adminAuth.updateUser).toHaveBeenCalledWith("p1", { displayName: "Pat Jones" });
  });

  it("does not let prescribers rename themselves", async () => {
    auth.requireUser.mockResolvedValue({ uid: "d1", role: "prescriber", isAnonymous: false, name: "Dr Wanjiru" });
    const res = await profile.PATCH(post("/api/auth/profile", { name: "Dr. Somebody Else, Chief of Surgery" }, "PATCH"));
    expect(res.status).toBe(403);
    expect(adminAuth.updateUser).not.toHaveBeenCalled();
  });
});

describe("guest accounts", () => {
  const guestBlocked = () =>
    auth.requireRegisteredUser.mockRejectedValue(new BackendError("Create a free account to use this feature.", 403));

  it("cannot change reminders, log doses or import", async () => {
    guestBlocked();
    expect((await reminder.PUT(post("/api/reminders/abc", { time: "08:00", timezone: "UTC" }, "PUT"), params("abc"))).status).toBe(403);
    expect((await doses.POST(post("/api/reminders/abc/doses", { day: "2026-11-02", taken: true }), params("abc"))).status).toBe(403);
    expect(reminders.updateReminder).not.toHaveBeenCalled();
    expect(reminders.setDoseTaken).not.toHaveBeenCalled();
  });

  it("cannot register push subscriptions", async () => {
    guestBlocked();
    push.isPushConfigured.mockReturnValue(true);
    const body = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "k", auth: "a" } };
    expect((await subscription.POST(post("/api/push/subscription", body))).status).toBe(403);
    expect(reminders.savePushSubscription).not.toHaveBeenCalled();
  });
});
