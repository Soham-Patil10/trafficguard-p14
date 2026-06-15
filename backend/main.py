"""
TrafficGuard - FastAPI Backend
COMP47250 - Team Software Project - Project P14 - UCD Summer 2026

Owner: Yashi (FastAPI Backend)

Provides a REST API for the TrafficGuard congestion classification model.

Endpoints:
    GET  /health  - Health check returning model info and status
    POST /predict - Accepts an uploaded image, returns congestion prediction

Run with:
    uvicorn backend.main:app --host 0.0.0.0 --port 8000
"""

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ============================================================================
# App initialization
# ============================================================================

app = FastAPI(
    title="TrafficGuard API",
    description="Risk Assessment Dashboard for Adversarial Robustness "
                "in Urban Congestion AI",
    version="0.1.0",
)

# ============================================================================
# CORS Middleware - allow all origins for development
# ============================================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# Endpoints
# ============================================================================

@app.get("/health")
async def health():
    """
    Health check endpoint.

    Returns model name, supported classes, and service status.
    """
    return JSONResponse(content={
        "model_name": "ResNet18",
        "classes": ["Low", "Medium", "High"],
        "status": "healthy",
    })

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    """
    Predict congestion level from an uploaded image.

    This is currently a scaffold returning dummy predictions.
    Will be connected to the trained ResNet18 model in a future iteration.

    Args:
        file: An uploaded image file (JPEG/PNG).

    Returns:
        JSON with predicted_class, confidence, and all_probabilities.
    """
    # TODO: Load and preprocess the image, run through the model
    # For now, return a dummy response
    return JSONResponse(content={
        "predicted_class": "Medium",
        "confidence": 0.85,
        "all_probabilities": {
            "Low": 0.10,
            "Medium": 0.85,
            "High": 0.05,
        },
    })
