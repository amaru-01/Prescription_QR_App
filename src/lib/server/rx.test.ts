import crypto from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resetSigningKeyCache, verifyRx } from "./rx-signing";

const { set } = vi.hoisted(() => ({ set: vi.fn(async () => undefined) }));
vi.mock("./firebase", () => ({
  getDb: () => ({ collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({ set }) }) }) }) }),
}));

const { issuePrescription } = await import("./rx");

const input = { med: "Amoxicillin", dose: "500mg", duration: "7 days" };
const prescriber = (overrides = {}) => ({
  uid: "doc1",
  email: "jane@example.com",
  name: "Dr. Impostor",
  emailVerified: true,
  isAnonymous: false,
  role: "prescriber" as const,
  credentialName: "Dr. Jane Smith",
  ...overrides,
});

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
beforeEach(() => set.mockClear());

describe("issuePrescription", () => {
  it("signs the vouched name, not the editable display name", async () => {
    const { qrText } = await issuePrescription(prescriber(), input);
    const result = verifyRx(JSON.parse(qrText).rx);
    expect(result).toMatchObject({ valid: true, payload: { isn: "Dr. Jane Smith" } });
  });

  it("refuses to issue without a vouched name", async () => {
    await expect(issuePrescription(prescriber({ credentialName: null }), input)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(set).not.toHaveBeenCalled();
  });
});
