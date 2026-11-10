import { readFileSync } from "node:fs";
import path from "node:path";

import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * VeriDose reads and writes Firestore only from the server through the Admin
 * SDK, which bypasses these rules. So the rules must refuse every request that
 * comes from a client: signed in, signed out, owner or stranger. If someone
 * loosens `firestore.rules`, these tests fail.
 */
let env: RulesTestEnvironment;

/** Every kind of document the app stores, so a new collection cannot slip through unnoticed. */
const DOCUMENT_PATHS = [
  "users/u1",
  "users/u1/prescriptions/p1",
  "users/u1/reminders/p1",
  "users/u1/push_subscriptions/s1",
  "users/u1/issued/rx1",
  "rx_claims/rx1",
  "admin_audit/a1",
  "meta/reminders-cron",
  "_health/ping",
  "some_future_collection/x",
];

const COLLECTIONS = [
  "users",
  "users/u1/prescriptions",
  "users/u1/reminders",
  "users/u1/push_subscriptions",
  "users/u1/issued",
  "rx_claims",
  "admin_audit",
];

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-veridose-rules",
    firestore: { rules: readFileSync(path.resolve(__dirname, "../../firestore.rules"), "utf8") },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

/** Put a document in every path as the server would, bypassing the rules. */
async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const p of DOCUMENT_PATHS) await setDoc(doc(db, p), { med: "Amoxicillin", seeded: true });
  });
}

const clients: [string, () => Firestore][] = [
  ["a signed-out visitor", () => env.unauthenticatedContext().firestore() as unknown as Firestore],
  ["the owner (signed in as u1)", () => env.authenticatedContext("u1").firestore() as unknown as Firestore],
  ["another signed-in user (u2)", () => env.authenticatedContext("u2").firestore() as unknown as Firestore],
  [
    "a signed-in prescriber",
    () => env.authenticatedContext("doc1", { role: "prescriber" }).firestore() as unknown as Firestore,
  ],
];

describe("test setup", () => {
  it("seeded data really exists (so the denials below are the rules, not empty data)", async () => {
    await seed();
    await env.withSecurityRulesDisabled(async (context) => {
      const snap = await getDoc(doc(context.firestore(), "users/u1/prescriptions/p1"));
      expect(snap.exists()).toBe(true);
    });
  });
});

describe.each(clients)("%s", (_name, db) => {
  it.each(DOCUMENT_PATHS)("cannot read %s", async (p) => {
    await seed();
    await assertFails(getDoc(doc(db(), p)));
  });

  it.each(DOCUMENT_PATHS)("cannot create or overwrite %s", async (p) => {
    await seed();
    await assertFails(setDoc(doc(db(), p), { med: "forged" }));
  });

  it.each(DOCUMENT_PATHS)("cannot update %s", async (p) => {
    await seed();
    await assertFails(updateDoc(doc(db(), p), { med: "forged" }));
  });

  it.each(DOCUMENT_PATHS)("cannot delete %s", async (p) => {
    await seed();
    await assertFails(deleteDoc(doc(db(), p)));
  });

  it.each(COLLECTIONS)("cannot list %s", async (c) => {
    await seed();
    await assertFails(getDocs(collection(db(), c)));
  });

  it("cannot add a document with a generated id", async () => {
    await seed();
    await assertFails(addDoc(collection(db(), "users/u1/prescriptions"), { med: "forged" }));
  });

  it("cannot run a collection-group query over everyone's reminders or issued codes", async () => {
    await seed();
    await assertFails(getDocs(collectionGroup(db(), "reminders")));
    await assertFails(getDocs(collectionGroup(db(), "issued")));
    await assertFails(getDocs(collectionGroup(db(), "prescriptions")));
  });
});
