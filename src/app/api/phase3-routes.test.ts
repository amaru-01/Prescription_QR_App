import crypto from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BackendError } from "@/lib/server/errors";
import { resetSigningKeyCache, signRx } from "@/lib/server/rx-signing";

const { auth, data, rx, reminders, push } = vi.hoisted(() => ({
  auth: { requireUser: vi.fn(), requirePrescriber: vi.fn() },
  data: { savePrescription: vi.fn() },
  rx: { issuePrescription: vi.fn(), listIssued: vi.fn(), checkRx: vi.fn() },
  reminders: {
    runDueReminders: vi.fn(),
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
vi.mock("@/lib/server/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const save = await import("./save/route");
const issue = await import("./rx/issue/route");
const cron = await import("./cron/reminders/route");
const reminder = await import("./reminders/[id]/route");
const doses = await import("./reminders/[id]/doses/route");
const subscription = await import("./push/subscription/route");

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
    reminders.runDueReminders.mockResolvedValue({ due: 2, sent: 1, skipped: 1 });
    const res = await call("Bearer s3cret-value");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, due: 2, sent: 1, skipped: 1 });
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

  it("reports when push is not configured", async () => {
    push.isPushConfigured.mockReturnValue(false);
    const good = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "k", auth: "a" } };
    expect((await subscription.POST(post("/api/push/subscription", good))).status).toBe(503);
  });
});
