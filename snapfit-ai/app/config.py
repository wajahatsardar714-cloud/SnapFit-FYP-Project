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
