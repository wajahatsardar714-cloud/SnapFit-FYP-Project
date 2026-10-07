import base64
import json
import logging
import time
from typing import Optional

import httpx
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.feature_engine import calculate_features
from app.measurement_engine import estimate_measurements
from app.pose_estimator import PoseEstimationError, extract_landmarks
from app.pose_validator import PoseInvalidError, assert_valid_pose
from app.size_matcher import SizeMatchError, recommend_size
from app.try_on import TryOnError, fetch_image_bytes, fetch_product_anchor_data, garment_ease, generate_try_on
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


# size_recommendation keeps its original shape; the per-measurement comparison
# is returned in the newer top-level fields.
LEGACY_RECOMMENDATION_KEYS = ("recommended_size", "confidence", "fit_scores", "body_type", "notes")


def _pose_invalid_exception(error):
    return HTTPException(status_code=422, detail={"code": "POSE_INVALID", "failed_checks": error.failed_checks})


def _extract_valid_pose(image_bytes):
    pose = extract_landmarks(image_bytes)
    dimensions = pose["image_dimensions"]
    assert_valid_pose(pose["landmarks"], dimensions["width"], dimensions["height"], pose["brightness"])
    return pose


TRY_ON_ERROR_STATUS = {"TRYON_NOT_AVAILABLE": 404, "BACKEND_UNREACHABLE": 502, "PRODUCT_IMAGE_UNREACHABLE": 502}


async def _render_try_on(image_bytes, pose, merchant_id, product_id, ease=1.0):
    """Try-on image as a data URL. Raises TryOnError with a code on failure."""
    try:
        anchor_points, product_image_url = await fetch_product_anchor_data(merchant_id, product_id)
    except httpx.HTTPError:
        raise TryOnError("BACKEND_UNREACHABLE")
    try:
        product_image_bytes = await fetch_image_bytes(product_image_url)
    except httpx.HTTPError:
        raise TryOnError("PRODUCT_IMAGE_UNREACHABLE")

    result_bytes = generate_try_on(image_bytes, product_image_bytes, anchor_points, pose=pose, ease=ease)
    return f"data:image/jpeg;base64,{base64.b64encode(result_bytes).decode('ascii')}"


@app.get("/health")
def health():
    return {"status": "ok", "service": "snapfit-ai"}


@app.post("/analyze")
async def analyze(
    image: UploadFile = File(...),
    user_height: Optional[float] = Form(None),
    size_chart: Optional[str] = Form(None),
    try_on_product_id: Optional[str] = Form(None),
    merchant_id: Optional[str] = Form(None),
):
    """With try_on_product_id + merchant_id, also renders the virtual try-on from
    the same pose (one upload, one detection). A try-on failure never fails the
    analysis: it is reported as tryOn: {"error": CODE}."""
    image_bytes = await image.read()

    validation = validate_image(image_bytes)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation["error"])

    try:
        pose = _extract_valid_pose(image_bytes)
    except PoseEstimationError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except PoseInvalidError as e:
        raise _pose_invalid_exception(e)

    image_dimensions = pose["image_dimensions"]
    features = calculate_features(
        pose["key_landmarks"], image_dimensions["height"], image_dimensions["width"], user_height
    )
    confidence = calculate_confidence(pose["landmarks"])
    measurements = estimate_measurements(
        pose["landmarks"], image_dimensions["width"], image_dimensions["height"], user_height
    )

    match = None
    if size_chart:
        try:
            chart = json.loads(size_chart)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="INVALID_SIZE_CHART_JSON")

        try:
            match = recommend_size(features, chart, measurements)
        except SizeMatchError as e:
            raise HTTPException(status_code=422, detail=str(e))

    try_on_result = None
    if try_on_product_id and merchant_id:
        try:
            image_url = await _render_try_on(image_bytes, pose, merchant_id, try_on_product_id, garment_ease(match))
            try_on_result = {"image": image_url}
        except TryOnError as e:
            try_on_result = {"error": str(e).split(":")[0]}

    return {
        "image_dimensions": image_dimensions,
        "key_landmarks": pose["key_landmarks"],
        "confidence": confidence,
        "features": features,
        "size_recommendation": {key: match[key] for key in LEGACY_RECOMMENDATION_KEYS} if match else None,
        "measurements": measurements,
        "sizeComparison": match["size_comparison"] if match else None,
        "recommendedSize": match["recommended_size"] if match else None,
        "alternativeSize": match["alternative_size"] if match else None,
        "fitNotes": match["fit_notes"] if match else [],
        "tryOn": try_on_result,
    }


@app.post("/landmarks-only")
async def landmarks_only(image: UploadFile = File(...)):
    image_bytes = await image.read()
    try:
        pose = extract_landmarks(image_bytes)
    except PoseEstimationError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return {"landmarks": pose["landmarks"], "image_dimensions": pose["image_dimensions"]}


# Independently callable virtual try-on (Phase 12) -- deliberately not coupled to
# /analyze's response shape or size-recommendation flow. Reuses extract_landmarks,
# the same BlazePose extraction /analyze uses, via app.try_on rather than
# duplicating it.
@app.post("/try-on")
async def try_on(
    image: UploadFile = File(...),
    product_id: str = Form(...),
    merchant_id: str = Form(...),
):
    image_bytes = await image.read()

    validation = validate_image(image_bytes)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation["error"])

    try:
        pose = _extract_valid_pose(image_bytes)
    except PoseEstimationError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except PoseInvalidError as e:
        raise _pose_invalid_exception(e)

    try:
        return {"image": await _render_try_on(image_bytes, pose, merchant_id, product_id)}
    except TryOnError as e:
        code = str(e).split(":")[0]
        raise HTTPException(status_code=TRY_ON_ERROR_STATUS.get(code, 422), detail=code)
