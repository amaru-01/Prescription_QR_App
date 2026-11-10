# VeriDose — Implementation Plan (from the audit)

Source: [AUDIT_REPORT.md](AUDIT_REPORT.md). Finding numbers (#1–#13) refer to that report.
Each phase ends with a green `npm run lint && npm run typecheck && npm test && npm run build`, ships as its own PR, and can be deployed on its own.

| Phase | Theme | Findings | Size |
|-------|-------|----------|------|
| 0 | Baseline, safety net, quick wins | #10, #13 | ~0.5 day |
| 1 | Prescriber trust & push abuse | #1, #2 | ~1.5 days |
| 2 | Reminder cron reliability | #5, #11 | ~2 days |
| 3 | Abuse resistance & auth performance | #4, #6, #8 | ~2.5 days |
| 4 | Data correctness & privacy | #7, #9 | ~2 days |
| 5 | Prescription claim hardening | #3 | ~2 days |
| 6 | Observability, ops & test depth | #11, #12, #13 | ~2 days |

---

## Phase 0 — Baseline, safety net, quick wins

**Goal:** make every later change safe to ship, and clear the cheap supply-chain items first.

**Tasks**
1. Create branch `chore/phase-0-baseline`; record baseline: lint, typecheck, 151 tests, build all green.
2. Dependencies (#10)
   - `npm audit fix`, then bump `postcss` → 8.5.32, `next`/`eslint-config-next` → 16.4.6, `vitest` → latest supported by Node 22 (check release notes; 3 → 5 is a major jump, do it in its own commit).
   - Leave `web-push` 4.0.0 for Phase 3 (major; read changelog first).
   - Re-run `npm audit` (with and without `--omit=dev`); record what remains and why.
3. CI
   - Add `.github/dependabot.yml` (npm + github-actions, weekly, grouped minor/patch).
   - Add a non-blocking full `npm audit` step (includes dev deps) to `ci.yml`.
   - Pin third-party actions by commit SHA.
   - Add gitleaks (or GitHub secret scanning) and CodeQL workflows.
4. Hygiene (#13)
   - Inspect `prescription_qr.png`. If it holds a real signed token, rotate `RX_SIGNING_PRIVATE_KEY`. Either way, remove it from the repo root (`git rm`) or move it to `docs/` with a note that it is sample data.
   - ~~Move `service-account.json` out of the project folder~~ — not needed: credentials come from `FIREBASE_CREDENTIALS` in `.env`; the file is unused (safe to delete).
5. Test scaffolding for later phases
   - Add `vitest` coverage config (report only, no threshold yet).
   - Add the Firebase emulator setup (`firebase.json` emulators for auth + firestore) and an `npm run test:rules` script placeholder; the real rules tests land in Phase 6.
6. Create `docs/DECISIONS.md` and record the open product decisions that later phases need answers for (see "Decisions needed" below).

**Acceptance:** CI green; `npm audit --omit=dev` shows no high/critical; no unexplained dev-dependency criticals; Dependabot opens its first PRs; `prescription_qr.png` handled.
**Rollback:** revert the PR; no runtime behaviour changes except dependency bumps (revert the lockfile).

---

## Phase 1 — Prescriber trust & push abuse

**Goal:** a verified badge can only show a name an admin vouched for; the server only calls real push services.

**Tasks**
1. Signed prescriber identity (#1)
   - Extend `scripts/set-role.mjs`: new `--name "Dr. Jane Smith"` option writes a custom claim (`role`, `credentialName`); refuse to grant `prescriber` unless the user's email is verified; log each grant (who/when/uid) to `admin_audit` in Firestore.
   - `getSessionUser`: expose `credentialName` from claims.
   - `issuePrescription`: sign `credentialName` as `isn` (fail with 403 if missing, instead of falling back to `displayName`/email).
   - `requirePrescriber`: also require `emailVerified`.
   - `PATCH /api/auth/profile`: reject name changes for prescribers (or allow, but it no longer affects signing). Update the settings UI to show the name as read-only for prescribers.
   - Tests: prescriber without claim → 403; changing `displayName` doesn't change `isn`; unverified email → 403.
2. Push subscription hardening (#2)
   - In `pushSubscriptionSchema`, validate the endpoint host against an allowlist: `fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.notify.windows.com`, `web.push.apple.com` (keep list in one constant; allow override by env for self-hosted).
   - Cap per-user subscriptions at 10 in `savePushSubscription` (transaction or count check); evict the oldest.
   - Tests: non-allowlisted host rejected (incl. lookalikes like `fcm.googleapis.com.evil.com`, userinfo tricks, `http`); 11th subscription evicts oldest.
3. Migration note: existing prescribers need re-running `set-role` with `--name`. Document in README; until then, issuing returns a clear 403 message.

**Acceptance:** all new tests pass; manual check that issuing without the claim fails and with it shows the vouched name on the scan/verify screen.
**Rollback:** feature is additive; revert PR. Existing signed codes keep verifying (payload format unchanged).

---

## Phase 2 — Reminder cron reliability

**Goal:** reminders fire on time at hundreds of users and survive transient push failures.

**Tasks**
1. Refactor `runDueReminders` (#5)
   - Collect due docs in pages of 200 until a time budget (~45 s of the 60 s `maxDuration`) or no more due docs.
   - Batch prescription status lookups with `db.getAll`; batch subscription reads per uid (cache within the run).
   - Bounded concurrency (e.g. 15 parallel reminders) using a small in-file pool, no new dependency.
   - Count `sent` per reminder (add `sentSubscriptions`), add `failed` and `retried` to `CronResult`.
2. Retry on failure
   - If every subscription send returns `"failed"` (not `"gone"`), set `retry_at` (now + 5 min) and `attempts + 1` instead of losing the dose; stop after 2 retries or when stale (existing `STALE_AFTER_MS`). Include `retry_at` in the cron query via a second small query merged with the main one, or store it back into `next_due_at` temporarily (preferred: simpler, no new index — keep a `regular_next_due_at` to restore).
3. Atomic lifecycle updates (#11)
   - Wrap prescription status update + reminder `next_due_at` update in one batch; same for delete.
4. Tests (extend `reminders.test.ts`): 500+ due docs complete within budget with a fake sender; failure → retry → success; failure ×3 → dropped and logged; overlapping runs still never double-send.

**Acceptance:** simulated 1,000 due reminders finish in one invocation or resume cleanly in the next; no duplicate sends in the overlap test.
**Rollback:** revert PR; data fields added are ignored by older code.

---

## Phase 3 — Abuse resistance & auth performance

**Goal:** limits that hold across serverless instances, guests that can't do damage, and cheaper requests.

**Tasks**
1. Shared rate limiter (#6)
   - Introduce a `RateLimiter` interface in `security.ts` with two implementations: in-memory (dev/tests) and Upstash Redis (`@upstash/ratelimit`) chosen by env (`UPSTASH_REDIS_REST_URL/TOKEN`). `rateLimit` becomes async; update all call sites and tests.
   - Fail-open with a logged warning if Redis is down (availability over lockout), except for `/api/auth/session` which fails closed to the in-memory limiter.
   - `clientIp`: prefer the platform-trusted header (`x-vercel-forwarded-for` / `x-real-ip`); only use `x-forwarded-for` when `TRUST_PROXY=1`.
   - Add limits on the read routes (list/get/session/health) with generous ceilings.
2. Guests & App Check (#4)
   - Decision first (see below). Default: guests may scan and save locally-verified records only; `403` on reminders, push subscription and import for anonymous users via a `requireRegisteredUser()` helper.
   - Enable Firebase App Check (reCAPTCHA Enterprise) in the web client, send the token with the session exchange, verify with `getAppCheck().verifyToken` in `POST /api/auth/session` (enforce behind env flag `APP_CHECK_ENFORCE`, monitor first, then turn on).
3. Auth lookup cache (#8)
   - In `getSessionUser`, add a 30 s LRU (max 1,000 entries) for the `getUser` result keyed by uid; invalidate on `DELETE /api/auth/session?all=1` and role/profile change.
   - Measure before/after request latency and Identity Toolkit call count; record in the PR.
4. `web-push` 4.x upgrade after reading the changelog; keep the CI require(esm) check.

**Acceptance:** limiter tests run against both implementations; two parallel serverless instances share counts (manual check on a Vercel preview); anonymous user gets 403 on the restricted routes; p50 latency of an authenticated API call drops measurably.
**Rollback:** env flags (`APP_CHECK_ENFORCE`, Redis vars unset → memory limiter); revert PR for the rest.

---

## Phase 4 — Data correctness & privacy

**Goal:** complete exports, correct stats, and a real data lifecycle.

**Tasks**
1. Export & stats (#9)
   - `exportPrescriptions`: page through all records (200 per page) and stream the CSV via `ReadableStream`; keep the 5/min limit; add a row cap of e.g. 20,000 with a clear header note if hit.
   - Unique meds: store `med_key` (normalised lowercase) on write; compute unique count with a distinct set over a `select("med_key")` scan paged, or maintain `users/{uid}/meta/stats` counters updated in the save/update/delete transactions. Choose counters if dashboards load often. Backfill with `scripts/migrate-prescriptions.mjs`.
   - Cache stats per user for 30 s.
2. Account deletion & export (#7)
   - `DELETE /api/auth/account`: requires a recent sign-in (≤ 5 min), then `db.recursiveDelete(users/{uid})`, deletes `rx_claims` where `uid == user` (keep a minimal tombstone `{jti, claimed: true}` so a deleted claim can't be re-claimed), then `auth.deleteUser`, then clears the cookie.
   - Settings UI: "Delete my account" with typed confirmation; link to the CSV export.
3. Retention
   - Firestore TTL policies: `users/*/issued.purge_at` (= expires_at + 90 d), `rx_claims.purge_at`, stale `push_subscriptions.last_seen`. Write `purge_at` on create; document the one-time `gcloud firestore fields ttls update` commands.
   - Short `docs/PRIVACY.md` stating what is stored, why and for how long.
4. Tests: export of 1,200 records returns all; deletion removes every subcollection and the claim tombstone remains; stats match fixtures.

**Acceptance:** export row count equals record count for a seeded 1,200-record user; account deletion leaves no documents under the uid.
**Rollback:** revert PR; TTL policies can be disabled in the console.

---

## Phase 5 — Prescription claim hardening

**Goal:** a leaked or photographed QR can't be hijacked.

**Tasks** (confirm product decisions first)
1. Revocation: add `revoked_at` to `issued`; `POST /api/rx/[id]/revoke` (prescriber, own codes only); checked in `checkRx` and in the save transaction (read the issued doc inside the transaction).
2. Claim window: make configurable per issue (24 h / 7 d / 30 d), default 7 d; stored in the signed `exp`.
3. Optional one-time PIN: on issue, generate a 6-digit PIN, store only an HMAC of it (`pin_hash`), show it once to the prescriber; the patient types it at save; limit 5 attempts per code (counter on `issued`), then lock the code. Feature-flag per prescriber so existing flows keep working.
4. Prescriber UI: show claimed/unclaimed/revoked/expired, with revoke button.
5. Tests: revoked code → `invalid/revoked` at verify and save; wrong PIN ×5 locks; claim race still single-winner (extend existing transaction test).

**Acceptance:** all three paths covered by tests; old tokens (without PIN field) still verify when the flag is off.
**Rollback:** feature flag off; revert PR (extra fields ignored).

---

## Phase 6 — Observability, ops & test depth

**Goal:** know when something breaks before users do.

**Tasks**
1. Logging (#12): add a request id to every log line (header `x-request-id` or generated); log security events at `warn` — failed session exchange, 403 on issue/revoke, claim conflicts, rate-limit hits, App Check rejections — with uid and IP hash, never prescription contents.
2. Error tracking: add Sentry (or equivalent) with PII scrubbing; source maps uploaded in CI.
3. Health (#11): real Firestore ping with 2 s timeout in `getHealth`; rate-limit it; keep `/health` as an alias; drop the alias if no monitor uses it.
4. Cron: add `crons` to `vercel.json` (if on a plan allowing 10-minute crons) or document the external scheduler; add an uptime check that alerts if the cron hasn't succeeded for 30 min (e.g. cron endpoint writes `meta/cron.lastSuccess`, health reads it).
5. Set the Vercel function region next to the Firestore region.
6. Tests (#13): Firestore rules tests with the emulator (deny-all verified for read/write/list from an authenticated client); Playwright smoke test for login → scan manual entry → save → history; coverage threshold (start at current − 2 %, ratchet up); a perf test of `runDueReminders` at 1,000 docs against the emulator.
7. Session lifetime review: decide whether to shorten from 5 days.

**Acceptance:** an induced failure (kill Firestore creds in preview) pages within 5 minutes; rules tests and e2e smoke run in CI.
**Rollback:** all additive; revert per feature.

---

## Decisions needed before starting

| Decision | Needed by | Default if unanswered |
|----------|-----------|-----------------------|
| Who may see/set a prescriber's displayed name (admin only?) | Phase 1 | Admin-only via `set-role --name` |
| What may anonymous guests do? | Phase 3 | Scan + save only |
| Paid Upstash/Redis acceptable? Vercel plan (cron frequency)? | Phase 3 / 6 | Upstash free tier; external cron if Hobby |
| Claim window length and whether a PIN is wanted | Phase 5 | 7 days, PIN optional |
| Data retention periods; legal regime (GDPR/HIPAA?) | Phase 4 | 90 days after expiry for issued/claims |

## Cross-cutting rules
- One PR per phase (or per numbered task if large); each includes tests and a README/doc update.
- No change to the signed token format without a version bump (`vd2`); `verifyRx` must keep accepting `vd1` until all issued codes have expired.
- Every new route calls `assertSameOrigin` (mutations), `requireUser`/`requirePrescriber`, a rate limit and a Zod schema.
- Never log prescription contents, tokens or push keys.
