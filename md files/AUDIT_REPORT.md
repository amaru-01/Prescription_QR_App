# VeriDose — Security, Reliability & Performance Audit

**Date:** 2026-11-10
**Scope:** whole repository at commit `379edb2` (main). Deep read of `src/lib/server/*`, all `src/app/api/*` routes, `src/proxy.ts`, `next.config.ts`, Firestore rules/indexes, service worker, CI, scripts, dependencies.
**Method:** manual code review + `npm run lint`, `typecheck`, `test` (151 passing), `npm audit`, `npm outdated`, git history check for leaked secrets.
**Not covered:** UI components (`src/components/**`) were only grepped for XSS sinks and storage use, not reviewed line by line. No live penetration test, no load test, and I could not see the deployed Firebase/Vercel configuration (Auth providers, App Check, env vars).

## Summary

The foundation is stronger than most projects of this size: Firestore is locked to deny-all with all access going through the Admin SDK, every query is scoped by `users/{uid}` path, a per-request CSP nonce is used, CSRF is checked on every mutating route, Ed25519-signed prescriptions are claimed in a transaction, the CSV export neutralises formula injection, and error details are never echoed to clients.

The real risks sit in three areas: **trust of the prescriber identity** (self-editable signed name, first-come claiming), **server-side request abuse through push subscriptions**, and **the reminder cron not being robust at scale**. None is an emergency for a small deployment; the first four should be fixed before real clinical use.

| # | Severity | Area | Finding |
|---|----------|------|---------|
| 1 | High | Security | Prescriber can set any display name, and that name is signed into every QR |
| 2 | Medium | Security | Push endpoint is any `https` URL → server-side request to arbitrary hosts (SSRF) |
| 3 | Medium | Security | Verified-claim is first-come: anyone who sees a QR can claim it first |
| 4 | Medium | Security | Anonymous guests and unverified emails can reach all write APIs |
| 5 | Medium | Reliability | Cron is serial, capped at 500, and a failed push is never retried |
| 6 | Medium | Security | Rate limiter is per-instance memory and trusts `X-Forwarded-For` |
| 7 | Medium | Privacy | No way to delete an account's data; no retention on `issued`/`rx_claims` |
| 8 | Medium | Performance | Extra Firebase Auth network call on every authenticated request |
| 9 | Medium | Correctness | CSV export and dashboard "unique meds" silently truncate at 500 records |
| 10 | Low–Med | Supply chain | Dependency advisories; CI ignores dev-dependency advisories; no Dependabot |
| 11 | Low | Reliability | Non-atomic multi-step writes; `/health` doesn't check Firestore |
| 12 | Low | Ops | No crons in `vercel.json`, no error tracking, no log correlation |
| 13 | Low | Hygiene | Misc: tracked `prescription_qr.png`, local service-account file, tests gaps |

---

## Security

### 1. Prescriber name is user-controlled and is signed into the QR — High
- `PATCH /api/auth/profile` ([src/app/api/auth/profile/route.ts](src/app/api/auth/profile/route.ts)) lets any user set `displayName` to any 2–60 character string.
- `issuePrescription` ([src/lib/server/rx.ts:40](src/lib/server/rx.ts#L40)) copies `prescriber.name` into the signed payload as `isn`, and the patient's verification screen displays it.
- **Scenario:** a legitimately granted prescriber renames themselves "Dr. Jane Smith, Mercy Hospital" and issues codes that show a verified badge under that name. The signature proves "issued by a VeriDose prescriber account", but the UI presents a name the prescriber chose themselves.
- **Fix:** make the name non-editable for prescribers (set it in `scripts/set-role.mjs` as a custom claim, e.g. `claims.credentialName`), sign that claim rather than `displayName`, and show the account email/ID alongside. Require `emailVerified` in `requirePrescriber` and in `set-role`.

### 2. Push subscription endpoint → SSRF — Medium
- `pushSubscriptionSchema` ([src/lib/schemas.ts](src/lib/schemas.ts)) accepts any `https` URL. The cron job later makes `web-push` send a POST to that URL from your server.
- Any signed-in user (including anonymous guests, see #4) can store `https://internal-or-third-party-host/...` and have the server POST an encrypted body to it every reminder. Impact is limited (HTTPS only, fixed body, no response returned), but it is a blind request-forgery and port-scan primitive and can be used to hammer a third party from your IP.
- The number of subscriptions per user is also unbounded, so one account can multiply cron work.
- **Fix:** allowlist push-service hosts (`fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.notify.windows.com`, `web.push.apple.com`); cap subscriptions per user (e.g. 10) and reject the 11th.

### 3. First-come claiming of "verified" prescriptions — Medium
- The QR carries the med/dose/duration in plain text plus the token ([src/lib/server/rx.ts:51](src/lib/server/rx.ts#L51)). Whoever saves it first gets the verified record; later savers are told `claimed` ([prescriptions.ts savePrescription](src/lib/server/prescriptions.ts)).
- A photographed or shared QR image (screenshots, chat, a pharmacy counter) can be claimed by someone else before the patient. The claim window is 30 days.
- **Fix options:** bind the code to a short one-time PIN the prescriber reads to the patient; shorten the window (e.g. 24–72 h) or let the prescriber choose; let the prescriber revoke an unclaimed code (the `issued` doc already exists, so a `revoked` flag checked at claim/verify time is easy).

### 4. Anonymous guests / unverified emails can use everything — Medium
- `isAnonymous` is tracked but only `requirePrescriber` checks it. Guests can save, create reminders, register push subscriptions and call every write route. Creating anonymous accounts is cheap, so per-uid rate limits are trivially sidestepped.
- **Fix:** enable Firebase **App Check** (reCAPTCHA Enterprise / Play Integrity) for Auth and require it on the session exchange; decide which features guests actually need and `403` the rest; consider requiring verified email for push and signing.

### 6. Rate limiting is weak (and absent on reads) — Medium
- [security.ts](src/lib/server/security.ts) stores counters in instance memory. On Vercel every cold/parallel instance has its own counters, so the effective limit is `limit × instances`. The code comment already acknowledges this.
- `clientIp` trusts the first `X-Forwarded-For` value. On Vercel that header is set by the platform, but on any other host (or behind a proxy that appends) a client can send a fake value and rotate buckets. If no header is present every client shares the `"unknown"` bucket.
- No limit on: `GET /api/prescriptions`, `GET /api/prescriptions/[id]`, `GET /api/auth/session`, `/health`, `/api/health`, `DELETE /api/auth/session`, `DELETE /api/push/subscription`. Reads still cost Firestore reads (billing DoS).
- **Fix:** move to a shared store (Upstash Redis / Vercel KV) for auth, issue, save and cron-adjacent routes; use the platform-trusted IP (`request.ip` / `x-vercel-forwarded-for`); add a generous read limit.

### 7. Privacy / data lifecycle — Medium
- Prescription data is health data. There is no "delete my account and data" flow: deleting a Firebase Auth user leaves `users/{uid}/**` (prescriptions, reminders, push subscriptions, issued) and `rx_claims` behind.
- `issued` and `rx_claims` grow forever. Push subscriptions for dead devices are only removed when a push returns 404/410.
- **Fix:** add `DELETE /api/auth/account` that deletes the subtree (`db.recursiveDelete`) then the Auth user, plus a data export. Set Firestore **TTL policies** on `issued.expires_at` (+ grace) and `rx_claims`. Document retention in the README/privacy page.
- Positive: reminder push payloads deliberately omit medication names.

### Other security notes
- **Session cookie:** `HttpOnly`, `Secure` (prod), `SameSite=Lax`, 5-day lifetime, revocation honoured, and sign-in age limited to 5 minutes on exchange — good. Consider shortening to 24 h–2 days for a clinical app.
- **CSP:** nonce + `strict-dynamic`, `frame-ancestors 'none'`, `object-src 'none'` — good. The only weakness is `style-src 'unsafe-inline'` (accepted for React style attributes). API responses have `default-src 'none'`.
- **HSTS `preload`** is declared; be sure you really intend to submit the domain, as removal is slow.
- **`readJsonBody`** reads the full body before enforcing the size limit when `Content-Length` is absent (chunked). Next/Vercel cap bodies anyway, but stream with a counter for defence in depth.
- **Service worker** correctly skips `/api/` and only accepts same-origin notification URLs.
- **`proxy.ts`** gate only checks that a cookie exists; real verification happens in pages/routes. Acceptable, but make sure *every* new route calls `requireUser` (there is no central enforcement).
- **Secrets:** `.env` and `service-account.json` exist locally and are git-ignored; `git log --all` shows they were never committed. Keep the service-account file out of the project directory (use `GOOGLE_APPLICATION_CREDENTIALS` or a path outside the repo) and rotate it if the folder was ever zipped, synced or shared.

---

## Reliability

### 5. Reminder cron ([reminders.ts runDueReminders](src/lib/server/reminders.ts)) — Medium
- Processes up to 500 due docs **sequentially**, each with 2+ Firestore reads and one network push per subscription. `maxDuration = 60` s: at a few hundred users this will time out mid-run, and the remaining reminders are advanced only when they are reached, so they are late until the next run — and after 2 hours they are dropped as stale.
- The reminder is advanced to the next day **before** sending. If the push fails (`"failed"` outcome — network error, 5xx from the push service) or the function dies, that dose notification is lost with no retry and no record.
- `result.sent` counts per subscription, not per reminder, which skews monitoring.
- Only a single `limit(500)` page; if more than 500 are due the extra wait for the next scheduler call.
- **Fix:** process with bounded concurrency (e.g. 20), batch the prescription lookups with `getAll`, loop over pages until the time budget is used, and on `"failed"` leave a `retry_at`/attempt counter so one retry happens within the stale window. Log counts of failed sends.

### 11. Smaller correctness/robustness issues — Low
- `updatePrescription` updates the prescription and *then* updates the reminder; a crash between the two leaves a reminder firing for an archived prescription (the cron guards against this by re-checking, so the impact is a skipped notification, not a wrong one). `deletePrescription` has the same two-step shape. Use a batch/transaction.
- `getHealth` ([prescriptions.ts](src/lib/server/prescriptions.ts)) only constructs the client; it never touches Firestore, so it reports "healthy" when Firestore is unreachable. Do a cheap read (e.g. `db.collection('_health').limit(1).get()`) with a short timeout. It is also public and duplicated at `/health` and `/api/health` — rate-limit it.
- `clientIp` falling back to a shared `"unknown"` bucket means a missing header throttles all anonymous users together.

### 9. Silent truncation — Medium (correctness)
- `exportPrescriptions` calls `listPrescriptions(uid, 500)` — users with more than 500 records get an incomplete CSV with no warning.
- `getPrescriptionStats` computes `uniqueMeds` from `select("med").limit(500)` in arbitrary order, so the number is wrong above 500 records.
- **Fix:** page through all records for export (stream the CSV); for unique meds maintain a counter/normalised key on write, or label the stat "≥".

### 12. Operations — Low
- `vercel.json` is `{}`: no cron is declared, so reminders only work if someone separately sets up an external scheduler (README says so, but a missed step means silent non-delivery). Add a Vercel cron if on a paid plan, plus an alert when `/api/cron/reminders` has not succeeded in 30 minutes.
- Pin the function region next to the Firestore region to cut latency on every request.
- No error tracking (Sentry etc.) or alerting; `BackendError` below 500 is not logged at all, so repeated 401/403/429s (credential-stuffing, abuse) leave no trace. Log security-relevant events (failed session exchange, 403 on issue, claim conflicts) with the uid/IP and a request id; the 500 path already returns a `request_id`.

---

## Performance

### 8. Auth cost on every request — Medium
[`getSessionUser`](src/lib/server/auth.ts) verifies the cookie locally (cheap) and then calls `auth.getUser(uid)` — a network round trip to Google — on every page render and API call, to honour revocation and fetch the role. It is cached per request only. A dashboard page load can add 50–200 ms and a Google API quota hit each time.
**Fix:** cache the `getUser` result in a short-lived (30–60 s) in-memory LRU keyed by uid (revocation then takes up to one minute, which is acceptable; "sign out everywhere" can still delete the cache entry on the instance that handles it), or move the role into the session cookie's claims and accept refresh-on-change.

### Other performance notes
- **Dashboard stats** run 5 count aggregations plus a 500-document read on every load. Cache for 30–60 s per user or maintain counters.
- **Per-request nonce** in `proxy.ts` makes every page dynamic (no static/CDN caching for pages). That is the normal cost of nonce-based CSP; make sure public pages (`/login`, `/offline`) stay light.
- **`GET /api/prescriptions`** pagination is cursor-based and capped at 500 — good. `Cache-Control: no-store` on all private responses — good.
- **Service worker** caches only the offline shell; no stale-while-revalidate for static assets (Next already fingerprints them, so this is fine).
- **QR decoding (`jsqr`)** runs on the main thread; if scanning feels janky on low-end phones move it into a Web Worker (not profiled in this audit).
- Cron reads one document per reminder for the prescription status — see #5 (`getAll`).

---

## Dependencies & CI

### 10. Supply chain — Low–Medium
- `npm audit --omit=dev`: **6 moderate** (glob / minimatch / rimraf chain through `firebase-admin` → `google-gax`); `npm audit fix` is offered. CI only fails on high+, so these pass silently.
- Full `npm audit`: **17 findings — 1 high, 2 critical, 14 moderate**, all in dev tooling: `postcss ≤ 8.5.22` (high; you are pinned to 8.5.8, 8.5.32 is available), `tinypool`/`@vitest/mocker` via vitest (critical). They don't ship to production but they run on developer machines and CI. The CI step uses `--omit=dev`, so these are never flagged.
- Behind latest: `next` 16.4.4 → 16.4.6 (patch releases of a framework are worth taking promptly), `react`/`react-dom` 19.2.6 → 19.3.1, `postcss`, `tailwindcss`, `vitest` (3 → 5), `web-push` 3.6.7 → 4.0.0.
- Mixed exact and caret ranges; `overrides` pin `jose` for `jwks-rsa` (the Vercel `ERR_REQUIRE_ESM` fix) and `@grpc/grpc-js` — keep the CI "no require(esm)" check, it is a good guard.
- **Fix:** run `npm audit fix`; bump `postcss`, `vitest`, `next`; add `.github/dependabot.yml` (npm + github-actions, weekly); run a second non-blocking `npm audit` (including dev) in CI and surface the result; pin GitHub Actions by SHA.

---

## Hygiene / testing

### 13. Misc — Low
- `prescription_qr.png` is committed at the repo root. I did not inspect it; confirm it is sample data signed with a throw-away key (a real signed code is a real claimable prescription) and move it to docs or remove it.
- `scripts/set-role.mjs` does not require a verified email nor log who granted the role. Log grants somewhere durable.
- **Test gaps:** route and unit tests are good (151). Missing: Firestore security-rules tests (emulator), end-to-end tests of sign-in → scan → save, a load-style test of `runDueReminders` with hundreds of docs, tests for the cron failure/retry path, and any component tests. Add a coverage threshold in `vitest.config.ts`.
- **CI** is sound (lint, types, tests, build, require(esm) check, audit, read-only permissions, concurrency). Add: Dependabot, secret scanning (gitleaks), CodeQL, and a Lighthouse/bundle-size check.

---

## Recommended order of work

1. **This week:** #1 (lock prescriber name + verified email), #2 (push host allowlist + per-user cap), `npm audit fix` + bump `next`/`postcss`/`vitest`, add Dependabot.
2. **Next:** #5 (cron concurrency + retry), #6 (shared rate limiter + trusted IP), #4 (App Check, restrict guests), #8 (short auth cache), #9 (full export, correct stats).
3. **Before real clinical/production data:** #3 (PIN or revocation, shorter claim window), #7 (account deletion, TTL, retention policy), error tracking and cron-failure alerting (#12), Firestore rules emulator tests.

## What is already good (keep it)
Deny-all Firestore rules; path-scoped queries (no IDOR possible via ids); Zod validation shared client/server with strict id regex; CSRF check on all mutating routes; Ed25519 signing with key id, expiry, constant-time cron auth, transactional single-use claims; CSV formula neutralisation; generic error responses with request ids; security headers + nonce CSP; HttpOnly sessions with revocation and recent-sign-in requirement; generic lock-screen notification text; CI guards for Node/ESM regressions.
