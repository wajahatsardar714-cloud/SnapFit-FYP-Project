import json
import logging
import time
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.feature_engine import calculate_features
from app.pose_estimator import PoseEstimationError, extract_landmarks
from app.size_matcher import SizeMatchError, recommend_size
from app.utils import calculate_confidence, validate_image

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("snapfit-ai")

app = FastAPI(title="SnapFit AI Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        elapsed_ms = (time.perf_counter() - start) * 1000
        logger.exception(f"{request.method} {request.url.path} FAILURE ({elapsed_ms:.1f}ms)")
        raise

    elapsed_ms = (time.perf_counter() - start) * 1000
    outcome = "SUCCESS" if response.status_code < 400 else "FAILURE"
    logger.info(f"{request.method} {request.url.path} {response.status_code} {outcome} ({elapsed_ms:.1f}ms)")
    return response


@app.get("/health")
def health():
    return {"status": "ok", "service": "snapfit-ai"}


@app.post("/analyze")
async def analyze(
    image: UploadFile = File(...),
    user_height: Optional[float] = Form(None),
    size_chart: Optional[str] = Form(None),
):
    image_bytes = await image.read()

    validation = validate_image(image_bytes)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation["error"])

    try:
        pose = extract_landmarks(image_bytes)
    except PoseEstimationError as e:
        raise HTTPException(status_code=422, detail=str(e))

    image_dimensions = pose["image_dimensions"]
    features = calculate_features(
        pose["key_landmarks"], image_dimensions["height"], image_dimensions["width"], user_height
    )
    confidence = calculate_confidence(pose["landmarks"])

    size_recommendation = None
    if size_chart:
        try:
            chart = json.loads(size_chart)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="INVALID_SIZE_CHART_JSON")

        try:
            size_recommendation = recommend_size(features, chart, user_height)
        except SizeMatchError as e:
            raise HTTPException(status_code=422, detail=str(e))

    return {
        "image_dimensions": image_dimensions,
        "key_landmarks": pose["key_landmarks"],
        "confidence": confidence,
        "features": features,
        "size_recommendation": size_recommendation,
    }


@app.post("/landmarks-only")
async def landmarks_only(image: UploadFile = File(...)):
    image_bytes = await image.read()
    try:
        pose = extract_landmarks(image_bytes)
    except PoseEstimationError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return {"landmarks": pose["landmarks"], "image_dimensions": pose["image_dimensions"]}
