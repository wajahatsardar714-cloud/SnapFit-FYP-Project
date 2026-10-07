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
#     distances above the nose; 1.0 leaves room for hair
#   shoulder_depth_ratio_max -> max |z(left) - z(right)| shoulder difference as a
#     fraction of on-screen shoulder width (BlazePose z shares the x scale)
_RULES_PATH = os.path.join(os.path.dirname(__file__), "pose_rules.json")

with open(_RULES_PATH, encoding="utf-8") as rules_file:
    POSE_RULES = MappingProxyType(json.load(rules_file))
