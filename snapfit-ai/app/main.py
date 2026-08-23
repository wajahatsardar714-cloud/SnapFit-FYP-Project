from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.pose_estimator import PoseEstimationError, extract_landmarks

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
