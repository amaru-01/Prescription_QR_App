import crypto from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_PIN_ATTEMPTS, hashPin } from "./rx-pin";
import { RX_CLAIM_WINDOW_SECONDS, resetSigningKeyCache, signRx, type RxPayload } from "./rx-signing";

type Doc = Record<string, unknown> | null;

/**
 * In-memory Firestore for the claim flow. Transactions read a snapshot and apply
 * writes at the end, and a thrown error discards them — like the real thing.
 */
const { db, key } = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const snap = (path: string) => {
    const data = docs.get(path);
    return { exists: data !== undefined, get: (field: string) => data?.[field] ?? undefined, data: () => data };
  };
  /** A document reference that supports the direct reads/writes the code under test uses. */
  const ref = (path: string): Record<string, unknown> & { path: string; id: string } => ({
    path,
    id: path.split("/").pop()!,
    get: async () => snap(path),
    set: async (data: Record<string, unknown>) => void docs.set(path, { ...data }),
    collection: (sub: string) => ({ doc: (subId?: string) => ref(`${path}/${sub}/${subId ?? `auto${Math.random()}`}`) }),
  });
  const sentinel = { __serverTimestamp: true };
  return {
    key: (...parts: string[]) => parts.join("/"),
    db: {
      docs,
      reset: () => docs.clear(),
      sentinel,
      api: {
        collection: (name: string) => ({
          doc: (id?: string) => ref(`${name}/${id ?? `auto${docs.size}-${Math.random()}`}`),
        }),
        runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
          const writes: (() => void)[] = [];
          const tx = {
            get: async (r: { path: string }) => snap(r.path),
            create: (r: { path: string }, data: Record<string, unknown>) => {
              writes.push(() => {
                if (docs.has(r.path)) throw new Error("ALREADY_EXISTS");
                docs.set(r.path, { ...data });
              });
            },
            set: (r: { path: string }, data: Record<string, unknown>, opts?: { merge?: boolean }) => {
              writes.push(() => docs.set(r.path, opts?.merge ? { ...(docs.get(r.path) ?? {}), ...data } : { ...data }));
            },
            update: (r: { path: string }, data: Record<string, unknown>) => {
              writes.push(() => docs.set(r.path, { ...(docs.get(r.path) ?? {}), ...data }));
            },
          };
          const result = await fn(tx);
          writes.forEach((w) => w());
          return result;
        },
      },
    },
  };
});

vi.mock("./firebase", () => ({ getDb: () => db.api }));
vi.mock("firebase-admin/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase-admin/firestore")>();
  return { ...actual, FieldValue: { ...actual.FieldValue, serverTimestamp: () => db.sentinel, delete: () => undefined } };
});

const { savePrescription } = await import("./prescriptions");
const { issuePrescription, checkRx, revokeIssued } = await import("./rx");

const input = { med: "Amoxicillin", dose: "500mg", duration: "7 days" };
const issuedPath = (iss: string, jti: string) => key("users", iss, "issued", jti);
const claimPath = (jti: string) => key("rx_claims", jti);

beforeAll(() => {
  process.env.RX_SIGNING_PRIVATE_KEY = crypto
    .generateKeyPairSync("ed25519")
    .privateKey.export({ format: "der", type: "pkcs8" })
    .toString("base64");
  resetSigningKeyCache();
});
afterAll(() => {
  delete process.env.RX_SIGNING_PRIVATE_KEY;
  resetSigningKeyCache();
});
beforeEach(() => db.reset());

/** Put an issued-code record in the store the way issuePrescription would, and sign a matching token. */
function seedIssued(opts: { pin?: string; revoked?: boolean; locked?: boolean; attempts?: number; missing?: boolean } = {}) {
  const jti = `rx-${Math.random().toString(36).slice(2)}`;
  const { payload } = signRx({ jti, iss: "doc1", isn: "Dr. Jane Smith", ...input, ...(opts.pin ? { pin: true as const } : {}) });
  if (!opts.missing) {
    db.docs.set(issuedPath("doc1", jti), {
      ...input,
      claimed_at: null,
      revoked_at: opts.revoked ? { at: "t" } : null,
      locked_at: opts.locked ? { at: "t" } : null,
      pin_hash: opts.pin ? hashPin(jti, opts.pin) : null,
      pin_attempts: opts.attempts ?? 0,
    });
  }
  return payload;
}

const save = (rx: RxPayload, pin?: string, uid = "patient1") => savePrescription(uid, input, { rx, pin });

describe("claiming a code the prescriber issued", () => {
  it("verifies and marks the issued record as claimed", async () => {
    const rx = seedIssued();
    const result = await save(rx);
    expect(result.rx).toMatchObject({ status: "verified", pinRequired: false });
    expect(db.docs.get(claimPath(rx.jti))).toMatchObject({ uid: "patient1" });
    expect(db.docs.get(issuedPath("doc1", rx.jti))?.claimed_at).toBeDefined();
  });

  it("saves a withdrawn code as an unverified record, with the reason", async () => {
    const rx = seedIssued({ revoked: true });
    const result = await save(rx);
    expect(result.rx).toEqual({ status: "invalid", reason: "revoked" });
    expect(result.prescription.verification).toBeNull();
    expect(db.docs.has(claimPath(rx.jti))).toBe(false);
  });

  it("treats a code whose issued record is gone (prescriber deleted) as withdrawn", async () => {
    const rx = seedIssued({ missing: true });
    expect((await save(rx)).rx).toEqual({ status: "invalid", reason: "revoked" });
  });

  it("saves a locked code as unverified", async () => {
    const rx = seedIssued({ pin: "123456", locked: true });
    expect((await save(rx, "123456")).rx).toEqual({ status: "invalid", reason: "locked" });
  });

  it("still lets only one account claim a code", async () => {
    const rx = seedIssued();
    await save(rx, undefined, "patient1");
    expect((await save(rx, undefined, "patient2")).rx).toEqual({ status: "invalid", reason: "claimed" });
    await expect(save(rx, undefined, "patient1")).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("PIN-protected codes", () => {
  it("verifies with the right PIN", async () => {
    const rx = seedIssued({ pin: "042917" });
    const result = await save(rx, "042917");
    expect(result.rx).toMatchObject({ status: "verified", pinRequired: true });
    expect(db.docs.has(claimPath(rx.jti))).toBe(true);
  });

  it("refuses without a PIN, saves nothing and does not count an attempt", async () => {
    const rx = seedIssued({ pin: "042917" });
    await expect(save(rx)).rejects.toMatchObject({ statusCode: 422 });
    expect(db.docs.has(claimPath(rx.jti))).toBe(false);
    expect(db.docs.get(issuedPath("doc1", rx.jti))?.pin_attempts).toBe(0);
  });

  it("refuses a wrong PIN, counts it, and says how many tries are left", async () => {
    const rx = seedIssued({ pin: "042917" });
    await expect(save(rx, "000000")).rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining("4 attempts left") });
    expect(db.docs.get(issuedPath("doc1", rx.jti))?.pin_attempts).toBe(1);
    expect(db.docs.has(claimPath(rx.jti))).toBe(false);
  });

  it("locks the code after the maximum number of wrong PINs, even if the right one follows", async () => {
    const rx = seedIssued({ pin: "042917" });
    for (let i = 1; i < MAX_PIN_ATTEMPTS; i += 1) {
      await expect(save(rx, "000000")).rejects.toMatchObject({ statusCode: 403 });
    }
    await expect(save(rx, "000000")).rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining("locked") });
    expect(db.docs.get(issuedPath("doc1", rx.jti))?.locked_at).toBeDefined();

    // The right PIN no longer helps: the code can only be saved as an unverified record.
    const result = await save(rx, "042917");
    expect(result.rx).toEqual({ status: "invalid", reason: "locked" });
    expect(db.docs.has(claimPath(rx.jti))).toBe(false);
  });

  it("does not take a PIN from a code that does not need one", async () => {
    const rx = seedIssued();
    expect((await save(rx, "123456")).rx).toMatchObject({ status: "verified", pinRequired: false });
  });

  it("does not ask the account that already saved the code for a PIN", async () => {
    const rx = seedIssued({ pin: "042917" });
    await save(rx, "042917");
    await expect(save(rx, undefined)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("issuing", () => {
  const prescriber = {
    uid: "doc1", email: "d@example.com", name: "x", emailVerified: true, isAnonymous: false,
    role: "prescriber" as const, credentialName: "Dr. Jane Smith",
  };

  it("defaults to a 7-day claim window", async () => {
    const { issued } = await issuePrescription(prescriber, input);
    const seconds = (Date.parse(issued.expiresAt) - Date.parse(issued.issuedAt)) / 1000;
    expect(seconds).toBe(RX_CLAIM_WINDOW_SECONDS);
    expect(RX_CLAIM_WINDOW_SECONDS).toBe(7 * 24 * 60 * 60);
  });

  it.each([1, 7, 30] as const)("honours a %i-day window", async (days) => {
    const { issued } = await issuePrescription(prescriber, input, { validityDays: days });
    expect((Date.parse(issued.expiresAt) - Date.parse(issued.issuedAt)) / 1000).toBe(days * 24 * 60 * 60);
  });

  it("returns a 6-digit PIN once and stores only its hash", async () => {
    const { pin, issued, qrText } = await issuePrescription(prescriber, input, { requirePin: true });
    expect(pin).toMatch(/^\d{6}$/);
    const stored = db.docs.get(issuedPath("doc1", issued.rxId))!;
    expect(JSON.stringify(stored)).not.toContain(pin!);
    expect(JSON.stringify(JSON.parse(qrText))).not.toContain(pin!);
    expect(stored.pin_hash).toBe(hashPin(issued.rxId, pin!));
    expect(issued.pinProtected).toBe(true);
  });

  it("issues no PIN unless asked", async () => {
    const { pin, issued } = await issuePrescription(prescriber, input);
    expect(pin).toBeNull();
    expect(issued.pinProtected).toBe(false);
    expect(db.docs.get(issuedPath("doc1", issued.rxId))?.pin_hash).toBeNull();
  });

  it("the end-to-end flow works: issue with PIN, scan, claim", async () => {
    const { qrText, pin } = await issuePrescription(prescriber, input, { requirePin: true });
    const { rx: token } = JSON.parse(qrText);
    const { verifyRx } = await import("./rx-signing");
    const verified = verifyRx(token);
    if (!verified.valid) throw new Error("token should verify");
    await expect(save(verified.payload, "999999")).rejects.toMatchObject({ statusCode: 403 });
    expect((await save(verified.payload, pin!)).rx).toMatchObject({ status: "verified" });
  });
});

describe("revoking", () => {
  it("withdraws an unclaimed code, and it can no longer be verified", async () => {
    const rx = seedIssued();
    await revokeIssued("doc1", rx.jti);
    expect(db.docs.get(issuedPath("doc1", rx.jti))?.revoked_at).toBeDefined();
    expect((await save(rx)).rx).toEqual({ status: "invalid", reason: "revoked" });
  });

  it("is idempotent", async () => {
    const rx = seedIssued();
    await revokeIssued("doc1", rx.jti);
    await expect(revokeIssued("doc1", rx.jti)).resolves.toBeUndefined();
  });

  it("cannot revoke a code a patient already saved", async () => {
    const rx = seedIssued();
    await save(rx);
    await expect(revokeIssued("doc1", rx.jti)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("cannot reach another prescriber's codes", async () => {
    const rx = seedIssued();
    await expect(revokeIssued("some-other-doctor", rx.jti)).rejects.toMatchObject({ statusCode: 404 });
    expect(db.docs.get(issuedPath("doc1", rx.jti))?.revoked_at).toBeNull();
  });
});

describe("checkRx (the review-screen preview)", () => {
  const check = (rx: RxPayload) => {
    const token = signedToken(rx);
    return checkRx("patient1", token, input);
  };
  /** Re-sign the same payload so checkRx gets a real token. */
  function signedToken(rx: RxPayload) {
    return signRx({ jti: rx.jti, iss: rx.iss, isn: rx.isn, med: rx.med, dose: rx.dose, duration: rx.duration, ...(rx.pin ? { pin: true as const } : {}) }).token;
  }

  it("asks for a PIN when the code needs one", async () => {
    expect(await check(seedIssued({ pin: "123456" }))).toMatchObject({ status: "verified", pinRequired: true });
  });

  it("reports withdrawn, locked and deleted-prescriber codes", async () => {
    expect(await check(seedIssued({ revoked: true }))).toEqual({ status: "invalid", reason: "revoked" });
    expect(await check(seedIssued({ pin: "123456", locked: true }))).toEqual({ status: "invalid", reason: "locked" });
    expect(await check(seedIssued({ missing: true }))).toEqual({ status: "invalid", reason: "revoked" });
  });

  it("does not leak the PIN or its hash", async () => {
    const result = await check(seedIssued({ pin: "123456" }));
    expect(JSON.stringify(result)).not.toMatch(/123456|pin_hash/);
  });
});
