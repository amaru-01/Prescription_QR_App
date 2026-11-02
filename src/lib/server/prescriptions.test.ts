import { describe, expect, it } from "vitest";

import type { Prescription } from "@/types/prescription";
import { csvField, toCsv, toPrescription } from "./prescriptions";

const record: Prescription = {
  id: "abc123",
  med: "Amoxicillin",
  dose: "500mg",
  duration: "7 days",
  createdAt: "2026-11-01T08:00:00.000Z",
  status: "active",
  source: "scan",
  notes: null,
  verification: null,
};

describe("csvField", () => {
  it("quotes every field", () => {
    expect(csvField("plain")).toBe('"plain"');
  });

  it("keeps commas and newlines inside one field", () => {
    expect(csvField("twice daily, with food\nno alcohol")).toBe('"twice daily, with food\nno alcohol"');
  });

  it("doubles embedded quotes", () => {
    expect(csvField('say "ahh"')).toBe('"say ""ahh"""');
  });

  it.each(["=HYPERLINK(\"http://evil\")", "+1+1", "-2+3", "@SUM(A1)", "\tcmd"])(
    "neutralises formula-like value %s",
    (value) => {
      expect(csvField(value).startsWith(`"'`)).toBe(true);
    }
  );
});

describe("toCsv", () => {
  it("writes a header row and one row per record with CRLF endings", () => {
    const csv = toCsv([record, { ...record, id: "def456", notes: "after meals, 2x" }]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('"ID","Medication","Dosage","Duration","Status","Source","Notes","Created At"');
    expect(lines[1]).toBe('"abc123","Amoxicillin","500mg","7 days","active","scan","","2026-11-01T08:00:00.000Z"');
    expect(lines[2]).toContain('"after meals, 2x"');
  });

  it("returns only the header for an empty history", () => {
    expect(toCsv([]).split("\r\n")).toHaveLength(1);
  });
});

describe("toPrescription", () => {
  it("normalizes Firestore timestamps and fills defaults", () => {
    const createdAt = new Date("2026-10-31T12:00:00.000Z");
    expect(toPrescription("id1", { med: "A", dose: "B", duration: "C", created_at: { toDate: () => createdAt } })).toEqual({
      id: "id1",
      med: "A",
      dose: "B",
      duration: "C",
      createdAt: createdAt.toISOString(),
      status: "active",
      source: "scan",
      notes: null,
      verification: null,
    });
  });

  it("handles serialized timestamps and missing dates", () => {
    expect(toPrescription("id2", { created_at: { _seconds: 0 } }).createdAt).toBe("1970-01-01T00:00:00.000Z");
    expect(toPrescription("id3", {}).createdAt).toBeNull();
  });
});
