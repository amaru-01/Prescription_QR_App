import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeDoc = {
  id: string;
  ref: { path: string; parent: { parent: { id: string } }; update: ReturnType<typeof vi.fn> };
  data: () => Record<string, unknown>;
  get: (field: string) => unknown;
  updateTime: string;
  advanced: boolean;
};

/** Minimal in-memory stand-in for the Firestore calls runDueReminders makes. */
const { fake } = vi.hoisted(() => ({
  fake: {
    due: [] as unknown[],
    prescriptions: new Map<string, { status: string } | null>(),
    subscriptions: new Map<string, { endpoint: string; keys: object; delete: () => Promise<void> }[]>(),
    queries: 0,
    getAllSizes: [] as number[],
  },
}));

vi.mock("./firebase", () => ({
  getDb: () => ({
    collectionGroup: () => ({
      where: () => ({
        limit: (n: number) => ({
          get: async () => {
            fake.queries += 1;
            // Advanced reminders have moved into the future, so they no longer match.
            const docs = (fake.due as FakeDoc[]).filter((doc) => !doc.advanced).slice(0, n);
            return { size: docs.length, docs };
          },
        }),
      }),
    }),
    getAll: async (...refs: { path: string }[]) => {
      fake.getAllSizes.push(refs.length);
      return refs.map((ref) => {
        const p = fake.prescriptions.get(ref.path);
        return { ref, exists: Boolean(p), get: (field: string) => (p as Record<string, unknown>)?.[field] };
      });
    },
    collection: () => ({
      doc: (uid: string) => ({
        collection: (name: string) =>
          name === "prescriptions"
            ? { doc: (id: string) => ({ path: `${uid}/${id}` }) }
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

const { runDueReminders, MAX_RETRIES, RETRY_DELAY_MS } = await import("./reminders");

const NOW = new Date("2026-11-02T05:01:00Z"); // 08:01 in Nairobi
const DUE = new Date("2026-11-02T05:00:00Z");

function dueReminder(
  uid: string,
  prescriptionId: string,
  {
    dueAt = DUE,
    takenDays = [] as string[],
    updateFails = false,
    retryOrigin = undefined as Date | undefined,
    attempts = undefined as number | undefined,
  } = {}
) {
  const data: Record<string, unknown> = {
    time: "08:00",
    timezone: "Africa/Nairobi",
    notify: true,
    taken_days: takenDays,
    next_due_at: Timestamp.fromDate(dueAt),
    ...(retryOrigin ? { retry_origin: Timestamp.fromDate(retryOrigin) } : {}),
    ...(attempts !== undefined ? { attempts } : {}),
  };
  const doc: FakeDoc = {
    id: prescriptionId,
    ref: {
      path: `users/${uid}/reminders/${prescriptionId}`,
      parent: { parent: { id: uid } },
      update: vi.fn(async () => {
        if (updateFails) throw Object.assign(new Error("FAILED_PRECONDITION"), { code: 9 });
        // The first update is the "advance": the reminder leaves the due window.
        if (!doc.advanced) doc.advanced = true;
        return { writeTime: "t2" };
      }),
    },
    data: () => data,
    get: (field: string) => data[field],
    updateTime: "t1",
    advanced: false,
  };
  fake.due.push(doc);
  fake.prescriptions.set(`${uid}/${prescriptionId}`, { status: "active" });
  return { update: doc.ref.update };
}

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/";
function subscribe(uid: string, endpoint = `${ENDPOINT}${uid}`) {
  const remove = vi.fn(async () => undefined);
  fake.subscriptions.set(uid, [...(fake.subscriptions.get(uid) ?? []), { endpoint, keys: { p256dh: "k", auth: "a" }, delete: remove }]);
  return remove;
}

const sent = vi.fn(async () => "sent" as const);

beforeEach(() => {
  fake.due = [];
  fake.prescriptions.clear();
  fake.subscriptions.clear();
  fake.queries = 0;
  fake.getAllSizes = [];
  sent.mockClear();
});

describe("runDueReminders", () => {
  it("sends a generic notification and schedules tomorrow", async () => {
    const { update } = dueReminder("u1", "rx1");
    subscribe("u1");

    expect(await runDueReminders(sent, NOW)).toEqual({
      due: 1,
      sent: 1,
      sentSubscriptions: 1,
      skipped: 0,
      failed: 0,
      retried: 0,
    });

    const [, payload] = sent.mock.calls[0] as unknown as [unknown, string];
    expect(JSON.parse(payload)).toMatchObject({ title: "VeriDose reminder", url: "/reminders" });
    expect(payload).not.toMatch(/amoxicillin/i);

    const [changes, precondition] = update.mock.calls[0] as unknown as [{ next_due_at: Timestamp }, object];
    expect(changes.next_due_at.toDate().toISOString()).toBe("2026-11-03T05:00:00.000Z");
    expect(precondition).toEqual({ lastUpdateTime: "t1" });
  });

  it("counts a reminder once even when it reaches several devices", async () => {
    dueReminder("u1", "rx1");
    subscribe("u1", `${ENDPOINT}a`);
    subscribe("u1", `${ENDPOINT}b`);
    const result = await runDueReminders(sent, NOW);
    expect(result).toMatchObject({ sent: 1, sentSubscriptions: 2 });
  });

  it("does not notify when another run already advanced the reminder", async () => {
    dueReminder("u1", "rx1", { updateFails: true });
    subscribe("u1");
    expect(await runDueReminders(sent, NOW)).toMatchObject({ due: 1, sent: 0, skipped: 1 });
    expect(sent).not.toHaveBeenCalled();
    expect(fake.queries).toBe(2); // saw it once, then stopped instead of looping forever
  });

  it("skips doses already marked as taken today (local day)", async () => {
    dueReminder("u1", "rx1", { takenDays: ["2026-11-02"] });
    subscribe("u1");
    expect((await runDueReminders(sent, NOW)).sent).toBe(0);
  });

  it("skips stale reminders instead of sending them hours late", async () => {
    const { update } = dueReminder("u1", "rx1", { dueAt: new Date("2026-11-01T22:00:00Z") });
    subscribe("u1");
    expect((await runDueReminders(sent, NOW)).skipped).toBe(1);
    expect(sent).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalled(); // still moved on to the next occurrence
  });

  it("stops scheduling reminders for prescriptions that are no longer active", async () => {
    const { update } = dueReminder("u1", "rx1");
    fake.prescriptions.set("u1/rx1", { status: "completed" });
    subscribe("u1");
    await runDueReminders(sent, NOW);
    expect(sent).not.toHaveBeenCalled();
    expect((update.mock.calls[0] as unknown as [{ next_due_at: unknown }])[0].next_due_at).toBeNull();
  });

  it("removes subscriptions the push service reports as gone", async () => {
    dueReminder("u1", "rx1");
    const removeGone = subscribe("u1", `${ENDPOINT}gone`);
    const removeLive = subscribe("u1", `${ENDPOINT}live`);
    const send = vi.fn(async (sub: { endpoint: string }) => (sub.endpoint.endsWith("gone") ? "gone" : "sent") as "gone" | "sent");

    expect((await runDueReminders(send, NOW)).sent).toBe(1);
    expect(removeGone).toHaveBeenCalled();
    expect(removeLive).not.toHaveBeenCalled();
  });

  it("never sends to a stored endpoint that is not a known push service, and deletes it", async () => {
    dueReminder("u1", "rx1");
    const removeBad = subscribe("u1", "https://internal.example.com/hook");
    const result = await runDueReminders(sent, NOW);
    expect(sent).not.toHaveBeenCalled();
    expect(removeBad).toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });
});

describe("runDueReminders at volume", () => {
  it("drains a backlog larger than one page in a single run", async () => {
    for (let i = 0; i < 450; i++) {
      dueReminder(`u${i}`, "rx1");
      subscribe(`u${i}`);
    }
    const result = await runDueReminders(sent, NOW);
    expect(result).toMatchObject({ due: 450, sent: 450, skipped: 0 });
    expect(sent).toHaveBeenCalledTimes(450);
    // Prescription statuses are fetched in batches, not one read per reminder.
    expect(fake.getAllSizes).toEqual([200, 200, 50]);
  });

  it("never has more than the concurrency limit of deliveries in flight", async () => {
    for (let i = 0; i < 60; i++) {
      dueReminder(`u${i}`, "rx1");
      subscribe(`u${i}`);
    }
    let inFlight = 0;
    let peak = 0;
    const slow = vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight -= 1;
      return "sent" as const;
    });
    await runDueReminders(slow, NOW);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(15);
  });

  it("stops starting new pages once the time budget is spent", async () => {
    for (let i = 0; i < 450; i++) {
      dueReminder(`u${i}`, "rx1");
      subscribe(`u${i}`);
    }
    const result = await runDueReminders(sent, NOW, { budgetMs: 0 });
    expect(result.due).toBe(0); // the rest stay due for the next run
  });
});

describe("runDueReminders retries", () => {
  const failing = vi.fn(async () => "failed" as const);
  beforeEach(() => failing.mockClear());

  it("reschedules a reminder whose every delivery failed", async () => {
    const { update } = dueReminder("u1", "rx1");
    subscribe("u1");

    const result = await runDueReminders(failing, NOW);
    expect(result).toMatchObject({ sent: 0, retried: 1, failed: 0 });

    expect(update).toHaveBeenCalledTimes(2);
    const [retry, precondition] = update.mock.calls[1] as unknown as [
      { next_due_at: Timestamp; retry_origin: Timestamp; attempts: number },
      { lastUpdateTime: string },
    ];
    expect(retry.next_due_at.toDate().getTime()).toBe(NOW.getTime() + RETRY_DELAY_MS);
    expect(retry.retry_origin.toDate().toISOString()).toBe(DUE.toISOString());
    expect(retry.attempts).toBe(1);
    expect(precondition).toEqual({ lastUpdateTime: "t2" }); // only if nobody changed it meanwhile
  });

  it("does not retry when at least one device received it", async () => {
    dueReminder("u1", "rx1");
    subscribe("u1", `${ENDPOINT}a`);
    subscribe("u1", `${ENDPOINT}b`);
    const mixed = vi.fn(async (sub: { endpoint: string }) => (sub.endpoint.endsWith("a") ? "sent" : "failed") as "sent" | "failed");
    expect(await runDueReminders(mixed, NOW)).toMatchObject({ sent: 1, retried: 0, failed: 0 });
  });

  it("measures staleness from the original due time on a retry", async () => {
    // Retry fires 5 min after the original 05:00 dose; the dose was due 05:00, not 05:05.
    const origin = new Date("2026-11-02T05:00:00Z");
    dueReminder("u1", "rx1", { dueAt: new Date(origin.getTime() + RETRY_DELAY_MS), retryOrigin: origin, attempts: 1, takenDays: [] });
    subscribe("u1");
    const result = await runDueReminders(sent, new Date(origin.getTime() + RETRY_DELAY_MS + 1000));
    expect(result).toMatchObject({ sent: 1 });
  });

  it("skips a retry if the dose was logged as taken in the meantime", async () => {
    const origin = new Date("2026-11-02T05:00:00Z");
    dueReminder("u1", "rx1", {
      dueAt: new Date(origin.getTime() + RETRY_DELAY_MS),
      retryOrigin: origin,
      attempts: 1,
      takenDays: ["2026-11-02"],
    });
    subscribe("u1");
    const result = await runDueReminders(sent, new Date(origin.getTime() + RETRY_DELAY_MS + 1000));
    expect(result).toMatchObject({ sent: 0, skipped: 1 });
    expect(sent).not.toHaveBeenCalled();
  });

  it("gives up after the maximum number of retries", async () => {
    const origin = new Date("2026-11-02T05:00:00Z");
    const { update } = dueReminder("u1", "rx1", {
      dueAt: new Date(origin.getTime() + RETRY_DELAY_MS),
      retryOrigin: origin,
      attempts: MAX_RETRIES,
    });
    subscribe("u1");
    const result = await runDueReminders(failing, new Date(origin.getTime() + RETRY_DELAY_MS + 1000));
    expect(result).toMatchObject({ failed: 1, retried: 0 });
    expect(update).toHaveBeenCalledTimes(1); // advanced to tomorrow only; no new retry written
  });

  it("does not retry when the retry would land past the staleness window", async () => {
    // Already 1h58m late: another 5 minutes would make the dose stale.
    dueReminder("u1", "rx1", { dueAt: new Date("2026-11-02T03:03:00Z") });
    subscribe("u1");
    const result = await runDueReminders(failing, NOW);
    expect(result).toMatchObject({ failed: 1, retried: 0 });
  });

  it("counts reminders with no devices as skipped, not failed", async () => {
    dueReminder("u1", "rx1");
    expect(await runDueReminders(failing, NOW)).toMatchObject({ skipped: 1, failed: 0, retried: 0 });
  });

  it("keeps going when one reminder's processing throws", async () => {
    dueReminder("u1", "rx1");
    dueReminder("u2", "rx1");
    subscribe("u1");
    subscribe("u2");
    const flaky = vi.fn(async (sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith("u1")) throw new Error("socket hang up");
      return "sent" as const;
    });
    const result = await runDueReminders(flaky, NOW);
    expect(result).toMatchObject({ due: 2, sent: 1, skipped: 1 });
  });
});
