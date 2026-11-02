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

### Step 3: Build for Production

```bash
npm install
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

### Step 4: Security Best Practices

```bash
cp .env.example .env
```

Edit `.env` with your Firebase project values.

### 3) Run the application

```bash
npm run dev
```

Open `http://localhost:3000`

### 4) Build for production

2. **Save Prescription** (requires a session: sign in in the browser, then copy the
   `veridose_session` cookie from DevTools → Application → Cookies)
   ```bash
   curl -X POST http://localhost:3000/api/save \
     -H "Content-Type: application/json" \
     -H "Cookie: veridose_session=PASTE_COOKIE" \
     -d '{"med":"Amoxicillin","dose":"500mg","duration":"7 days"}'
   ```

3. **Retrieve Prescriptions**
   ```bash
   curl -H "Cookie: veridose_session=PASTE_COOKIE" http://localhost:3000/api/prescriptions?limit=5
   ```

   Without the cookie, both return `401`.

### Test the Frontend

```bash
curl http://localhost:3000/api/health
```

```bash
curl -X POST http://localhost:3000/api/save \
  -H "Content-Type: application/json" \
  -d '{"med":"Amoxicillin","dose":"500mg","duration":"7 days"}'
```

```bash
curl "http://localhost:3000/api/prescriptions?limit=5"
```

### Frontend flow

1. Open the app in the browser
2. Navigate to the scan screen
3. Allow camera access
4. Scan a QR code with valid JSON
5. Confirm the data is saved and visible in Firestore

## 📁 Project Structure

```text
Prescription_QR_App/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── health/
│   │   │   ├── save/
│   │   │   └── prescriptions/
│   │   ├── history/
│   │   ├── scan/
│   │   ├── settings/
│   │   └── page.tsx
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   │   ├── api.ts
│   │   ├── server/
│   │   │   ├── firebase.ts
│   │   │   ├── prescriptions.ts
│   │   │   └── errors.ts
│   │   ├── validation.ts
│   │   └── stats.ts
│   └── types/
│       └── prescription.ts
├── public/
├── .env.example
├── .gitignore
├── firebase-service-account.json
├── next.config.ts
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── README.md
└── LICENSE
```

## 🔐 Security Best Practices

- Never commit `.env` or Firebase service account JSON files
- Rotate service account keys periodically
- Use restrictive Firestore rules in production
- Keep API validation strict to prevent malformed payloads
- Prefer environment variables over hardcoded secrets

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

### Dependency issues

```bash
rm -rf node_modules package-lock.json
npm install
```

## 🚀 Future Improvements

- User authentication and role-based access
- Prescription history dashboard and filtering
- Batch QR scanning support
- QR generation for healthcare staff
- Export to CSV / PDF
- Reminder notifications
- Dark mode and theme settings
- Improved monitoring and performance optimization

## 🤝 Contributing

Contributions are welcome. If you want to improve the app, open an issue or submit a pull request.

## 📄 License

This project is provided as-is for educational and personal use.

---

Built with ❤️ for privacy-first healthcare tracking.
