import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    claims: [] as { id: string; uid: string | null; prescriber_uid: string | null }[],
    updates: [] as { id: string; changes: Record<string, unknown> }[],
    recursiveDeleted: [] as string[],
    order: [] as string[],
    batchesCommitted: 0,
  },
}));

vi.mock("./firebase", () => ({
  getDb: () => ({
    collection: (name: string) => {
      if (name === "rx_claims") {
        return {
          where: (field: "uid" | "prescriber_uid", _op: string, value: string) => ({
            limit: (n: number) => ({
              get: async () => {
                const docs = state.claims
                  .filter((c) => c[field] === value)
                  .slice(0, n)
                  .map((c) => ({ id: c.id, ref: { id: c.id, field } }));
                return { docs, size: docs.length, empty: docs.length === 0 };
              },
            }),
          }),
        };
      }
      return { doc: (id: string) => ({ path: `users/${id}` }) };
    },
    batch: () => {
      const pending: { id: string; changes: Record<string, unknown>; field: string }[] = [];
      return {
        update: (ref: { id: string; field: string }, changes: Record<string, unknown>) => pending.push({ id: ref.id, changes, field: ref.field }),
        commit: async () => {
          state.batchesCommitted += 1;
          state.order.push("detach");
          for (const { id, changes, field } of pending) {
            state.updates.push({ id, changes });
            const claim = state.claims.find((c) => c.id === id)!;
            if ("uid" in changes) claim.uid = null;
            if ("prescriber_uid" in changes) claim.prescriber_uid = null;
          }
        },
      };
    },
    recursiveDelete: async (ref: { path: string }) => {
      state.order.push("recursiveDelete");
      state.recursiveDeleted.push(ref.path);
    },
  }),
}));

const { deleteAccountData } = await import("./account");

beforeEach(() => {
  state.claims = [];
  state.updates = [];
  state.recursiveDeleted = [];
  state.order = [];
  state.batchesCommitted = 0;
});

describe("deleteAccountData", () => {
  it("deletes the user's document tree", async () => {
    await deleteAccountData("u1");
    expect(state.recursiveDeleted).toEqual(["users/u1"]);
  });

  it("detaches the user's claims instead of deleting them, so a copied QR still cannot be claimed twice", async () => {
    state.claims = [
      { id: "rx-a", uid: "u1", prescriber_uid: "doc" },
      { id: "rx-b", uid: "someone-else", prescriber_uid: "doc" },
    ];
    await deleteAccountData("u1");
    expect(state.claims.map((c) => c.uid)).toEqual([null, "someone-else"]);
    expect(state.updates.map((u) => u.id)).toEqual(["rx-a"]);
    expect(state.updates[0].changes).toMatchObject({ uid: null });
  });

  it("removes a deleted prescriber's id from the claims they issued", async () => {
    state.claims = [{ id: "rx-a", uid: "patient", prescriber_uid: "doc1" }];
    await deleteAccountData("doc1");
    expect(state.claims[0]).toMatchObject({ uid: "patient", prescriber_uid: null });
  });

  it("handles more claims than fit in one batch", async () => {
    state.claims = Array.from({ length: 950 }, (_, i) => ({ id: `rx${i}`, uid: "u1", prescriber_uid: "doc" }));
    await deleteAccountData("u1");
    expect(state.claims.every((c) => c.uid === null)).toBe(true);
    expect(state.batchesCommitted).toBe(3); // 400 + 400 + 150
  });

  it("detaches claims before deleting data, so a failed run can simply be retried", async () => {
    state.claims = [{ id: "rx-a", uid: "u1", prescriber_uid: "doc" }];
    await deleteAccountData("u1");
    expect(state.order).toEqual(["detach", "recursiveDelete"]);
  });

  it("is safe to run twice", async () => {
    state.claims = [{ id: "rx-a", uid: "u1", prescriber_uid: "doc" }];
    await deleteAccountData("u1");
    await expect(deleteAccountData("u1")).resolves.toBeUndefined();
  });
});
