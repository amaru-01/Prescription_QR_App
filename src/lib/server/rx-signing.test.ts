import crypto from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetSigningKeyCache, rxMatches, signRx, verifyRx } from "./rx-signing";

const newKey = () =>
  crypto.generateKeyPairSync("ed25519").privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");

const fields = {
  jti: "rx-123",
  iss: "doctor-uid",
  isn: "Dr Wanjiru",
  med: "Amoxicillin",
  dose: "500mg",
  duration: "7 days",
};

/** Re-encode a token's payload with changes, keeping the original signature. */
function tamper(token: string, change: Record<string, unknown>): string {
  const [prefix, payload, signature] = token.split(".");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  const forged = Buffer.from(JSON.stringify({ ...decoded, ...change })).toString("base64url");
  return `${prefix}.${forged}.${signature}`;
}

beforeEach(() => {
  process.env.RX_SIGNING_PRIVATE_KEY = newKey();
  resetSigningKeyCache();
});

afterEach(() => {
  delete process.env.RX_SIGNING_PRIVATE_KEY;
  resetSigningKeyCache();
});

describe("signRx / verifyRx", () => {
  it("round-trips a signed prescription", () => {
    const { token, payload } = signRx(fields);
    expect(token.startsWith("vd1.")).toBe(true);
    const result = verifyRx(token);
    expect(result).toEqual({ valid: true, payload });
    expect(payload.exp - payload.iat).toBe(30 * 24 * 60 * 60);
  });

  it("accepts a PEM key with escaped newlines", () => {
    const pem = crypto.generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    process.env.RX_SIGNING_PRIVATE_KEY = pem.replace(/\n/g, "\\n");
    resetSigningKeyCache();
    expect(verifyRx(signRx(fields).token).valid).toBe(true);
  });

  it.each([
    ["dose", { dose: "5000mg" }],
    ["medication", { med: "Oxycodone" }],
    ["prescriber name", { isn: "Dr Somebody Else" }],
    ["expiry", { exp: 9_999_999_999 }],
  ])("rejects a token whose %s was altered", (_label, change) => {
    expect(verifyRx(tamper(signRx(fields).token, change))).toEqual({ valid: false, reason: "bad_signature" });
  });

  it("rejects tokens signed with another key", () => {
    const { token } = signRx(fields);
    process.env.RX_SIGNING_PRIVATE_KEY = newKey();
    resetSigningKeyCache();
    expect(verifyRx(token)).toEqual({ valid: false, reason: "unknown_key" });
  });

  it("rejects a forged kid with a foreign signature", () => {
    const { token } = signRx(fields);
    const [, payload] = token.split(".");
    const forged = `vd1.${payload}.${Buffer.alloc(64).toString("base64url")}`;
    expect(verifyRx(forged)).toEqual({ valid: false, reason: "bad_signature" });
  });

  it("rejects expired tokens", () => {
    const issued = new Date("2026-01-01T00:00:00Z");
    const { token } = signRx(fields, issued);
    expect(verifyRx(token, new Date("2026-02-15T00:00:00Z"))).toEqual({ valid: false, reason: "expired" });
    expect(verifyRx(token, new Date("2026-01-20T00:00:00Z")).valid).toBe(true);
  });

  it.each(["", "vd1.abc", "vd2.a.b", "vd1.!!!.sig", `vd1.${Buffer.from("[]").toString("base64url")}.sig`])(
    "rejects malformed token %j",
    (token) => {
      expect(verifyRx(token)).toEqual({ valid: false, reason: "malformed" });
    }
  );

  it("reports when signing is not configured", () => {
    delete process.env.RX_SIGNING_PRIVATE_KEY;
    resetSigningKeyCache();
    expect(verifyRx("vd1.a.b")).toEqual({ valid: false, reason: "not_configured" });
    expect(() => signRx(fields)).toThrow();
  });

  it("refuses non-Ed25519 keys", () => {
    process.env.RX_SIGNING_PRIVATE_KEY = crypto
      .generateKeyPairSync("ec", { namedCurve: "P-256" })
      .privateKey.export({ format: "der", type: "pkcs8" })
      .toString("base64");
    resetSigningKeyCache();
    expect(() => signRx(fields)).toThrow("Ed25519");
  });
});

describe("rxMatches", () => {
  it("requires exact field equality", () => {
    expect(rxMatches(fields, { med: "Amoxicillin", dose: "500mg", duration: "7 days" })).toBe(true);
    expect(rxMatches(fields, { med: "Amoxicillin", dose: "500 mg", duration: "7 days" })).toBe(false);
  });
});
