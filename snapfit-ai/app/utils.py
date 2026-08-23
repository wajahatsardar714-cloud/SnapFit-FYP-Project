import cv2
import numpy as np

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
MIN_RESOLUTION = 200

REQUIRED_LANDMARKS = (
    "LEFT_SHOULDER",
    "RIGHT_SHOULDER",
    "LEFT_HIP",
    "RIGHT_HIP",
    "LEFT_KNEE",
    "RIGHT_KNEE",
    "LEFT_ANKLE",
    "RIGHT_ANKLE",
)

VISIBILITY_WEIGHT = 0.4
COMPLETENESS_WEIGHT = 0.3
FACING_WEIGHT = 0.15
SYMMETRY_WEIGHT = 0.15


def validate_image(image_bytes):
    if len(image_bytes) > MAX_FILE_SIZE_BYTES:
        return {"valid": False, "error": "FILE_TOO_LARGE"}

    image_array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)

    if image is None:
        return {"valid": False, "error": "INVALID_IMAGE"}

    height, width = image.shape[:2]
    if height < MIN_RESOLUTION or width < MIN_RESOLUTION:
        return {"valid": False, "error": "RESOLUTION_TOO_LOW"}

    return {"valid": True, "error": None}


def calculate_confidence(landmarks):
    present = [name for name in REQUIRED_LANDMARKS if name in landmarks]

    visibility_score = (
        sum(landmarks[name]["visibility"] for name in present) / len(present)
        if present
        else 0.0
    )
    completeness_score = len(present) / len(REQUIRED_LANDMARKS)

    facing_score = 0.0
    symmetry_score = 0.0
    if "LEFT_SHOULDER" in landmarks and "RIGHT_SHOULDER" in landmarks:
        left_shoulder = landmarks["LEFT_SHOULDER"]
        right_shoulder = landmarks["RIGHT_SHOULDER"]

        facing_score = 1.0 if left_shoulder["x"] < right_shoulder["x"] else 0.0

        shoulder_width = abs(left_shoulder["x"] - right_shoulder["x"])
        if shoulder_width > 0:
            tilt_ratio = abs(left_shoulder["y"] - right_shoulder["y"]) / shoulder_width
            symmetry_score = max(0.0, min(1.0, 1.0 - tilt_ratio))

    confidence = (
        VISIBILITY_WEIGHT * visibility_score
        + COMPLETENESS_WEIGHT * completeness_score
        + FACING_WEIGHT * facing_score
        + SYMMETRY_WEIGHT * symmetry_score
    )

    return round(confidence, 2)
