# Data stored by VeriDose, and for how long

This describes what the app keeps, where, and when it goes away. It reflects how the code
behaves; it is not legal advice. If you operate VeriDose for patients, have your own privacy
notice reviewed for the rules that apply to you (e.g. GDPR, HIPAA, local health-data law).

## What is stored

| Data | Where | Why | Kept until |
|------|-------|-----|------------|
| Sign-in identity: email, display name, password hash, role | Firebase Authentication | Sign-in, prescriber permissions | The user deletes their account |
| Prescriptions the user saved: medication, dose, duration, notes, status, source, date, verification info | Firestore `users/{uid}/prescriptions` | The user's history | The user deletes the record or their account |
| Reminder settings and dose check-ins (last 120 days) | `users/{uid}/reminders` | Reminders and adherence | The prescription or account is deleted |
| Push subscriptions (a browser's push address and keys) | `users/{uid}/push_subscriptions` | Delivering reminder notifications | The user turns notifications off, the browser reports it expired, or the account is deleted |
| Prescriber's issued codes: medication, dose, duration, issue/expiry/claimed times | `users/{uid}/issued` | "Issued codes" list for prescribers | Account deletion, or **90 days after the code expires** (TTL) |
| For PIN-protected codes: a keyed hash of the PIN (never the PIN), the wrong-attempt count, lock and withdrawal times | inside the issued-code record above | Enforcing the PIN, lockout and withdrawal | Same as issued codes |
| Claim records: which code was claimed, when, and the prescriber id | `rx_claims/{codeId}` | Stops a code being claimed twice | **90 days after the code expires** (TTL). After the patient deletes their account the record stays but is no longer linked to them |
| Role grants (who was made a prescriber, by whom, when) | `admin_audit` | Accountability | Kept (administrative record) |

Not stored: payment details, location, contacts. Push notifications never contain medication
names. Server logs contain ids and error details, not prescription contents.

## Deleting data

- **A single prescription:** History → delete. Its reminder is deleted with it.
- **Everything:** Settings → Delete account. The user re-enters their password and types
  DELETE. This removes the sign-in record and the whole `users/{uid}` tree. Claim records are
  detached from the person but kept until their 90-day expiry (see above); they hold no
  medication details.
- **Copy first:** Settings → Data & exports downloads all records as CSV (up to 20,000).

## Automatic expiry (Firestore TTL)

Issued codes and claim records carry a `purge_at` date (90 days after the code's expiry).
A one-time setup enables Firestore's TTL policies so they are removed automatically:

```bash
gcloud firestore fields ttls update purge_at --collection-group=issued   --enable-ttl --project=<PROJECT_ID>
gcloud firestore fields ttls update purge_at --collection-group=rx_claims --enable-ttl --project=<PROJECT_ID>
```

Records created before this policy existed get their dates from
`npm run backfill:retention -- --apply` (run it once without `--apply` to preview).
Firestore deletes expired documents in the background, normally within a day or two of
`purge_at`, not at the exact moment.

## Changing the retention period

The value is `RX_RECORD_RETENTION_SECONDS` in `src/lib/server/rx-signing.ts`. It only applies to
records created after the change; run the backfill script after editing its 90/120-day
constants if you want to re-date existing ones.
