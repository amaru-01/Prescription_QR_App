"""
Prescription QR Scanner - FastAPI Backend
Privacy-first prescription tracking via QR codes with Firebase Firestore storage.
"""

import os
import json
from typing import Optional
from datetime import datetime

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

# Load environment variables from .env file (for local development)
load_dotenv()

# Initialize FastAPI application
app = FastAPI(
    title="Prescription QR Scanner API",
    description="Privacy-first prescription tracking via QR codes",
    version="1.0.0"
)

# Configure CORS middleware for web deployment
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*",  # Allow all origins for development - restrict in production
        # In production, specify your domain:
        # "https://your-domain.vercel.app",
        # "https://your-custom-domain.com"
    ],
    allow_credentials=True,
    allow_methods=["POST", "OPTIONS", "GET"],
    allow_headers=["Content-Type", "Authorization"],
)

# Mount static files for serving HTML, CSS, JS
app.mount("/static", StaticFiles(directory="."), name="static")

# Initialize Firebase Admin SDK
def initialize_firebase():
    """
    Initialize Firebase Admin SDK with credentials from environment variables.
    Supports both Vercel serverless environment and local development.
    """
    try:
        # Check if Firebase is already initialized
        if not firebase_admin._apps:
            # Get Firebase credentials from environment variable
            firebase_credentials_json = os.getenv("FIREBASE_CREDENTIALS")

            if firebase_credentials_json:
                # Parse JSON credentials from environment variable (Vercel deployment)
                credentials_dict = json.loads(firebase_credentials_json)
                cred = credentials.Certificate(credentials_dict)
            else:
                # Fallback: Try to load from local file (local development)
                # This should be a path to your service account JSON file
                service_account_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "service-account.json")
                
                if os.path.exists(service_account_path):
                    cred = credentials.Certificate(service_account_path)
                else:
                    # If no credentials found, raise an error
                    raise ValueError(
                        "Firebase credentials not found. Please set FIREBASE_CREDENTIALS "
                        "environment variable or provide service-account.json file."
                    )

            # Initialize Firebase with the credentials
            firebase_admin.initialize_app(cred)
            print("Firebase Admin SDK initialized successfully")
        
        return firestore.client()
    
    except Exception as e:
        print(f"Error initializing Firebase: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to initialize Firebase: {str(e)}"
        )

# Initialize Firestore client
try:
    db = initialize_firebase()
except Exception as e:
    print(f"Warning: Firebase initialization failed: {str(e)}")
    db = None

# Pydantic model for prescription data validation
class Prescription(BaseModel):
    """
    Pydantic model for prescription data validation.
    Ensures data integrity before saving to Firestore.
    """
    med: str = Field(..., min_length=1, description="Medication name")
    dose: str = Field(..., min_length=1, description="Dosage information")
    duration: str = Field(..., min_length=1, description="Duration of prescription")

    @field_validator('med')
    @classmethod
    def validate_medication(cls, v):
        """Validate medication name is not empty or just whitespace"""
        if not v or not v.strip():
            raise ValueError("Medication name cannot be empty")
        return v.strip()

    @field_validator('dose')
    @classmethod
    def validate_dose(cls, v):
        """Validate dose is not empty or just whitespace"""
        if not v or not v.strip():
            raise ValueError("Dosage cannot be empty")
        return v.strip()

    @field_validator('duration')
    @classmethod
    def validate_duration(cls, v):
        """Validate duration is not empty or just whitespace"""
        if not v or not v.strip():
            raise ValueError("Duration cannot be empty")
        return v.strip()

    model_config = {
        "json_schema_extra": {
            "example": {
                "med": "Amoxicillin",
                "dose": "500mg",
                "duration": "7 days"
            }
        }
    }


@app.get("/")
async def root():
    """
    Serve the index.html file at the root endpoint.
    """
    return FileResponse("index.html")


@app.get("/health")
async def health_check():
    """
    Health check endpoint for monitoring.
    """
    firebase_status = "connected" if db else "disconnected"
    return {
        "status": "healthy",
        "firebase": firebase_status,
        "timestamp": datetime.utcnow().isoformat()
    }


@app.post("/api/save")
async def save_prescription(prescription: Prescription, request: Request):
    """
    Save prescription data to Firebase Firestore.
    
    Args:
        prescription: Prescription data validated by Pydantic model
        request: FastAPI Request object for additional context
    
    Returns:
        Success message with document ID
    
    Raises:
        HTTPException: If Firebase is not initialized or save fails
    """
    # Check if Firebase is initialized
    if db is None:
        raise HTTPException(
            status_code=503,
            detail="Firebase is not initialized. Please check your credentials configuration."
        )

    try:
        # Create document data with timestamp
        prescription_data = {
            "med": prescription.med,
            "dose": prescription.dose,
            "duration": prescription.duration,
            "created_at": firestore.SERVER_TIMESTAMP,
            "user_agent": request.headers.get("user-agent", "unknown"),
            "ip_address": request.client.host if request.client else "unknown"
        }

        # Add document to Firestore 'prescriptions' collection
        doc_ref = db.collection("prescriptions").add(prescription_data)

        print(f"Prescription saved with ID: {doc_ref[1].id}")

        return {
            "success": True,
            "message": "Prescription saved successfully",
            "document_id": doc_ref[1].id
        }

    except Exception as e:
        print(f"Error saving prescription: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save prescription: {str(e)}"
        )


@app.get("/api/prescriptions")
async def get_prescriptions(limit: int = 10):
    """
    Retrieve recent prescriptions from Firestore (optional endpoint for testing).
    
    Args:
        limit: Maximum number of prescriptions to retrieve (default: 10)
    
    Returns:
        List of prescription documents
    
    Raises:
        HTTPException: If Firebase is not initialized or query fails
    """
    if db is None:
        raise HTTPException(
            status_code=503,
            detail="Firebase is not initialized. Please check your credentials configuration."
        )

    try:
        # Query prescriptions collection, ordered by creation time (descending)
        prescriptions_ref = (
            db.collection("prescriptions")
            .order_by("created_at", direction=firestore.DESCENDING)
            .limit(limit)
        )
        
        prescriptions = prescriptions_ref.stream()
        
        result = []
        for doc in prescriptions:
            doc_data = doc.to_dict()
            doc_data["id"] = doc.id
            # Convert datetime to string for JSON serialization
            if "created_at" in doc_data and doc_data["created_at"]:
                doc_data["created_at"] = doc_data["created_at"].isoformat()
            result.append(doc_data)

        return {
            "success": True,
            "count": len(result),
            "prescriptions": result
        }

    except Exception as e:
        print(f"Error retrieving prescriptions: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve prescriptions: {str(e)}"
        )


# Vercel serverless function handler
# This allows the FastAPI app to work as a Vercel serverless function
def handler(request):
    """
    Vercel serverless function handler.
    """
    return app(request)


if __name__ == "__main__":
    import uvicorn
    
    # Run the FastAPI application locally for development
    print("Starting FastAPI server locally...")
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
