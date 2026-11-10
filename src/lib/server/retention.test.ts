import crypto from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { RX_CLAIM_WINDOW_SECONDS, RX_RECORD_RETENTION_SECONDS, resetSigningKeyCache, signRx } from "./rx-signing";

const { writes } = vi.hoisted(() => ({
  writes: { issuedSet: [] as Record<string, unknown>[], claimCreate: [] as Record<string, unknown>[] },
}));

vi.mock("./firebase", () => {
  const issuedDoc = { kind: "issued", set: async (data: Record<string, unknown>) => void writes.issuedSet.push(data) };
  const claimDoc = { kind: "claim" };
  const prescriptionDoc = { kind: "prescription", id: "rx-doc" };
  return {
    getDb: () => ({
      collection: (name: string) =>
        name === "rx_claims"
          ? { doc: () => claimDoc }
          : { doc: () => ({ collection: (sub: string) => ({ doc: () => (sub === "issued" ? issuedDoc : prescriptionDoc) }) }) },
      runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          get: async () => ({ exists: false }),
          create: (_ref: unknown, data: Record<string, unknown>) => void writes.claimCreate.push(data),
          set: () => undefined,
        }),
    }),
  };
});

const { issuePrescription } = await import("./rx");
const { savePrescription } = await import("./prescriptions");

const input = { med: "Amoxicillin", dose: "500mg", duration: "7 days" };

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
beforeEach(() => {
  writes.issuedSet = [];
  writes.claimCreate = [];
});

const seconds = (ts: unknown) => (ts as { toMillis: () => number }).toMillis() / 1000;

describe("retention (purge_at for Firestore TTL)", () => {
  it("is 90 days", () => {
    expect(RX_RECORD_RETENTION_SECONDS).toBe(90 * 24 * 60 * 60);
  });

  it("sets purge_at on issued codes to 90 days after they expire", async () => {
    const prescriber = {
      uid: "doc1", email: "d@example.com", name: "x", emailVerified: true, isAnonymous: false,
      role: "prescriber" as const, credentialName: "Dr. Jane Smith",
    };
    await issuePrescription(prescriber, input);
    const issued = writes.issuedSet[0];
    expect(seconds(issued.purge_at) - seconds(issued.expires_at)).toBe(RX_RECORD_RETENTION_SECONDS);
  });

  it("sets purge_at on claims to 90 days after the code expires, so claims outlive the code", async () => {
    const { payload } = signRx({ jti: "rx-1", iss: "doc1", isn: "Dr. Jane Smith", ...input });
    await savePrescription("patient1", input, { rx: payload });
    const claim = writes.claimCreate[0];
    expect(seconds(claim.purge_at)).toBe(payload.exp + RX_RECORD_RETENTION_SECONDS);
    expect(payload.exp - payload.iat).toBe(RX_CLAIM_WINDOW_SECONDS);
  });
});
