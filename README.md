# Prescription QR Scanner

A modern, privacy-first web app for scanning prescription QR codes and saving validated medication records to Firebase Firestore.

<div align="center">

  <img src="https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Firebase-Firestore-FFCA28?style=for-the-badge&logo=firebase&logoColor=black" alt="Firebase Firestore" />

</div>

## Tech Stack

<table>
  <tr>
    <td align="center" valign="top" width="33%">
      <strong>Frontend</strong><br>
      <br>
      Next.js 16<br>
      React 19<br>
      TypeScript<br>
      Tailwind CSS<br>
      Lucide Icons
    </td>
    <td align="center" valign="top" width="33%">
      <strong>Backend</strong><br>
      <br>
      Next.js API Routes<br>
      Firebase Admin SDK<br>
      Custom validation logic<br>
      Server-side processing
    </td>
    <td align="center" valign="top" width="33%">
      <strong>Database & Infra</strong><br>
      <br>
      Firebase Firestore<br>
      Environment-based config<br>
      Secure credential handling<br>
      Local + production-ready setup
    </td>
  </tr>
</table>

## 🎯 Project Overview

This application allows a user to scan a QR code containing prescription information, validate the data, and securely store it in a Firebase database. The QR payload is expected to contain JSON fields like:

- `med`: medication name
- `dose`: dosage
- `duration`: prescription duration

### Key Features

- Privacy-first design with no unnecessary user tracking
- Mobile-friendly scanner UI
- Real-time QR scanning with camera access
- Firebase Firestore storage
- Validation before saving to the database
- Next.js App Router architecture
- Type-safe TypeScript implementation
- Optional API base configuration for different deployment environments

## 🏗 System Architecture

```text
┌────────────────────┐
│   User Device      │
│  Browser / Mobile  │
└─────────┬──────────┘
          │
          │ 1. Grant camera access
          ▼
┌────────────────────┐
│   QR Scanner        │
│   html5-qrcode     │
└─────────┬──────────┘
          │
          │ 2. Read JSON payload
          ▼
┌────────────────────┐
│  Validation Layer   │
│ { med, dose, duration }
└─────────┬──────────┘
          │
          │ 3. POST to /api/save
          ▼
┌────────────────────┐
│ Next.js API Route  │
│ /api/save          │
└─────────┬──────────┘
          │
          │ 4. Auth via Firebase Admin SDK
          ▼
┌────────────────────┐
│ Firebase Firestore  │
│   prescriptions    │
└────────────────────┘
```

## ⚙️ Configuration

The project supports two Firebase credential styles:

1. JSON credential string via `FIREBASE_CREDENTIALS`
2. Local service account file path via `FIREBASE_SERVICE_ACCOUNT_PATH`

### Environment Variables

Copy `.env.example` to `.env` and update the values:

```env
# Firebase configuration
FIREBASE_CREDENTIALS='{"type":"service_account","project_id":"YOUR_PROJECT_ID",...}'
# FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json

# Optional: override the browser API base if the app is not served from the same origin
# NEXT_PUBLIC_API_BASE=http://localhost:3000
```

### Notes

- Use `FIREBASE_CREDENTIALS` for production and deployment environments.
- Use `FIREBASE_SERVICE_ACCOUNT_PATH` for local development when a JSON file is stored in the project root.
- Keep `.env` and service account keys out of version control.
- `NEXT_PUBLIC_API_BASE` is optional; if unset, the app will use the same-origin API by default.

## 📋 Setup & Development

### Prerequisites

- Node.js 18+
- npm
- Firebase project with Firestore enabled
- Git

### Step 1: Firebase Setup

1. **Create a Firebase Project**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Click "Add project" and follow the setup wizard
   - Enable Firestore Database in the Firebase Console
   - Choose your preferred location (e.g., nam5 for US)

2. **Generate Service Account Key**
   - Go to Firebase Console → Project Settings → Service Accounts
   - Click "Generate new private key"
   - Download the JSON file (save it securely, never commit to git)
   - The JSON file contains your service account credentials

3. **Enable Cloud Firestore API**
   - Visit: https://console.developers.google.com/apis/api/firestore.googleapis.com/overview?project=YOUR_PROJECT_ID
   - Click "Enable" to activate the Cloud Firestore API

4. **Create Firestore Database**
   - Go to: https://console.cloud.google.com/datastore/setup?project=YOUR_PROJECT_ID
   - Click "Create database"
   - Choose "Standard Edition" for simplicity
   - Choose **"Restrictive"** security rules (the app only accesses Firestore from the server)
   - Select your preferred location
   - Click "Create"
   - Deploy the repo's deny-all rules: `npx firebase-tools deploy --only firestore:rules`

5. **Enable Firebase Authentication**
   - Firebase Console → Authentication → Get started
   - Sign-in method → enable **Email/Password** and **Anonymous** (used for "Continue as guest")
   - Settings → **User actions**: keep **Email enumeration protection** on
   - Settings → **Password policy**: require at least 8 characters (the UI enforces this, but
     Firebase's own minimum is 6, so set it here to enforce it for every client)
   - Settings → **Authorized domains**: add your production domain

6. **Register a Web App** (for the browser-side sign-in config)
   - Project settings → General → Your apps → Add app → Web
   - Copy `apiKey`, `authDomain`, `projectId` and `appId` into the `NEXT_PUBLIC_FIREBASE_*`
     variables in `.env` (these values are public by design)

### Step 2: Local Development Setup

1. **Clone or Navigate to the Project**
   ```bash
   cd my_prescription_app
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**

   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add your Firebase credentials:
   ```env
   # Option 1: Provide Firebase credentials as JSON string (recommended for production)
   FIREBASE_CREDENTIALS='{"type":"service_account","project_id":"YOUR_PROJECT_ID",...}'

   # Option 2: Provide path to service account JSON file (for local development)
   # FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
   ```

   Place your downloaded service account JSON file as `firebase-service-account.json` in the project root (if using Option 2).

4. **Run the Application**
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:3000`

5. **Test the Application**
   - Open `http://localhost:3000` in a web browser
   - Navigate to the scan page
   - Click "Start Camera" and grant camera permissions
   - Scan a QR code with prescription data
   - Verify the prescription data is displayed and saved to Firestore
   - Check Firebase Console to verify data is being saved

### Step 3: Run and build

```bash
npm run dev                  # http://localhost:3000
npm run build && npm start   # production build
```

### Authentication & data access

- Users sign in with Firebase Authentication in the browser. The resulting ID token is
  immediately exchanged at `POST /api/auth/session` for an **HttpOnly, SameSite session
  cookie**; no token is stored in localStorage.
- Every API route and private page verifies that cookie on the server (signature, expiry,
  revocation, disabled accounts). `src/proxy.ts` also redirects signed-out visitors to
  `/login` before rendering.
- Prescriptions are stored per user at `users/{uid}/prescriptions/{id}`, so a user can only
  ever reach their own records.
- "Sign out of all devices" (Settings) revokes every session for the account.

### Migrating records saved before authentication

Older records live in the top-level `prescriptions` collection and are hidden after this
change. Create your account, then assign them to it:

```bash
npm run migrate:prescriptions -- --email you@example.com            # dry run
npm run migrate:prescriptions -- --email you@example.com --apply    # copy
# Optional, after checking the app: also remove the old copies
npm run migrate:prescriptions -- --email you@example.com --apply --delete-originals
```

### Signed prescriptions (prescriber QR codes)

Prescribers issue QR codes from **/prescribe**. Each code carries the plain `med`, `dose`
and `duration` plus an `rx` token signed with an Ed25519 key that only the server holds.
When a patient scans it:

- the review screen shows **Verified prescription · signed by Dr …**, or explains why not
  (altered, expired, withdrawn, locked, signed with an old key, already saved by someone else);
- editing any signed field removes verification, and the record is saved unverified;
- the first account to save a code claims it (one transaction), so a copied code cannot be
  saved as verified by anyone else, and the prescriber sees "Saved by patient".

Protecting a code that might leak (a photographed or forwarded QR):

- **Claim window:** the prescriber chooses how long a patient has to save a code: 24 hours,
  **7 days (default)** or 30 days. It is part of the signature, so it can't be extended.
- **One-time PIN (optional):** tick "Require a one-time PIN" when issuing. A random 6-digit
  PIN is shown to the prescriber once, to read out to the patient; only a keyed hash is
  stored. The patient types it when saving. After **5 wrong PINs the code is locked** (the
  patient can still keep an unverified copy; the prescriber issues a new code). Codes without
  a PIN work exactly as before.
- **Withdraw:** a prescriber can withdraw any code a patient hasn't saved yet. Withdrawn codes
  (and codes whose prescriber account was deleted) can only be saved as unverified records.
  A code a patient already saved can't be withdrawn.

Setup:

1. `npm run generate:keys` and put `RX_SIGNING_PRIVATE_KEY` in `.env` and your host's
   environment settings (server-only secret).
2. Grant prescriber access to accounts you have vetted. The account's email must be
   verified, and `--name` is the name patients see as the signer of every code:
   `npm run set-role -- --email doctor@example.com --role prescriber --name "Dr. Jane Smith"`
   (`--role patient` removes it). Prescribers cannot change this name themselves, and a
   prescriber without it cannot issue codes. Each change is recorded in the Firestore
   collection `admin_audit`.

   **Upgrading from an earlier version?** Existing prescribers must be re-granted once with
   `--name`; until then issuing returns a clear 403.

Rotating `RX_SIGNING_PRIVATE_KEY` makes codes that haven't been saved yet unverifiable;
already-saved records keep their verified status.

### Reminders and notifications

Reminder times, the "Notify me" switch and dose check-ins are stored per prescription at
`users/{uid}/reminders/{prescriptionId}`. Any reminders kept on a device by older versions
are imported automatically the first time the Reminders page opens.

Notifications use Web Push and never include medication names (lock screens are public):

1. `npm run generate:keys`: set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT` and `CRON_SECRET`.
2. Create the collection-group index the scheduler needs:
   `npx firebase-tools deploy --only firestore:indexes --project YOUR_PROJECT_ID`
3. Call `GET /api/cron/reminders` with `Authorization: Bearer $CRON_SECRET` every 5–15
   minutes:
   - **Vercel Pro**: add to `vercel.json`
     `{"crons":[{"path":"/api/cron/reminders","schedule":"*/10 * * * *"}]}`. Vercel sends the
     header automatically when `CRON_SECRET` is set. (Hobby plans only allow daily crons.)
   - **Any plan**: a free external scheduler (e.g. cron-job.org) with that header.

Reminders are sent at most once per dose, skipped if the dose is already ticked off, and
dropped (not sent late) if the scheduler was down for more than two hours. On iPhone, Web
Push works only after adding VeriDose to the Home Screen (iOS 16.4+).

## 🧪 Testing

### Automated tests

```bash
npm test            # run once (Vitest)
npm run test:watch  # re-run on change
```

Tests live next to the code (`*.test.ts`) and cover the shared Zod schemas, QR parsing,
CSV export escaping, the security helpers (same-origin checks, body limits, rate limiting),
session verification and revocation, roles, prescription signing and tamper detection,
timezone/DST reminder scheduling, the reminder sender, and the API routes' 401/403/404/422
behaviour. Firestore itself is stubbed; an emulator-backed suite is a good next step.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests, build and a production
dependency audit on every push to `main` and every pull request.

### Test the API endpoints

1. **Health check** (public)
   ```bash
   curl http://localhost:3000/api/health
   ```

2. **Save a prescription** (requires a session: sign in in the browser, then copy the
   `veridose_session` cookie from DevTools → Application → Cookies)
   ```bash
   curl -X POST http://localhost:3000/api/save \
     -H "Content-Type: application/json" \
     -H "Cookie: veridose_session=PASTE_COOKIE" \
     -d '{"med":"Amoxicillin","dose":"500mg","duration":"7 days"}'
   ```

3. **List prescriptions** (paginated: pass the returned `next_cursor` as `cursor`)
   ```bash
   curl -H "Cookie: veridose_session=PASTE_COOKIE" "http://localhost:3000/api/prescriptions?limit=5"
   curl -H "Cookie: veridose_session=PASTE_COOKIE" "http://localhost:3000/api/prescriptions?limit=5&cursor=NEXT_CURSOR"
   curl -H "Cookie: veridose_session=PASTE_COOKIE" http://localhost:3000/api/prescriptions/stats
   ```

   Without the cookie, these return `401`.

### Frontend flow

1. Sign up or log in
2. Open **Scan**, allow camera access, and scan a QR code with valid JSON
   (or upload a photo, or type the details)
3. Review the details (signed codes show the verification banner) and save
4. Check **History**, **Reminders**, and the record in Firestore

## 📁 Project Structure

```text
my_prescription_app/
├── src/
│   ├── app/                     # Next.js App Router pages and API routes
│   │   ├── api/
│   │   │   ├── auth/            # Session cookie + profile
│   │   │   ├── cron/reminders/  # Scheduler entry point (CRON_SECRET)
│   │   │   ├── prescriptions/   # List, stats, detail, export
│   │   │   ├── push/            # Web Push subscriptions
│   │   │   ├── reminders/       # Reminder times and dose check-ins
│   │   │   ├── rx/              # Issue / verify signed prescriptions
│   │   │   ├── save/            # Save a prescription
│   │   │   └── health/          # Health check
│   │   ├── history/  login/  prescribe/  reminders/  scan/  settings/  signup/
│   │   └── page.tsx             # Dashboard
│   ├── components/              # UI by feature (auth, scan, history, prescribe, ...)
│   ├── hooks/                   # Client hooks (session, prescriptions, reminders, push)
│   ├── lib/
│   │   ├── server/              # Server-only: auth, firebase, data access, signing, push
│   │   ├── schemas.ts           # Zod schemas shared by client and server
│   │   ├── schedule.ts          # Timezone-aware reminder scheduling
│   │   └── validation.ts        # QR parsing + form validation
│   ├── proxy.ts                 # Auth redirect + per-request CSP nonce
│   └── types/
├── public/sw.js                 # Service worker: offline page + notifications
├── scripts/                     # migrate-prescriptions, set-role, generate-keys
├── firestore.rules              # Deny-all (server-only access)
├── firestore.indexes.json       # Reminder scheduler index
└── .github/workflows/ci.yml
```

## 🔐 Security Best Practices

- Never commit `.env` or Firebase service account JSON files
- Rotate service account keys periodically
- Keep `RX_SIGNING_PRIVATE_KEY`, `VAPID_PRIVATE_KEY` and `CRON_SECRET` server-side only
- Only grant the prescriber role to vetted accounts, with a verified email and a `--name` you checked
- Push subscriptions are accepted only from known push services (FCM, Mozilla, Apple, Windows); self-hosted push services can be added with `PUSH_ALLOWED_HOSTS`, and each account may register at most 10 devices
- Keep the deny-all `firestore.rules` deployed; the app only accesses Firestore from the server

### Your data: export, deletion and retention

- **Export:** Settings → Data & exports streams every record as CSV (up to 20,000; a final row
  says so if the history is longer).
- **Delete account:** Settings → Delete account (password + typed confirmation) erases the
  account and everything under it. Claim records are detached from the person and expire with
  the retention policy.
- **Automatic expiry:** issued-code and claim records are purged 90 days after the code
  expires. One-time setup: enable the Firestore TTL policies and backfill older records. The
  exact commands, and what is stored and why, are in [docs/PRIVACY.md](docs/PRIVACY.md).

### Abuse protection

- **Rate limits** are shared across all server instances when `UPSTASH_REDIS_REST_URL` and
  `UPSTASH_REDIS_REST_TOKEN` are set (a free Upstash Redis database is enough). Without them
  limits are per instance. If Redis is unreachable the app falls back to per-instance limits
  rather than going down, and logs a warning.
- **Client IPs** come only from the `x-vercel-forwarded-for` header Vercel sets. Behind your own
  reverse proxy that overwrites `X-Forwarded-For`, set `TRUST_PROXY=1`; otherwise every
  anonymous caller shares one bucket.
- **Guest accounts** can scan and save records, but reminders, dose logging and push
  notifications require a registered account.
- **App Check (recommended):** create a reCAPTCHA Enterprise key, register the web app under
  Firebase Console → App Check, and set `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY`. That starts
  *monitor mode*: tokens are verified and failures logged (`App Check would have blocked this
  request`) but nothing is blocked. Once the logs show real users passing, set
  `APP_CHECK_ENFORCE=1` to reject sign-ins without a valid token.
- **User lookups are cached for 30 s** per server instance to save a Google API call on every
  request. Role changes made with `npm run set-role` and "sign out everywhere" on another
  instance therefore take up to 30 s to apply (the instance handling the request applies them
  immediately). Set `AUTH_CACHE_TTL_MS=0` to disable.

### Monitoring and operations

**Finding what went wrong.** Every API response carries an `X-Request-Id` header, and a failed
request's JSON body has the same value as `request_id`. Every log line written while handling
that request contains it too, together with `method`, `path` and (once signed in) `uid`. When a
user reports a problem, ask for the `request_id` (or read the header in the browser's network
tab) and search your logs for it. Logs are one JSON object per line; they never contain
prescription contents, tokens, PINs or raw IP addresses.

**Security events.** These are logged at `warn` with a stable `event` field, so they can be
searched and alerted on in Vercel logs or any log drain:

| `event` | Means |
|---------|-------|
| `forbidden` | A request was refused with 403 (wrong role, guest on a registered-only route, cross-site request) |
| `rate_limited` | A client hit a rate limit (429) |
| `session_exchange_failed` | A sign-in token could not be turned into a session |
| `app_check_rejected` | App Check token missing or invalid (`mode` says monitor or enforce) |
| `claim_conflict` | A code was already claimed, withdrawn or locked |
| `pin_failed` / `pin_locked` | A wrong one-time PIN / the code was locked after too many |
| `code_revoked`, `account_deleted` | A prescriber withdrew a code / an account was deleted |

Each carries `ipHash`, a short salted hash of the client address: enough to see that one source is
behind a burst, not enough to identify a person. **Set `LOG_IP_SALT` to a long random secret**,
otherwise the hash uses a public default and could be reversed by brute force. A spike in
`rate_limited` or `pin_failed` from one `ipHash` is the signal to look at.

**Uptime monitoring.** Point an external monitor (UptimeRobot, Better Stack, ...) at two URLs:

- `GET /api/health`: `200` when Firestore answers a real read within 2 seconds, `503` otherwise.
  This is the check the Settings page uses.
- `GET /api/health?cron=1`: additionally fails (`503`) when the reminder scheduler has not run
  successfully for 30 minutes, so you hear about missing reminders before patients do. Change the
  limit with `CRON_STALE_MINUTES` (`0` turns it off). Until the scheduler has run once it reports
  `unknown` and stays green, so setups without a scheduler are not flagged.

**Unhandled errors.** Errors that escape a page render are logged as `Unhandled request error`
with the route and digest (`src/instrumentation.ts`). To also send errors to a service such as
Sentry, install its Next.js SDK and call it from that hook; the logs are the source of truth until
then.

**Settings that affect security and operations** (all optional, see `.env.example`):
`LOG_IP_SALT`, `SESSION_MAX_AGE_DAYS` (1-14, default 5; **2 is a good choice for health data**, since
a stolen cookie then stays useful for less time), `CRON_STALE_MINUTES`.

**Deployment notes.**
- Hobby plans only allow daily Vercel crons, so `vercel.json` does not define one. Use an external
  scheduler for `/api/cron/reminders` every 5-15 minutes (see Reminders above), or add
  `{"crons":[{"path":"/api/cron/reminders","schedule":"*/10 * * * *"}]}` on a plan that allows it.
- For lower latency, pin the Vercel function region to the one closest to your Firestore database
  (Project Settings → Functions → Region). The database region is shown in the Firebase console.

**Tests.** `npm run test:coverage` runs the unit and route tests with coverage thresholds (CI
fails if coverage drops). `npm run test:rules` runs the Firestore security-rules tests against the
local emulator; it needs Java 17+ and downloads the emulator on first use. CI runs both.

## 🛠 Troubleshooting

### Camera not working

- Use `localhost` or HTTPS
- Confirm browser camera permissions are enabled
- Try a different browser if scanning is inconsistent

### Firebase connection issues

- Verify `FIREBASE_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_PATH` is set correctly
- Confirm Firestore is enabled in Firebase
- Check that the service account has the right permissions

### QR code not scanning

- Ensure the QR payload is valid JSON
- Check lighting and focus
- Confirm the code includes the required keys: `med`, `dose`, and `duration`

### Notifications not arriving

- Check `GET /api/cron/reminders` is being called (it returns `due`/`sent`/`skipped`)
- Confirm the Firestore index from `firestore.indexes.json` is deployed
- Make sure notifications are turned on in the Reminders page *and* "Notify me" is ticked

### Dependency issues

```bash
rm -rf node_modules package-lock.json
npm install
```

## 🚀 Future Improvements

- Offline save queue (IndexedDB) that syncs when back online
- Structured dosing (amount, unit, frequency) with automatic course end dates
- Drug lookup and interaction warnings (RxNorm / openFDA)
- Account deletion, multi-factor authentication, and caregiver sharing
- PDF export and printable visit summaries

## 🤝 Contributing

Contributions are welcome. If you want to improve the app, open an issue or submit a pull request.

## 📄 License

This project is provided as-is for educational and personal use.

---

Built with ❤️ for privacy-first healthcare tracking.
