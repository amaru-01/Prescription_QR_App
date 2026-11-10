import { FieldValue, type Firestore, type Query } from "firebase-admin/firestore";

import { getDb } from "./firebase";

const BATCH_SIZE = 400;

/** Apply `changes` to every document a query matches, in batches under Firestore's 500-write limit. */
async function updateAll(db: Firestore, query: Query, changes: Record<string, unknown>): Promise<void> {
  for (;;) {
    const page = await query.limit(BATCH_SIZE).get();
    if (page.empty) return;
    const batch = db.batch();
    page.docs.forEach((doc) => batch.update(doc.ref, changes));
    await batch.commit();
    if (page.size < BATCH_SIZE) return;
  }
}

/**
 * Erase everything stored for a user, except what must outlive them:
 *
 *  - `users/{uid}` and every subcollection (prescriptions, reminders, push
 *    subscriptions, issued codes) are deleted.
 *  - Claim records in `rx_claims` stay, but are detached from the person
 *    (`uid` becomes null). They must remain so a copied QR code cannot be
 *    claimed a second time; they are removed by the TTL policy on `purge_at`.
 *    Claims the user issued as a prescriber lose their `prescriber_uid` too.
 *  - `admin_audit` entries (who was granted which role) are kept.
 *
 * Safe to run again if a previous attempt stopped half way.
 */
export async function deleteAccountData(uid: string): Promise<void> {
  const db = getDb();
  const claims = db.collection("rx_claims");

  // Detach the claims first: until this finishes the user can retry the whole deletion.
  await updateAll(db, claims.where("uid", "==", uid), { uid: null, prescription_id: FieldValue.delete() });
  await updateAll(db, claims.where("prescriber_uid", "==", uid), { prescriber_uid: null });

  await db.recursiveDelete(db.collection("users").doc(uid));
}
