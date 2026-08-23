import json
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.feature_engine import calculate_features
from app.pose_estimator import PoseEstimationError, extract_landmarks
from app.size_matcher import SizeMatchError, recommend_size

app = FastAPI(title="SnapFit AI Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "snapfit-ai"}


@app.post("/pose/extract")
async def pose_extract(file: UploadFile = File(...)):
    image_bytes = await file.read()
    try:
        return extract_landmarks(image_bytes)
    except PoseEstimationError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/features/calculate")
async def features_calculate(file: UploadFile = File(...), user_height_cm: Optional[float] = Form(None)):
    image_bytes = await file.read()
    try:
        pose = extract_landmarks(image_bytes)
    except PoseEstimationError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return calculate_features(
        pose["key_landmarks"],
        pose["image_dimensions"]["height"],
        pose["image_dimensions"]["width"],
        user_height_cm,
    )


@app.post("/size/recommend")
async def size_recommend(
    file: UploadFile = File(...),
    size_chart: str = Form(...),
    user_height_cm: Optional[float] = Form(None),
):
    image_bytes = await file.read()
    try:
        pose = extract_landmarks(image_bytes)
    except PoseEstimationError as e:
        raise HTTPException(status_code=422, detail=str(e))

    features = calculate_features(
        pose["key_landmarks"],
        pose["image_dimensions"]["height"],
        pose["image_dimensions"]["width"],
        user_height_cm,
    )

    try:
        chart = json.loads(size_chart)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="INVALID_SIZE_CHART_JSON")

    try:
        return recommend_size(features, chart, user_height_cm)
    except SizeMatchError as e:
        raise HTTPException(status_code=422, detail=str(e))
