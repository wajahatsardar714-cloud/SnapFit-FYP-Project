import json
import os
from types import MappingProxyType

# Pose acceptance rules shared with the web app's live camera gate
# (snapfit-web/src/config/poseConfig.js). Kept as JSON so a web test can assert
# the two sides never drift apart. Units:
#   *_ratio / *_margin / *_tolerance / body_height_*  -> fraction of the frame
#     (or of another body length, per the key name)
#   *_deg -> degrees, measured in pixel space (aspect-corrected)
#   brightness_* -> mean luma, 0-255
#   head_top_from_nose_factor -> head top sits this many (nose -> shoulder-line)
#     distances above the nose (0.8 ~ top of the skull)
#   shoulder_depth_ratio_max -> max |z(left) - z(right)| shoulder difference as a
#     fraction of on-screen shoulder width (BlazePose z shares the x scale)
_RULES_PATH = os.path.join(os.path.dirname(__file__), "pose_rules.json")

with open(_RULES_PATH, encoding="utf-8") as rules_file:
    POSE_RULES = MappingProxyType(json.load(rules_file))


# --- Body measurement model (measurement_engine.py) -------------------------
# Approximations from adult anthropometric averages, not calibrated against
# labelled SnapFit data -- tune as fit feedback comes in.

# Stature = skull top -> soles. The skull top sits this many (nose -> shoulder
# line) distances above the nose (no hair allowance, unlike the pose gate).
STATURE_HEAD_TOP_FACTOR = 0.85

# BlazePose shoulder/hip landmarks are joint centres, inside the body outline.
# Garment shoulder width (seam to seam) ~= 1.2 x shoulder-joint span.
SHOULDER_WIDTH_PER_JOINT_SPAN = 1.2
# Inseam (crotch -> floor) ~= 0.9 x hip-joint height above the floor
# (typical adult inseam ~= 0.45 x stature).
INSEAM_PER_HIP_HEIGHT = 0.9

# Circumferences from one front photo: front-view breadth from the joint span,
# depth as a fraction of breadth, then the ellipse perimeter (Ramanujan).
CHEST_BREADTH_PER_SHOULDER_SPAN = 0.95
CHEST_DEPTH_PER_BREADTH = 0.72
HIP_BREADTH_PER_HIP_JOINT_SPAN = 1.75
HIP_DEPTH_PER_BREADTH = 0.75
WAIST_BREADTH_PER_HIP_BREADTH = 0.85
WAIST_DEPTH_PER_BREADTH = 0.7

# Measurements that can't be read directly off a front photo.
ESTIMATED_MEASUREMENTS = frozenset({"chest", "waist", "hip"})

# Clothing allowance, from what the shopper says they are wearing. BlazePose
# finds joints, not the body outline, so clothing mainly makes joint placement
# less certain; loose clothing also nudges the detected shoulder and hip joints
# outward, widening those spans a little. Width and circumference measurements
# are scaled by the width factor (lengths are unaffected) and the size
# recommendation's confidence by the confidence factor. Provisional judgement
# values until volunteer calibration.
CLOTHING_FITS = ("fitted", "regular", "loose")
DEFAULT_CLOTHING_FIT = "regular"
CLOTHING_WIDTH_FACTOR = {"fitted": 1.0, "regular": 0.99, "loose": 0.97}
CLOTHING_CONFIDENCE_FACTOR = {"fitted": 1.0, "regular": 1.0, "loose": 0.9}

# Heights (cm) outside this range are treated as typos and rejected.
USER_HEIGHT_MIN_CM = 100
USER_HEIGHT_MAX_CM = 230
# Below this height the shopper is probably a child, and merchant size charts
# are adult charts: the recommendation is flagged and its confidence scaled.
CHILD_HEIGHT_CM = 145
CHILD_CONFIDENCE_FACTOR = 0.6

# --- Size matching (size_matcher.py) ------------------------------------------
# A measurement inside a size's range scores 1; outside, the score falls to 0
# at this fraction of the range midpoint away from the nearest edge.
FIT_TOLERANCE_PCT = 0.10
# Within this fraction of the top of a range, suggest the next size up.
NEAR_EDGE_PCT = 0.15

# How much each measurement matters, per garment category. Measurements a chart
# doesn't define are dropped and the rest re-normalised.
CATEGORY_WEIGHTS = {
    "tops": {"chest": 0.4, "shoulderWidth": 0.3, "waist": 0.1, "torsoLength": 0.2},
    "outerwear": {"chest": 0.4, "shoulderWidth": 0.35, "waist": 0.1, "torsoLength": 0.15},
    "bottoms": {"waist": 0.4, "hip": 0.4, "inseam": 0.2},
    "dresses": {"chest": 0.35, "waist": 0.35, "hip": 0.3},
}
DEFAULT_WEIGHTS = {"chest": 1, "shoulderWidth": 1, "waist": 1, "hip": 1, "torsoLength": 1, "inseam": 1}

# --- Photo tips (photo_quality.py) --------------------------------------------
# Soft, non-blocking advice layered above the pose gate's hard brightness
# limits (pose_rules.json brightness_min / brightness_max). Measured on a
# downscale whose longest side is PHOTO_ANALYSIS_SIDE px.
PHOTO_ANALYSIS_SIDE = 512
# Mean luma (0-255) below which a photo that passed the gate is still dim
# enough for joints to be placed less reliably.
DIM_LIGHT_BRIGHTNESS = 70
# Luma at or above which a pixel is blown out (no detail left), and the share
# of the torso (the shoulder-to-hip joint box, which lies inside the body
# outline) that may be blown out before a retake is suggested. Judged on the
# torso, not the whole frame, so a white studio backdrop doesn't count.
BLOWN_OUT_LUMA = 250
GLARE_AREA_SHARE = 0.06
# Body box = the visible landmarks' bounds, padded on every side by this
# fraction of its width / height for the body outline and head around them.
BODY_BOX_PADDING = 0.12
# Share of background (outside the body box) pixels that are Canny edges above
# which the background counts as busy: a plain wall is close to 0, one with a
# door frame and a picture about 0.03, a cluttered room 0.08 or more.
CLUTTER_EDGE_DENSITY = 0.05
# Canny hysteresis thresholds, run after a light blur so sensor noise and JPEG
# artefacts on a plain wall don't count as edges.
CANNY_LOW, CANNY_HIGH = 50, 150
# Below this share of the frame there is too little background to judge.
MIN_BACKGROUND_SHARE = 0.1
