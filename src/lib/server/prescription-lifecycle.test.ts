import { beforeEach, describe, expect, it, vi } from "vitest";

/** One fake transaction records every read and write so we can assert they commit together. */
const { tx, state } = vi.hoisted(() => ({
  state: { prescriptionExists: true, reminderExists: true, reminderData: { time: "08:00", timezone: "UTC", notify: true } as object, fail: null as null | Error },
  tx: { get: vi.fn(), update: vi.fn(), delete: vi.fn(), calls: [] as string[] },
}));

vi.mock("./firebase", () => {
  const prescriptionDoc = { kind: "prescription" };
  const reminderDoc = { kind: "reminder" };
  return {
    getDb: () => ({
      collection: () => ({
        doc: () => ({
          collection: (name: string) => ({ doc: () => (name === "prescriptions" ? prescriptionDoc : reminderDoc) }),
        }),
      }),
      runTransaction: async (fn: (t: unknown) => Promise<void>) => {
        tx.calls.length = 0;
        await fn({
          get: async (ref: { kind: string }) => {
            tx.calls.push(`get:${ref.kind}`);
            return ref.kind === "reminder"
              ? { exists: state.reminderExists, data: () => state.reminderData }
              : { exists: state.prescriptionExists };
          },
          update: (ref: { kind: string }, data: object) => {
            tx.calls.push(`update:${ref.kind}`);
            tx.update(ref, data);
          },
          delete: (ref: { kind: string }) => {
            tx.calls.push(`delete:${ref.kind}`);
            tx.delete(ref);
          },
        });
        if (state.fail) throw state.fail;
      },
    }),
  };
});

const { updatePrescription, deletePrescription } = await import("./prescriptions");

beforeEach(() => {
  tx.update.mockClear();
  tx.delete.mockClear();
  state.prescriptionExists = true;
  state.reminderExists = true;
  state.fail = null;
});

describe("updatePrescription", () => {
  it("updates the prescription and its reminder in one transaction, reads before writes", async () => {
    await updatePrescription("u1", "rx1", { status: "archived" });
    expect(tx.calls).toEqual(["get:reminder", "update:prescription", "update:reminder"]);
    const [, reminderUpdate] = tx.update.mock.calls[1] as [unknown, { next_due_at: unknown }];
    expect(reminderUpdate.next_due_at).toBeNull(); // archived: stop notifying
  });

  it("does not touch reminders for note-only edits", async () => {
    await updatePrescription("u1", "rx1", { notes: "with food" });
    expect(tx.calls).toEqual(["update:prescription"]);
  });

  it("skips the reminder write when none exists", async () => {
    state.reminderExists = false;
    await updatePrescription("u1", "rx1", { status: "completed" });
    expect(tx.calls).toEqual(["get:reminder", "update:prescription"]);
  });

  it("maps a missing prescription to 404", async () => {
    state.fail = Object.assign(new Error("NOT_FOUND"), { code: 5 });
    await expect(updatePrescription("u1", "nope", { status: "archived" })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("deletePrescription", () => {
  it("deletes the prescription and its reminder together", async () => {
    await deletePrescription("u1", "rx1");
    expect(tx.calls).toEqual(["get:prescription", "delete:prescription", "delete:reminder"]);
  });

  it("returns 404 and deletes nothing for an unknown prescription", async () => {
    state.prescriptionExists = false;
    await expect(deletePrescription("u1", "nope")).rejects.toMatchObject({ statusCode: 404 });
    expect(tx.delete).not.toHaveBeenCalled();
  });
});
