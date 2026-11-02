import { describe, expect, it } from "vitest";

import { isValidTime, isValidTimeZone, localDayKey, nextOccurrence, zonedTimeToUtc } from "./schedule";

describe("zonedTimeToUtc", () => {
  it("converts fixed-offset zones", () => {
    // Nairobi is UTC+3 all year.
    expect(zonedTimeToUtc(2026, 11, 2, 8, 0, "Africa/Nairobi").toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });

  it("handles both sides of a DST change", () => {
    // New York: EDT (UTC-4) until 2026-11-01 02:00, then EST (UTC-5).
    expect(zonedTimeToUtc(2026, 10, 31, 8, 0, "America/New_York").toISOString()).toBe("2026-10-31T12:00:00.000Z");
    expect(zonedTimeToUtc(2026, 11, 2, 8, 0, "America/New_York").toISOString()).toBe("2026-11-02T13:00:00.000Z");
  });
});

describe("nextOccurrence", () => {
  it("returns later today when the time has not passed", () => {
    const after = new Date("2026-11-02T04:00:00Z"); // 07:00 in Nairobi
    expect(nextOccurrence("08:00", "Africa/Nairobi", after).toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });

  it("rolls to tomorrow once the time has passed", () => {
    const after = new Date("2026-11-02T06:00:00Z"); // 09:00 in Nairobi
    expect(nextOccurrence("08:00", "Africa/Nairobi", after).toISOString()).toBe("2026-11-03T05:00:00.000Z");
  });

  it("is strictly after the given instant", () => {
    const exactly = new Date("2026-11-02T05:00:00Z");
    expect(nextOccurrence("08:00", "Africa/Nairobi", exactly).toISOString()).toBe("2026-11-03T05:00:00.000Z");
  });

  it("keeps the wall-clock time across a DST change", () => {
    const after = new Date("2026-10-31T13:00:00Z"); // Sat 09:00 EDT
    // Next 08:00 is Sunday after clocks go back: 08:00 EST = 13:00 UTC.
    expect(nextOccurrence("08:00", "America/New_York", after).toISOString()).toBe("2026-11-01T13:00:00.000Z");
  });

  it("crosses midnight and month ends in the local zone", () => {
    const after = new Date("2026-10-31T21:30:00Z"); // 00:30 on Nov 1 in Nairobi
    expect(nextOccurrence("00:15", "Africa/Nairobi", after).toISOString()).toBe("2026-11-01T21:15:00.000Z");
  });

  it("rejects malformed times", () => {
    expect(() => nextOccurrence("8am", "UTC")).toThrow();
  });
});

describe("localDayKey", () => {
  it("uses the local calendar day, not UTC", () => {
    const instant = new Date("2026-11-02T22:30:00Z");
    expect(localDayKey(instant, "UTC")).toBe("2026-11-02");
    expect(localDayKey(instant, "Africa/Nairobi")).toBe("2026-11-03");
  });
});

describe("validators", () => {
  it.each(["00:00", "08:30", "23:59"])("accepts %s", (value) => expect(isValidTime(value)).toBe(true));
  it.each(["24:00", "8:30", "12:60", ""])("rejects %s", (value) => expect(isValidTime(value)).toBe(false));

  it("checks IANA timezones", () => {
    expect(isValidTimeZone("Africa/Nairobi")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});
