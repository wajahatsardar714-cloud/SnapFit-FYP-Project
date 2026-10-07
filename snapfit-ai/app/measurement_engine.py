"""Body measurements in cm from one front-facing photo plus the user's height.

Lengths and widths come from BlazePose landmark distances, scaled by
user height / stature-in-pixels. Chest, waist and hip circumferences can't be
seen in a front photo, so they are modelled as ellipses whose breadth comes
from the joint spans and whose depth is a fixed fraction of that breadth
(constants and their meaning in app/config.py); those are flagged
estimated=True.

Measurement names match the merchant size chart's keys.
"""

import math

from app.config import (
    CHEST_BREADTH_PER_SHOULDER_SPAN,
    CHEST_DEPTH_PER_BREADTH,
    ESTIMATED_MEASUREMENTS,
    HIP_BREADTH_PER_HIP_JOINT_SPAN,
    HIP_DEPTH_PER_BREADTH,
    INSEAM_PER_HIP_HEIGHT,
    SHOULDER_WIDTH_PER_JOINT_SPAN,
    STATURE_HEAD_TOP_FACTOR,
    WAIST_BREADTH_PER_HIP_BREADTH,
    WAIST_DEPTH_PER_BREADTH,
)

MEASUREMENT_NAMES = ("shoulderWidth", "chest", "waist", "hip", "torsoLength", "inseam")
FEET = ("LEFT_HEEL", "RIGHT_HEEL", "LEFT_FOOT_INDEX", "RIGHT_FOOT_INDEX", "LEFT_ANKLE", "RIGHT_ANKLE")


def _px(landmark, width, height):
    return (landmark["x"] * width, landmark["y"] * height)


def _distance(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _midpoint(a, b):
    return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)


def ellipse_circumference(breadth, depth):
    """Ramanujan's approximation for an ellipse with these full axes."""
    a, b = breadth / 2, depth / 2
    return math.pi * (3 * (a + b) - math.sqrt((3 * a + b) * (a + 3 * b)))


def stature_px(landmarks, width, height):
    """Skull top to soles, in pixels (vertical extent; the pose gate has already
    ensured the person is upright)."""
    nose_y = landmarks["NOSE"]["y"] * height
    shoulder_y = (landmarks["LEFT_SHOULDER"]["y"] + landmarks["RIGHT_SHOULDER"]["y"]) / 2 * height
    head_top = nose_y - STATURE_HEAD_TOP_FACTOR * (shoulder_y - nose_y)
    feet_bottom = max(landmarks[name]["y"] * height for name in FEET if name in landmarks)
    return feet_bottom - head_top


def estimate_measurements(landmarks, image_width, image_height, user_height_cm=None):
    """Returns {name: {"value", "unit": "cm", "estimated"}} for every chart
    measurement, or {} without a height (no absolute scale -- callers fall back
    to proportion-only matching)."""
    if not user_height_cm:
        return {}

    p = {name: _px(lm, image_width, image_height) for name, lm in landmarks.items()}
    cm_per_px = user_height_cm / stature_px(landmarks, image_width, image_height)

    shoulder_span = _distance(p["LEFT_SHOULDER"], p["RIGHT_SHOULDER"]) * cm_per_px
    hip_span = _distance(p["LEFT_HIP"], p["RIGHT_HIP"]) * cm_per_px
    shoulder_mid = _midpoint(p["LEFT_SHOULDER"], p["RIGHT_SHOULDER"])
    hip_mid = _midpoint(p["LEFT_HIP"], p["RIGHT_HIP"])
    feet_bottom = max(p[name][1] for name in FEET if name in p)

    chest_breadth = shoulder_span * CHEST_BREADTH_PER_SHOULDER_SPAN
    hip_breadth = hip_span * HIP_BREADTH_PER_HIP_JOINT_SPAN
    waist_breadth = hip_breadth * WAIST_BREADTH_PER_HIP_BREADTH

    values = {
        "shoulderWidth": shoulder_span * SHOULDER_WIDTH_PER_JOINT_SPAN,
        "chest": ellipse_circumference(chest_breadth, chest_breadth * CHEST_DEPTH_PER_BREADTH),
        "waist": ellipse_circumference(waist_breadth, waist_breadth * WAIST_DEPTH_PER_BREADTH),
        "hip": ellipse_circumference(hip_breadth, hip_breadth * HIP_DEPTH_PER_BREADTH),
        "torsoLength": _distance(shoulder_mid, hip_mid) * cm_per_px,
        "inseam": (feet_bottom - hip_mid[1]) * cm_per_px * INSEAM_PER_HIP_HEIGHT,
    }
    return {
        name: {"value": round(values[name], 1), "unit": "cm", "estimated": name in ESTIMATED_MEASUREMENTS}
        for name in MEASUREMENT_NAMES
    }
