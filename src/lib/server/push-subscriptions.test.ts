import { beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_PUSH_SUBSCRIPTIONS } from "@/lib/push-hosts";

/** In-memory subscriptions collection with the few Firestore calls savePushSubscription makes. */
const { store } = vi.hoisted(() => ({ store: { docs: [] as { id: string; endpoint: string }[], deleted: [] as string[], written: [] as string[] } }));

vi.mock("./firebase", () => {
  const collection = {
    orderBy: () => ({ __query: true }),
    doc: (id: string) => ({ id, __ref: true }),
  };
  return {
    getDb: () => ({
      collection: () => ({ doc: () => ({ collection: () => collection }) }),
      runTransaction: async (fn: (tx: unknown) => Promise<void>) =>
        fn({
          get: async () => ({ docs: store.docs.map((d) => ({ id: d.id, ref: { id: d.id } })) }),
          delete: (ref: { id: string }) => store.deleted.push(ref.id),
          set: (ref: { id: string }) => store.written.push(ref.id),
        }),
    }),
  };
});

const { savePushSubscription } = await import("./reminders");
const sha = (await import("node:crypto")).createHash;
const idOf = (endpoint: string) => sha("sha256").update(endpoint).digest("hex").slice(0, 40);
const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: "k", auth: "a" } });

beforeEach(() => {
  store.docs = [];
  store.deleted = [];
  store.written = [];
});

describe("savePushSubscription", () => {
  it("keeps everything while under the cap", async () => {
    store.docs = Array.from({ length: 3 }, (_, i) => ({ id: `old${i}`, endpoint: `https://fcm.googleapis.com/${i}` }));
    await savePushSubscription("u1", sub("https://fcm.googleapis.com/new"));
    expect(store.deleted).toEqual([]);
    expect(store.written).toEqual([idOf("https://fcm.googleapis.com/new")]);
  });

  it("evicts the oldest subscriptions once the cap is reached", async () => {
    store.docs = Array.from({ length: MAX_PUSH_SUBSCRIPTIONS }, (_, i) => ({ id: `old${i}`, endpoint: `e${i}` }));
    await savePushSubscription("u1", sub("https://fcm.googleapis.com/new"));
    expect(store.deleted).toEqual(["old0"]);
  });

  it("does not evict anything when an existing endpoint re-registers", async () => {
    const endpoint = "https://fcm.googleapis.com/same";
    store.docs = [
      ...Array.from({ length: MAX_PUSH_SUBSCRIPTIONS - 1 }, (_, i) => ({ id: `old${i}`, endpoint: `e${i}` })),
      { id: idOf(endpoint), endpoint },
    ];
    await savePushSubscription("u1", sub(endpoint));
    expect(store.deleted).toEqual([]);
  });
});
