# Prescription QR Scanner

A modern, privacy-first web application built with Next.js that scans prescription QR codes and logs them into a Firebase Firestore database.

## 🎯 Project Overview

This application provides a simple, secure way to track prescriptions by scanning QR codes that contain medication information. The QR codes should contain JSON data with the following fields:
- `med`: Medication name
- `dose`: Dosage information
- `duration`: Duration of the prescription

**Key Features:**
- Privacy-first design with no user tracking beyond prescription data
- Modern Next.js 16 with React 19
- Mobile-friendly responsive UI with Tailwind CSS
- Real-time QR code scanning using device camera
- Secure Firebase Firestore storage
- Server-side API routes with robust data validation
- TypeScript for type safety
- PWA support for offline capabilities

## 🛠 Tech Stack & Tools Used

### Frontend
- **Next.js 16** - React framework with App Router
- **React 19** - UI library
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS 4** - Utility-first CSS framework
- **html5-qrcode** - QR code scanning library
- **Lucide React** - Icon library

### Backend
- **Next.js API Routes** - Serverless API endpoints
- **Firebase Admin SDK** - Firebase backend authentication
- **Firebase Firestore** - NoSQL cloud database
- **Pydantic-style validation** - Data validation

### Database & Infrastructure
- **Firebase Firestore** - NoSQL cloud database
- **Firebase Admin SDK** - Secure backend authentication

## 🏗 System Architecture

```
┌─────────────────┐
│   Mobile Device │
│  (Browser UI)   │
└────────┬────────┘
         │
         │ 1. User grants camera permission
         │
         ▼
┌─────────────────┐
│  html5-qrcode   │
│   Scanner       │
└────────┬────────┘
         │
         │ 2. QR code scanned & JSON parsed
         │    {med, dose, duration}
         │
         ▼
┌─────────────────┐
│  Next.js API    │
│  /api/save      │
└────────┬────────┘
         │
         │ 3. Validate data
         │
         ▼
┌─────────────────────────────────────┐
│      Firebase Admin SDK             │
│   (Authenticated via Service Key)   │
└──────────────┬──────────────────────┘
               │
               │ 4. Write to Firestore
               │    Collection: prescriptions
               │
               ▼
┌─────────────────────────────────────┐
│      Firebase Firestore              │
│      (NoSQL Database)                │
└─────────────────────────────────────┘
```

### Data Flow

1. **Client-Side Scanning**: The user opens the web app on their device and grants camera permissions. The `html5-qrcode` library accesses the camera and scans QR codes.

2. **JSON Parsing**: When a QR code is detected, the JSON payload is parsed and validated to ensure it contains the required fields (`med`, `dose`, `duration`).

3. **API Request**: The parsed prescription data is sent via a POST request to the `/api/save` endpoint using the Next.js API routes.

4. **Backend Processing**: Next.js API route receives the request and validates the data using custom validation logic.

5. **Firebase Storage**: The validated data is securely written to the Firebase Firestore `prescriptions` collection using the Firebase Admin SDK with service account authentication.

6. **Response**: The backend returns a success response to the frontend, which displays a confirmation message to the user.

## 📋 Setup & Development Instructions

### Prerequisites

- Node.js 18+ and npm
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
   - Choose "Open" security rules for development (change to "Restrictive" for production)
   - Select your preferred location
   - Click "Create"

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
npm run build
npm start
```

### Step 4: Security Best Practices

1. **Environment Variables**
   - Never commit `firebase-service-account.json` to version control
   - Never commit `.env` file to version control
   - Use environment variables for production deployments
   - Rotate service account keys if compromised

2. **CORS Configuration**
   - In production, update the Firebase security rules based on your requirements
   - For development, "Open" rules allow easy testing
   - For production, use "Restrictive" rules and configure proper access controls

3. **Firebase Security Rules**
   - Implement Firestore rules based on your security requirements
   - For development, "Open" rules allow easy testing
   - For production, use "Restrictive" rules and configure proper access controls

## 🧪 Testing

### Test the API Endpoints

1. **Health Check**
   ```bash
   curl http://localhost:3000/api/health
   ```

2. **Save Prescription**
   ```bash
   curl -X POST http://localhost:3000/api/save \
     -H "Content-Type: application/json" \
     -d '{"med":"Amoxicillin","dose":"500mg","duration":"7 days"}'
   ```

3. **Retrieve Prescriptions**
   ```bash
   curl http://localhost:3000/api/prescriptions?limit=5
   ```

### Test the Frontend

1. Open `http://localhost:3000` in a browser
2. Navigate to the scan page
3. Click "Start Camera"
4. Grant camera permissions
5. Scan a QR code with prescription data
6. Verify success message and data display
7. Check Firebase Console for saved data

## 📁 Project Structure

```
my_prescription_app/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── api/               # API routes
│   │   │   ├── health/        # Health check endpoint
│   │   │   ├── save/          # Save prescription endpoint
│   │   │   └── prescriptions/ # Prescription CRUD endpoints
│   │   ├── history/           # History page
│   │   ├── scan/              # Scan page
│   │   ├── settings/          # Settings page
│   │   └── page.tsx           # Home page
│   ├── components/            # React components
│   │   ├── dashboard/        # Dashboard components
│   │   ├── scan/             # Scan-related components
│   │   ├── history/          # History-related components
│   │   └── ui/               # UI components
│   ├── hooks/                 # Custom React hooks
│   ├── lib/                   # Utility functions
│   │   ├── api.ts            # API client
│   │   ├── server/           # Server-side utilities
│   │   │   ├── firebase.ts   # Firebase initialization
│   │   │   ├── prescriptions.ts # Prescription operations
│   │   │   └── errors.ts     # Error handling
│   │   ├── validation.ts     # Data validation
│   │   └── stats.ts          # Statistics computation
│   └── types/                # TypeScript type definitions
│       └── prescription.ts   # Prescription types
├── public/                    # Static assets
├── .env.example              # Example environment variables
├── .gitignore                # Git ignore rules
├── firebase-service-account.json # Firebase credentials (local, not committed)
├── next.config.ts            # Next.js configuration
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript configuration
├── tailwind.config.ts        # Tailwind CSS configuration
└── README.md                 # This file
```

## 🚀 Future Improvements

### Planned Features
- **User Authentication**: Add Firebase Authentication to support multiple users
- **Prescription History**: Implement a UI to view and manage saved prescriptions
- **QR Code Generator**: Add in-app QR code generation for pharmacists/doctors
- **Export Data**: Add ability to export prescription history as PDF/CSV
- **Reminders**: Implement medication reminder notifications
- **Multi-language Support**: Add internationalization (i18n) for multiple languages
- **Dark Mode**: Add theme toggle for better user experience
- **Offline Support**: Add PWA capabilities for offline scanning
- **Batch Scanning**: Support scanning multiple QR codes in sequence
- **Data Validation**: Add more sophisticated validation for medication names and dosages

### Technical Improvements
- **Unit Tests**: Add comprehensive test coverage with Jest and React Testing Library
- **API Documentation**: Generate OpenAPI/Swagger documentation
- **Error Handling**: Improve error messages and user feedback
- **Rate Limiting**: Add rate limiting to prevent abuse
- **Logging**: Implement structured logging for debugging
- **Docker Support**: Add Dockerfile for containerized deployment
- **CI/CD Pipeline**: Set up automated testing and deployment
- **Performance Optimization**: Optimize database queries and API responses
- **Security Enhancements**: Add input sanitization and CSRF protection
- **Monitoring**: Add application monitoring and alerting

## 🔧 Troubleshooting

### Camera Not Working
- Ensure you're using HTTPS or localhost (camera requires secure context)
- Check browser permissions for camera access
- Try a different browser (Chrome/Edge recommended)

### Firebase Connection Error
- Verify `FIREBASE_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_PATH` is set correctly
- Ensure the service account JSON file exists and is valid
- Check that Firestore is enabled in Firebase Console
- Verify Cloud Firestore API is enabled in Google Cloud Console
- Verify service account has Firestore permissions

### Database Not Found Error
- Ensure Firestore database is created in Firebase Console
- Visit: https://console.cloud.google.com/datastore/setup?project=YOUR_PROJECT_ID
- Create the database if it doesn't exist

### QR Code Not Scanning
- Ensure QR code contains valid JSON with required fields
- Check lighting conditions when scanning
- Ensure QR code is clearly visible and in focus
- Try generating a new QR code with simpler formatting

### Dependencies Installation Issues
- Try upgrading npm: `npm install -g npm@latest`
- Clear npm cache: `npm cache clean --force`
- Reinstall dependencies: `rm -rf node_modules package-lock.json && npm install`

## 📤 Git Setup & Pushing to Repository

### Initialize Git Repository
```bash
git init
```

### Add Files to Git
```bash
git add .
```

### Commit Changes
```bash
git commit -m "Initial commit: Prescription QR Scanner app with Next.js and Firebase"
```

### Add Remote Repository
```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
```

### Push to Repository
```bash
git branch -M main
git push -u origin main
```

**Note:** The `.gitignore` file ensures that sensitive files (firebase-service-account.json, .env) and generated files are not committed to the repository.

## 📄 License

This project is provided as-is for educational and personal use.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## 📞 Support

For issues or questions:
- Check the troubleshooting section above
- Review Firebase and Next.js documentation
- Open an issue in the project repository

---

**Built with ❤️ for privacy-first healthcare tracking**
