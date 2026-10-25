"""Soft photo-quality tips for /analyze.

The pose gate (pose_validator.py) rejects photos that can't be used at all,
e.g. too dark or too bright overall. These checks sit above it: a photo that
passed the gate but is likely to give a less accurate size gets a tip, never a
failure. Thresholds and their meaning are in app/config.py.

Glare and clutter are judged against boxes taken from the landmarks: glare on
the torso, clutter in the background around the whole body.
"""

import cv2
import numpy as np

from app.config import (
    BLOWN_OUT_LUMA,
    BODY_BOX_PADDING,
    CANNY_HIGH,
    CANNY_LOW,
    CLUTTER_EDGE_DENSITY,
    DIM_LIGHT_BRIGHTNESS,
    GLARE_AREA_SHARE,
    MIN_BACKGROUND_SHARE,
    PHOTO_ANALYSIS_SIDE,
    POSE_RULES,
)
from app.utils import mean_brightness

TIP_MESSAGES = {
    "dim_light": "Your photo is quite dark. Retake it in brighter, even light for a more accurate size.",
    "glare": "Part of your photo is washed out by bright light. Avoid facing a window or a strong lamp.",
    "cluttered_background": "A busy background can confuse the measurement. Stand against a plain wall if you can.",
}
TORSO_LANDMARKS = ("LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_HIP", "RIGHT_HIP")


def _analysis_gray(image):
    height, width = image.shape[:2]
    scale = min(1.0, PHOTO_ANALYSIS_SIDE / max(height, width))
    small = cv2.resize(image, (max(1, round(width * scale)), max(1, round(height * scale))), interpolation=cv2.INTER_AREA)
    return cv2.cvtColor(small[:, :, :3], cv2.COLOR_BGR2GRAY)


def _box(landmarks, names, width, height, padding=0.0):
    """(x0, y0, x1, y1) pixel box around the named landmarks that are visible,
    padded on every side by `padding` x its size and clipped to the frame;
    None when none of them is visible."""
    threshold = POSE_RULES["visibility_threshold"]
    visible = [
        landmarks[name]
        for name in names
        if name in landmarks and (landmarks[name].get("visibility") or 0) >= threshold
    ]
    if not visible:
        return None
    xs = [lm["x"] for lm in visible]
    ys = [lm["y"] for lm in visible]
    pad_x = (max(xs) - min(xs)) * padding
    pad_y = (max(ys) - min(ys)) * padding
    x0, x1 = max(0.0, min(xs) - pad_x), min(1.0, max(xs) + pad_x)
    y0, y1 = max(0.0, min(ys) - pad_y), min(1.0, max(ys) + pad_y)
    return int(x0 * width), int(y0 * height), int(np.ceil(x1 * width)), int(np.ceil(y1 * height))


def body_box(landmarks, width, height):
    """Box around every visible landmark, padded for the body outline."""
    return _box(landmarks, list(landmarks), width, height, BODY_BOX_PADDING)


def torso_box(landmarks, width, height):
    """Shoulder-to-hip joint box: inside the body outline, so all clothing."""
    return _box(landmarks, TORSO_LANDMARKS, width, height)


def _has_glare(gray, box):
    if box is None:
        return False
    region = gray[box[1] : box[3], box[0] : box[2]]
    return region.size > 0 and np.mean(region >= BLOWN_OUT_LUMA) > GLARE_AREA_SHARE


def _has_cluttered_background(gray, box):
    if box is None:
        return False
    background = np.ones(gray.shape, bool)
    background[box[1] : box[3], box[0] : box[2]] = False
    if background.mean() < MIN_BACKGROUND_SHARE:
        return False
    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), CANNY_LOW, CANNY_HIGH)
    return np.mean(edges[background] > 0) > CLUTTER_EDGE_DENSITY


def photo_tips(image, landmarks):
    """[{"id", "message"}] for a BGR photo and its pose landmarks
    ({NAME: {x, y, visibility}} normalised to [0, 1]); empty when the photo
    looks fine."""
    gray = _analysis_gray(image)
    height, width = gray.shape
    found = []
    if mean_brightness(image) < DIM_LIGHT_BRIGHTNESS:
        found.append("dim_light")
    if _has_glare(gray, torso_box(landmarks, width, height)):
        found.append("glare")
    if _has_cluttered_background(gray, body_box(landmarks, width, height)):
        found.append("cluttered_background")
    return [{"id": tip_id, "message": TIP_MESSAGES[tip_id]} for tip_id in found]
