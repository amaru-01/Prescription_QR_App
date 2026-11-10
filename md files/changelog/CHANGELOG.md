# VeriDose changelog: security, reliability and operations work

All work below followed the audit in [../AUDIT_REPORT.md](../AUDIT_REPORT.md) and the roadmap in
[../IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md). Finding numbers (#1–#13) refer to the audit.
Everything was done on 2026-11-10. Commit ids are the local ones at the time of writing.

## At a glance

| Phase | Theme | State |
|-------|-------|-------|
| Audit | Review of the whole project | Done |
| 0 | Baseline, dependency fixes, CI scanning | Merged |
| 1 | Prescriber trust and push abuse | Merged |
| 2 | Reminder cron reliability | Merged |
| 3 | Rate limiting, guests, App Check, auth cache | Merged |
| 4 | Export, account deletion, retention | Merged |
| 5 | Claim hardening: window, PIN, revocation | Merged |
| Fix | Dependency state and CI after Dependabot merges | Merged |
| 6 | Logging, health, monitoring, test depth | **Built and verified; not yet committed** |

Tests grew from **151** at the start to **358**. Coverage is about 67 %.

---

## Audit (2026-11-10)

Reviewed the server code, API routes, config, service worker, CI and dependencies, and ran lint,
typecheck, tests and `npm audit`. Result: 13 findings, 1 high (prescribers could set the name that
is signed into prescriptions), 8 medium, the rest low. The report also lists what was already
good: deny-all Firestore rules, path-scoped queries, CSRF checks, signed and single-use codes,
generic error responses and security headers.

Not covered by the audit: the UI components (only searched for XSS sinks), the live deployment and
the Firebase and Vercel settings.

---

## Phase 0: Baseline and quick wins (`004de55`, `e2ba686`)

- Ran `npm audit fix`; moved `next` to 16.4.6 and `postcss` to 8.5.32.
- Upgraded vitest 3 to 5, which cleared the critical and high advisories in dev tooling
  (17 advisories down to 13, all moderate and transitive through `firebase-admin`).
- Added Dependabot (weekly), a CodeQL workflow, a gitleaks secret scan and a non-blocking full
  `npm audit` step to CI.
- Moved the sample QR (`prescription_qr.png`, unsigned, harmless) out of the repo root into `docs/`.
- Added a report-only coverage config and `docs/DECISIONS.md` for the open product decisions.
- Credentials turned out to be in `FIREBASE_CREDENTIALS` in `.env`, so moving
  `service-account.json` was not needed (the file is unused and safe to delete).

## Phase 1: Prescriber trust and push abuse (`527fd1a`) (#1, #2)

- **Prescriber name is now vouched for by an administrator.** It is a custom claim
  (`credentialName`) set with `npm run set-role -- ... --name "Dr. ..."`, it is the only name signed
  into a code, and prescribers can no longer edit it. Issuing without it returns 403.
- Prescribers must have a verified email. `set-role` refuses unverified accounts and records every
  grant in an `admin_audit` collection.
- Push subscriptions are accepted only from known push services (FCM, Mozilla, Apple, Windows);
  `PUSH_ALLOWED_HOSTS` adds more. Each account may register at most 10 devices. Previously stored
  endpoints that are not on the list are deleted instead of being sent to.

## Phase 2: Reminder cron reliability (`a550751`) (#5, #11)

- The cron now drains a backlog in pages of 200 with 15 in parallel (45 s budget) and reads
  prescription status in batches, instead of one at a time with a hard 500 cap.
- If a push fails on every device it is retried 5 minutes later, at most twice and never past the
  2-hour staleness window, instead of being silently lost.
- Changing or deleting a prescription now updates its reminder in the same transaction.
- The cron response reports `sent` (reminders delivered), `sentSubscriptions`, `skipped`, `failed`
  and `retried`.

## Phase 3: Abuse resistance and performance (`038acb5`) (#4, #6, #8)

- **Shared rate limits** through Upstash Redis (`UPSTASH_REDIS_REST_URL` / `_TOKEN`); they fall back
  to per-instance counters if Redis is down. Client IPs come only from Vercel's trusted header
  (`TRUST_PROXY=1` for your own proxy). The previously unlimited read routes now have limits.
- **Guests** (anonymous accounts) can scan and save, but get 403 on reminders, dose logging, import
  and push; the Reminders page explains why.
- **Firebase App Check** (reCAPTCHA Enterprise): monitor mode when only the site key is set,
  enforce mode with `APP_CHECK_ENFORCE=1`.
- 30-second per-instance cache of user lookups, cleared on profile change and sign-out-everywhere.
- Not done: `web-push` 4 (see "Dependency fix" below).

## Phase 4: Data correctness and privacy (`8ca34c1`) (#7, #9)

- CSV export streams every record (cap 20,000, with a note row if reached) instead of stopping
  silently at 500.
- The dashboard's unique-medication count now covers all records; stats are cached for 30 s.
- **Delete account** (Settings): password re-entry plus typing DELETE; erases everything under the
  user and detaches claim records so a copied QR still cannot be claimed twice.
- Issued codes and claims get a `purge_at` date (code expiry + **90 days**) for Firestore TTL;
  `npm run backfill:retention` dates older records; `docs/PRIVACY.md` documents what is stored.
- **Still to do by hand:** enable the two Firestore TTL policies (commands in `docs/PRIVACY.md`) and
  run the backfill script.

## Phase 5: Claim hardening (`d6936af`) (#3)

- Claim window is chosen per code (24 hours, **7 days default**, or 30 days) and is part of the
  signature.
- Optional **one-time 6-digit PIN**: shown once to the prescriber, stored only as a keyed hash;
  five wrong tries lock the code.
- Prescribers can **withdraw** unclaimed codes. Withdrawn, locked and deleted-prescriber codes can
  only be saved as unverified records, and the review screen says why.
- Revocation, lockout and PIN are enforced inside the claim transaction. Codes issued before this
  change keep their original 30-day expiry.

## Dependency fix after Dependabot merges (`9b6d186`, `69786f3`)

After the Dependabot PRs were merged, main failed CI and would have crashed on Vercel:

- `package.json` and the lockfile disagreed on React (19.2.6 vs 19.3.1), so `npm ci` failed.
- `web-push` 4 depends on an ES-module-only package and throws `ERR_REQUIRE_ESM` on `require()`,
  the same failure that crashed Vercel earlier. Back on 3.x; Dependabot now ignores its major bumps.
- TypeScript 7 is not supported by `typescript-eslint`, so lint failed. Back on 5.9.3 (ESLint 10
  stays). `@types/node` is back on 22 to match the Node 22 engine.
- CodeQL had `init@v3` with `analyze@v4`; both are now `@v4`, grouped in Dependabot.
- gitleaks: allowlisted the `venv/` folder (5,649 files committed early, removed later; library
  files that look like secrets). Findings now print file and rule.

## Phase 6: Logging, health, monitoring (built and verified; **not yet committed**) (#11, #12, #13)

- **Request ids:** every API response has `X-Request-Id`, and every log line for that request has
  the same id, method, path and user. A 500 body's `request_id` matches the log.
- **Security events** (`forbidden`, `rate_limited`, `pin_failed`, `pin_locked`, `claim_conflict`,
  `session_exchange_failed`, `app_check_rejected`, `code_revoked`, `account_deleted`) at `warn`,
  with a salted IP hash (`LOG_IP_SALT`) and never raw IPs, tokens, PINs or prescription contents.
- **Health:** `/api/health` does a real Firestore read with a 2 s timeout.
  `/api/health?cron=1` also returns 503 when the reminder scheduler has not succeeded for 30 min
  (`CRON_STALE_MINUTES`); the plain check ignores the scheduler.
- `src/instrumentation.ts` logs unhandled page errors with route and digest.
- `SESSION_MAX_AGE_DAYS` (1–14, default 5; 2 recommended for health data).
- Coverage thresholds (65/65/60/65); CI runs them, plus a new Firestore rules test job.
- The README has a new "Monitoring and operations" section.

---

## Known gaps and follow-ups

| Item | Why it is open |
|------|----------------|
| Firestore rules emulator tests | Written and wired into CI (Java 21) but **never run**: the dev machine has Java 17. The first CI run is the real test. |
| Sentry (error tracking) | Needs your account and DSN; the error hook is the place to add it. |
| Playwright end-to-end smoke test | Needs real sign-in credentials or the Auth emulator, plus browser downloads in CI. |
| `vercel.json` cron and function region | Hobby plans only allow daily crons; the Firestore region is unknown. Both are README notes. |
| Real-world checks | App Check, Upstash sharing across instances, the PIN flow and the new screens were tested only against in-memory fakes, not in a browser or on a deployment. |
| Moderate `npm audit` advisories | `glob` / `minimatch` through `firebase-admin`; need an upstream fix. |

## Actions required on your side

1. Re-grant every existing prescriber with `set-role --name` (Phase 1). Until then they get a 403 when issuing.
2. Set `LOG_IP_SALT` (Phase 6), and optionally `UPSTASH_REDIS_REST_*`, `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY`, `SESSION_MAX_AGE_DAYS`.
3. Enable the Firestore TTL policies and run `npm run backfill:retention` (Phase 4).
4. Add uptime monitors for `/api/health` and `/api/health?cron=1`, and an external scheduler for `/api/cron/reminders`.
5. Try the full prescription flow (issue with PIN, scan, wrong then right PIN, withdraw) on a preview deployment.
