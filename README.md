# Prescription QR Scanner

A lightweight, privacy-first web application that scans prescription QR codes and logs them into a Firebase NoSQL database via a Python FastAPI backend.

## 🎯 Project Overview

This application provides a simple, secure way to track prescriptions by scanning QR codes that contain medication information. The QR codes should contain JSON data with the following fields:
- `med`: Medication name
- `dose`: Dosage information
- `duration`: Duration of the prescription

**Key Features:**
- Privacy-first design with no user tracking beyond prescription data
- Mobile-friendly responsive UI with Tailwind CSS
- Real-time QR code scanning using device camera
- Secure Firebase Firestore storage
- FastAPI backend with robust data validation
- Modular JavaScript architecture
- Local development with virtual environment support

## 🛠 Tech Stack & Tools Used

### Frontend
- **HTML5/JavaScript** - Core web technologies
- **Tailwind CSS** - Utility-first CSS framework (CDN)
- **html5-qrcode** - QR code scanning library (CDN)
- **Fetch API** - HTTP requests to backend
- **Separated JavaScript** - Modular code in `script.js`

### Backend
- **Python 3.9+** - Programming language
- **FastAPI** - Modern, fast web framework for building APIs
- **Pydantic V2** - Data validation using Python type annotations
- **Uvicorn** - ASGI server for running FastAPI
- **Static file serving** - Built-in FastAPI static files

### Database & Infrastructure
- **Firebase Firestore** - NoSQL cloud database
- **Firebase Admin SDK** - Secure backend authentication
- **python-dotenv** - Environment variable management
- **qrcode** - QR code generation for testing

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
│  script.js      │
│  Fetch API      │
└────────┬────────┘
         │
         │ 3. POST /api/save
         │
         ▼
┌─────────────────────────────────────┐
│      FastAPI Server                 │
│   (Local or Serverless)             │
└──────────────┬──────────────────────┘
               │
               │ 4. Pydantic V2 validates data
               │
               ▼
┌─────────────────────────────────────┐
│      Firebase Admin SDK             │
│   (Authenticated via Service Key)   │
└──────────────┬──────────────────────┘
               │
               │ 5. Write to Firestore
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

3. **API Request**: The parsed prescription data is sent via a POST request to the `/api/save` endpoint using the JavaScript Fetch API from `script.js`.

4. **Backend Processing**: FastAPI receives the request and validates the data using Pydantic V2 models with field validators.

5. **Firebase Storage**: The validated data is securely written to the Firebase Firestore `prescriptions` collection using the Firebase Admin SDK with service account authentication.

6. **Response**: The backend returns a success response to the frontend, which displays a confirmation message to the user.

## 📋 Setup & Development Instructions

### Prerequisites

- Python 3.9 or higher
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

2. **Create Virtual Environment**
   ```bash
   # Windows
   python -m venv venv
   venv\Scripts\activate

   # macOS/Linux
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure Environment Variables**

   Create a `.env` file in the project root:
   ```env
   # Option 1: Provide path to service account JSON file (recommended for local dev)
   FIREBASE_SERVICE_ACCOUNT_PATH=./service-account.json

   # Option 2: Provide credentials as JSON string (for production deployment)
   # FIREBASE_CREDENTIALS='{"type":"service_account",...}'
   ```

   Place your downloaded `service-account.json` file in the project root (if using Option 1).

5. **Generate a Test QR Code**
   ```bash
   python generate_qr.py
   ```
   This creates `prescription_qr.png` with sample prescription data.

6. **Run the Application**
   ```bash
   python main.py
   ```
   The application will be available at `http://localhost:8000`

7. **Test the Application**
   - Open `http://localhost:8000` in a web browser
   - Click "Start Camera" and grant camera permissions
   - Scan the generated `prescription_qr.png` file
   - Verify the prescription data is displayed and saved to Firestore
   - Check Firebase Console to verify data is being saved

### Step 3: Security Best Practices

1. **Environment Variables**
   - Never commit `service-account.json` to version control
   - Never commit `.env` file to version control
   - Use environment variables for production deployments
   - Rotate service account keys if compromised

2. **CORS Configuration**
   - In production, update the CORS origins in `main.py`:
     ```python
     allow_origins=[
         "https://your-domain.com",
         "https://your-custom-domain.com"
     ]
     ```

3. **Firebase Security Rules**
   - Implement Firestore rules based on your security requirements
   - For development, "Open" rules allow easy testing
   - For production, use "Restrictive" rules and configure proper access controls

## 🧪 Testing

### Test the API Endpoints

1. **Health Check**
   ```bash
   curl http://localhost:8000/health
   ```

2. **Save Prescription**
   ```bash
   curl -X POST http://localhost:8000/api/save \
     -H "Content-Type: application/json" \
     -d '{"med":"Amoxicillin","dose":"500mg","duration":"7 days"}'
   ```

3. **Retrieve Prescriptions**
   ```bash
   curl http://localhost:8000/api/prescriptions?limit=5
   ```

### Test the Frontend

1. Open `http://localhost:8000` in a browser
2. Click "Start Camera"
3. Grant camera permissions
4. Scan the generated `prescription_qr.png` file
5. Verify success message and data display
6. Check Firebase Console for saved data

## 📁 Project Structure

```
my_prescription_app/
├── index.html              # Frontend UI with Tailwind CSS
├── script.js               # Modular JavaScript for QR scanning
├── main.py                 # FastAPI backend with Firebase integration
├── generate_qr.py          # Script to generate test QR codes
├── requirements.txt        # Python dependencies
├── .env                    # Environment variables (local, not committed)
├── .gitignore              # Git ignore rules
├── service-account.json    # Firebase credentials (local, not committed)
├── prescription_qr.png     # Generated test QR code (not committed)
└── README.md               # This file
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
- **Unit Tests**: Add comprehensive test coverage with pytest
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
- Ensure virtual environment is activated
- Try upgrading pip: `pip install --upgrade pip`
- Clear pip cache: `pip cache purge`
- Reinstall dependencies: `pip install -r requirements.txt --force-reinstall`

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
git commit -m "Initial commit: Prescription QR Scanner app with Firebase integration"
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

**Note:** The `.gitignore` file ensures that sensitive files (service-account.json, .env) and generated files are not committed to the repository.

## 📄 License

This project is provided as-is for educational and personal use.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## 📞 Support

For issues or questions:
- Check the troubleshooting section above
- Review Firebase and Vercel documentation
- Open an issue in the project repository

---

**Built with ❤️ for privacy-first healthcare tracking**
