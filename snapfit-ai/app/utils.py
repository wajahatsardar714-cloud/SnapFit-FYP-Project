import io

import cv2
import numpy as np
from PIL import Image, ImageOps

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


def decode_image(image_bytes, keep_alpha=False):
    """Decodes to an upright BGR array (BGRA when keep_alpha and the image has
    transparency), honouring EXIF orientation. OpenCV applies EXIF only for
    IMREAD_COLOR, so the alpha-preserving path goes through Pillow instead.
    Returns None for undecodable bytes."""
    if not keep_alpha:
        return cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)

    try:
        with Image.open(io.BytesIO(image_bytes)) as pil_image:
            upright = ImageOps.exif_transpose(pil_image)
            has_alpha = upright.mode in ("RGBA", "LA", "PA") or "transparency" in upright.info
            array = np.asarray(upright.convert("RGBA" if has_alpha else "RGB"))
    except OSError:
        return None
    return cv2.cvtColor(array, cv2.COLOR_RGBA2BGRA if has_alpha else cv2.COLOR_RGB2BGR)


def mean_brightness(image):
    """Mean luma (0-255) of a BGR image, from a small downscale -- the same cheap
    measure the web app's live gate takes from a downscaled video frame."""
    small = cv2.resize(image, (32, 32), interpolation=cv2.INTER_AREA)
    return float(cv2.cvtColor(small[:, :, :3], cv2.COLOR_BGR2GRAY).mean())


def validate_image(image_bytes):
    if len(image_bytes) > MAX_FILE_SIZE_BYTES:
        return {"valid": False, "error": "FILE_TOO_LARGE"}

    image = decode_image(image_bytes)

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

        # Frontal = shoulders at the same depth. Not based on which side is on the
        # left of the image: that flips for mirrored selfies, and the old
        # left.x < right.x test scored every un-mirrored front-facing photo as 0
        # (BlazePose LEFT_* is the subject's left, so it lands on screen-right).
        shoulder_width = abs(left_shoulder["x"] - right_shoulder["x"])
        if shoulder_width > 0:
            depth_gap = abs(left_shoulder.get("z", 0.0) - right_shoulder.get("z", 0.0))
            facing_score = max(0.0, min(1.0, 1.0 - depth_gap / shoulder_width))

            tilt_ratio = abs(left_shoulder["y"] - right_shoulder["y"]) / shoulder_width
            symmetry_score = max(0.0, min(1.0, 1.0 - tilt_ratio))

    confidence = (
        VISIBILITY_WEIGHT * visibility_score
        + COMPLETENESS_WEIGHT * completeness_score
        + FACING_WEIGHT * facing_score
        + SYMMETRY_WEIGHT * symmetry_score
    )

    return round(confidence, 2)
