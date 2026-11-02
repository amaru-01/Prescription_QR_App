import { describe, expect, it } from "vitest";

import { parsePrescriptionPayload, validatePrescription } from "./validation";

describe("parsePrescriptionPayload", () => {
  it("parses a valid QR payload and trims values", () => {
    const result = parsePrescriptionPayload('{"med":" Amoxicillin ","dose":"500mg","duration":"7 days"}');
    expect(result).toEqual({
      ok: true,
      value: { med: "Amoxicillin", dose: "500mg", duration: "7 days" },
      warnings: [],
    });
  });

  it("warns about unknown fields but still succeeds", () => {
    const result = parsePrescriptionPayload('{"med":"A","dose":"B","duration":"C","doctor":"X","notes":"ok"}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warnings).toEqual(["Extra fields ignored: doctor"]);
  });

  it("rejects text that is not JSON", () => {
    expect(parsePrescriptionPayload("https://example.com")).toEqual({
      ok: false,
      message: "Could not read the QR code. Please try again.",
    });
  });

  it.each(["[]", "null", "42", '"text"'])("rejects non-object JSON %s", (raw) => {
    const result = parsePrescriptionPayload(raw);
    expect(result).toEqual({ ok: false, message: "The QR code does not contain valid data." });
  });

  it("reports the first missing field", () => {
    const result = parsePrescriptionPayload('{"dose":"500mg","duration":"7 days"}');
    expect(result).toMatchObject({
      ok: false,
      message: "Missing medication name (med)",
      fieldErrors: { med: "Required" },
    });
  });

  it("treats whitespace-only and non-string values as missing", () => {
    const result = parsePrescriptionPayload('{"med":"A","dose":"   ","duration":7}');
    expect(result).toMatchObject({ ok: false, fieldErrors: { dose: "Required", duration: "Required" } });
  });

  it("lets over-long values through to the review step", () => {
    const result = parsePrescriptionPayload(JSON.stringify({ med: "x".repeat(300), dose: "1", duration: "1" }));
    expect(result.ok).toBe(true);
  });
});

describe("validatePrescription", () => {
  it("accepts and trims valid input", () => {
    expect(validatePrescription({ med: " Ibuprofen ", dose: "200mg ", duration: " 3 days" })).toEqual({
      ok: true,
      value: { med: "Ibuprofen", dose: "200mg", duration: "3 days" },
    });
  });

  it("reports every empty field", () => {
    const result = validatePrescription({ med: "", dose: " ", duration: "" });
    expect(result).toEqual({
      ok: false,
      errors: {
        med: "Medication name cannot be empty",
        dose: "Dosage cannot be empty",
        duration: "Duration cannot be empty",
      },
    });
  });

  it("enforces the 120 character limit after trimming", () => {
    expect(validatePrescription({ med: `  ${"a".repeat(120)}  `, dose: "1", duration: "1" }).ok).toBe(true);
    expect(validatePrescription({ med: "a".repeat(121), dose: "1", duration: "1" })).toEqual({
      ok: false,
      errors: { med: "Medication name is too long (max 120 characters)" },
    });
  });
});
