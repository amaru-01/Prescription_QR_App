import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Minimal in-memory stand-in for the Firestore calls runDueReminders makes. */
const { fake } = vi.hoisted(() => ({
  fake: {
    due: [] as unknown[],
    prescriptions: new Map<string, { status: string } | null>(),
    subscriptions: new Map<string, { endpoint: string; keys: object; delete: () => Promise<void> }[]>(),
  },
}));

vi.mock("./firebase", () => ({
  getDb: () => ({
    collectionGroup: () => ({
      where: () => ({ limit: () => ({ get: async () => ({ size: fake.due.length, docs: fake.due }) }) }),
    }),
    collection: () => ({
      doc: (uid: string) => ({
        collection: (name: string) =>
          name === "prescriptions"
            ? {
                doc: (id: string) => ({
                  get: async () => {
                    const p = fake.prescriptions.get(`${uid}/${id}`);
                    return { exists: Boolean(p), get: (field: string) => (p as Record<string, unknown>)?.[field] };
                  },
                }),
              }
            : {
                get: async () => ({
                  docs: (fake.subscriptions.get(uid) ?? []).map((sub) => ({
                    get: (field: "endpoint" | "keys") => sub[field],
                    ref: { delete: sub.delete },
                  })),
                }),
              },
      }),
    }),
  }),
}));
vi.mock("./logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { runDueReminders } = await import("./reminders");

const NOW = new Date("2026-11-02T05:01:00Z"); // 08:01 in Nairobi

function dueReminder(
  uid: string,
  prescriptionId: string,
  { dueAt = new Date("2026-11-02T05:00:00Z"), takenDays = [] as string[], updateFails = false } = {}
) {
  const data = {
    time: "08:00",
    timezone: "Africa/Nairobi",
    notify: true,
    taken_days: takenDays,
    next_due_at: Timestamp.fromDate(dueAt),
  };
  const update = vi.fn(async () => {
    if (updateFails) throw Object.assign(new Error("FAILED_PRECONDITION"), { code: 9 });
  });
  const doc = {
    id: prescriptionId,
    ref: { parent: { parent: { id: uid } }, update },
    data: () => data,
    get: (field: keyof typeof data) => data[field],
    updateTime: "t1",
  };
  fake.due.push(doc);
  fake.prescriptions.set(`${uid}/${prescriptionId}`, { status: "active" });
  return { update };
}

function subscribe(uid: string, endpoint = `https://fcm.googleapis.com/fcm/send/${uid}`) {
  const remove = vi.fn(async () => undefined);
  fake.subscriptions.set(uid, [...(fake.subscriptions.get(uid) ?? []), { endpoint, keys: { p256dh: "k", auth: "a" }, delete: remove }]);
  return remove;
}

beforeEach(() => {
  fake.due = [];
  fake.prescriptions.clear();
  fake.subscriptions.clear();
});

describe("runDueReminders", () => {
  it("sends a generic notification and schedules tomorrow", async () => {
    const { update } = dueReminder("u1", "rx1");
    subscribe("u1");
    const send = vi.fn(async () => "sent" as const);

    expect(await runDueReminders(send, NOW)).toEqual({ due: 1, sent: 1, skipped: 0 });

    const [, payload] = send.mock.calls[0] as unknown as [unknown, string];
    expect(JSON.parse(payload)).toMatchObject({ title: "VeriDose reminder", url: "/reminders" });
    expect(payload).not.toMatch(/amoxicillin/i);

    const [changes, precondition] = update.mock.calls[0] as unknown as [{ next_due_at: Timestamp }, object];
    expect(changes.next_due_at.toDate().toISOString()).toBe("2026-11-03T05:00:00.000Z");
    expect(precondition).toEqual({ lastUpdateTime: "t1" });
  });

  it("does not notify when another run already advanced the reminder", async () => {
    dueReminder("u1", "rx1", { updateFails: true });
    subscribe("u1");
    const send = vi.fn(async () => "sent" as const);
    expect(await runDueReminders(send, NOW)).toEqual({ due: 1, sent: 0, skipped: 1 });
    expect(send).not.toHaveBeenCalled();
  });

  it("skips doses already marked as taken today (local day)", async () => {
    dueReminder("u1", "rx1", { takenDays: ["2026-11-02"] });
    subscribe("u1");
    const send = vi.fn(async () => "sent" as const);
    expect((await runDueReminders(send, NOW)).sent).toBe(0);
  });

  it("skips stale reminders instead of sending them hours late", async () => {
    const { update } = dueReminder("u1", "rx1", { dueAt: new Date("2026-11-01T22:00:00Z") });
    subscribe("u1");
    const send = vi.fn(async () => "sent" as const);
    expect((await runDueReminders(send, NOW)).skipped).toBe(1);
    expect(send).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalled(); // still moved on to the next occurrence
  });

  it("stops scheduling reminders for prescriptions that are no longer active", async () => {
    const { update } = dueReminder("u1", "rx1");
    fake.prescriptions.set("u1/rx1", { status: "completed" });
    subscribe("u1");
    const send = vi.fn(async () => "sent" as const);
    await runDueReminders(send, NOW);
    expect(send).not.toHaveBeenCalled();
    expect((update.mock.calls[0] as unknown as [{ next_due_at: unknown }])[0].next_due_at).toBeNull();
  });

  it("removes subscriptions the push service reports as gone", async () => {
    dueReminder("u1", "rx1");
    const removeGone = subscribe("u1", "https://fcm.googleapis.com/fcm/send/gone");
    const removeLive = subscribe("u1", "https://fcm.googleapis.com/fcm/send/live");
    const send = vi.fn(async (sub: { endpoint: string }) => (sub.endpoint.endsWith("gone") ? "gone" : "sent") as "gone" | "sent");

    expect((await runDueReminders(send, NOW)).sent).toBe(1);
    expect(removeGone).toHaveBeenCalled();
    expect(removeLive).not.toHaveBeenCalled();
  });
});
