import { describe, expect, it } from "vitest";

import { listQuerySchema, saveRequestSchema, updateRequestSchema } from "./schemas";

const base = { med: "Amoxicillin", dose: "500mg", duration: "7 days" };

describe("saveRequestSchema", () => {
  it("defaults source to scan and leaves notes absent", () => {
    expect(saveRequestSchema.parse(base)).toEqual({ ...base, source: "scan" });
  });

  it("falls back to scan for unknown sources", () => {
    expect(saveRequestSchema.parse({ ...base, source: "hacked" }).source).toBe("scan");
  });

  it("keeps known sources", () => {
    expect(saveRequestSchema.parse({ ...base, source: "manual" }).source).toBe("manual");
  });

  it("turns blank notes into null and trims text", () => {
    expect(saveRequestSchema.parse({ ...base, notes: "   " }).notes).toBeNull();
    expect(saveRequestSchema.parse({ ...base, notes: " take with food " }).notes).toBe("take with food");
  });

  it("rejects notes over 500 characters", () => {
    const result = saveRequestSchema.safeParse({ ...base, notes: "n".repeat(501) });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("Notes must be 500 characters or fewer");
  });

  it("rejects non-string prescription fields", () => {
    expect(saveRequestSchema.safeParse({ ...base, med: 42 }).success).toBe(false);
  });
});

describe("updateRequestSchema", () => {
  it("accepts a status change", () => {
    expect(updateRequestSchema.parse({ status: "completed" })).toEqual({ status: "completed" });
  });

  it("accepts clearing notes with null", () => {
    expect(updateRequestSchema.parse({ notes: null })).toEqual({ notes: null });
  });

  it("rejects unknown statuses", () => {
    expect(updateRequestSchema.safeParse({ status: "deleted" }).success).toBe(false);
  });

  it("requires at least one field", () => {
    const result = updateRequestSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("Provide a status or notes field to update.");
  });
});

describe("listQuerySchema", () => {
  it("defaults the limit to 100", () => {
    expect(listQuerySchema.parse({})).toEqual({ limit: 100 });
  });

  it("coerces numeric strings", () => {
    expect(listQuerySchema.parse({ limit: "25" }).limit).toBe(25);
  });

  it.each(["0", "501", "-1", "2.5", "abc"])("rejects limit=%s", (limit) => {
    expect(listQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  it("rejects cursors that could escape the collection path", () => {
    expect(listQuerySchema.safeParse({ cursor: "../users/x" }).success).toBe(false);
    expect(listQuerySchema.safeParse({ cursor: "abcDEF123_-" }).success).toBe(true);
  });
});
