"""Server-side copy of the web app's live pose gate
(snapfit-web/src/utils/poseValidation.js), applied to every photo /analyze and
/try-on receive -- uploads and QR-handoff photos never pass through the live
camera gate, so they are held to the same rules here.

Single-photo version: the live gate's stillness check needs a frame history and
is skipped. Check ids, order and messages match the web module.
"""

import math

from app.config import POSE_RULES

FEET_GROUP = {"LEFT_ANKLE", "RIGHT_ANKLE", "LEFT_HEEL", "RIGHT_HEEL"}
HEAD_GROUP = {"NOSE"}
ARM_GROUP = {"LEFT_ELBOW", "RIGHT_ELBOW", "LEFT_WRIST", "RIGHT_WRIST"}

PASSED_LABELS = {
    "lighting": "Lighting looks good",
    "visibility": "Whole body visible",
    "framing": "Body inside the frame",
    "distance": "Good distance from the camera",
    "centered": "Centred in the frame",
    "facing": "Facing the camera",
    "level": "Standing straight",
    "pose": "Arms and legs in position",
}
CHECK_ORDER = tuple(PASSED_LABELS)
SKIPPED_MESSAGE = "Waiting for your whole body to be visible"


class PoseInvalidError(Exception):
    def __init__(self, failed_checks):
        super().__init__("POSE_INVALID")
        self.failed_checks = failed_checks


def _point(landmark, aspect):
    # Normalised coords -> "frame height" units, so angles and distances aren't
    # skewed by non-square images.
    return (landmark["x"] * aspect, landmark["y"])


def _midpoint(a, b):
    return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)


def _distance(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _angle_between(v1, v2):
    norm = math.hypot(*v1) * math.hypot(*v2)
    if norm == 0:
        return 0.0
    cos = (v1[0] * v2[0] + v1[1] * v2[1]) / norm
    return math.degrees(math.acos(max(-1.0, min(1.0, cos))))


def _joint_angle(a, joint, b):
    return _angle_between((a[0] - joint[0], a[1] - joint[1]), (b[0] - joint[0], b[1] - joint[1]))


def _line_tilt(a, b):
    return math.degrees(math.atan2(abs(a[1] - b[1]), abs(a[0] - b[0]) or 1e-9))


def _check(check_id, passed, message=None):
    return {"id": check_id, "passed": passed, "message": PASSED_LABELS[check_id] if passed else message}


def _check_lighting(brightness, rules):
    if brightness < rules["brightness_min"]:
        return _check("lighting", False, "It's too dark — move somewhere brighter")
    if brightness > rules["brightness_max"]:
        return _check("lighting", False, "It's too bright — avoid strong light behind or in front of you")
    return _check("lighting", True)


def _check_visibility(landmarks, rules):
    threshold = rules["visibility_threshold"]
    missing = {
        name
        for name in rules["required_landmarks"]
        if name not in landmarks or (landmarks[name].get("visibility") or 0) < threshold
    }
    if not missing:
        return _check("visibility", True)
    if missing & FEET_GROUP:
        message = "Step back so your feet are visible"
    elif missing & HEAD_GROUP:
        message = "Step back so your head is visible"
    elif missing <= ARM_GROUP:
        message = "Keep both arms in view, held slightly away from your body"
    else:
        message = "Step back so your whole body is in the frame"
    return _check("visibility", False, message)


def _body_extent(landmarks, rules):
    nose_y = landmarks["NOSE"]["y"]
    shoulder_y = (landmarks["LEFT_SHOULDER"]["y"] + landmarks["RIGHT_SHOULDER"]["y"]) / 2
    head_top = nose_y - rules["head_top_from_nose_factor"] * (shoulder_y - nose_y)
    feet_names = ("LEFT_HEEL", "RIGHT_HEEL", "LEFT_FOOT_INDEX", "RIGHT_FOOT_INDEX", "LEFT_ANKLE", "RIGHT_ANKLE")
    feet_bottom = max(landmarks[name]["y"] for name in feet_names if name in landmarks)
    xs = [landmarks[name]["x"] for name in rules["required_landmarks"]]
    return head_top, feet_bottom, min(xs), max(xs)


def _check_framing(extent, rules):
    head_top, feet_bottom, min_x, max_x = extent
    margin = rules["frame_margin"]
    if head_top < margin:
        return _check("framing", False, "Move back so there's space above your head")
    if feet_bottom > 1 - margin:
        return _check("framing", False, "Step back so there's space below your feet")
    if min_x < margin or max_x > 1 - margin:
        return _check("framing", False, "Move to the centre so your arms fit in the frame")
    return _check("framing", True)


def _check_distance(extent, rules):
    head_top, feet_bottom, _, _ = extent
    body_height = feet_bottom - head_top
    if body_height < rules["body_height_min"]:
        return _check("distance", False, "Move closer to the camera")
    if body_height > rules["body_height_max"]:
        return _check("distance", False, "Step back a little")
    return _check("distance", True)


def _check_centered(landmarks, rules):
    hip_mid_x = (landmarks["LEFT_HIP"]["x"] + landmarks["RIGHT_HIP"]["x"]) / 2
    if abs(hip_mid_x - 0.5) > rules["center_tolerance"]:
        return _check("centered", False, "Move to the centre of the frame")
    return _check("centered", True)


def _check_facing(landmarks, p, rules):
    shoulder_width = _distance(p["LEFT_SHOULDER"], p["RIGHT_SHOULDER"])
    hip_width = _distance(p["LEFT_HIP"], p["RIGHT_HIP"])
    torso_length = _distance(
        _midpoint(p["LEFT_SHOULDER"], p["RIGHT_SHOULDER"]), _midpoint(p["LEFT_HIP"], p["RIGHT_HIP"])
    )
    shoulder_width_x = abs(landmarks["LEFT_SHOULDER"]["x"] - landmarks["RIGHT_SHOULDER"]["x"])
    depth_gap = abs(landmarks["LEFT_SHOULDER"].get("z", 0.0) - landmarks["RIGHT_SHOULDER"].get("z", 0.0))

    shoulder_hip_ratio = shoulder_width / hip_width if hip_width else 0.0
    shoulder_torso_ratio = shoulder_width / torso_length if torso_length else 0.0
    depth_ratio = depth_gap / shoulder_width_x if shoulder_width_x else math.inf

    frontal = (
        rules["shoulder_hip_ratio_min"] <= shoulder_hip_ratio <= rules["shoulder_hip_ratio_max"]
        and shoulder_torso_ratio >= rules["shoulder_torso_ratio_min"]
        and depth_ratio <= rules["shoulder_depth_ratio_max"]
    )
    return _check("facing", True) if frontal else _check("facing", False, "Turn to face the camera")


def _check_level(p, rules):
    tilt_max = rules["line_tilt_max_deg"]
    if _line_tilt(p["LEFT_SHOULDER"], p["RIGHT_SHOULDER"]) > tilt_max or _line_tilt(p["LEFT_HIP"], p["RIGHT_HIP"]) > tilt_max:
        return _check("level", False, "Keep your shoulders and hips level")
    shoulder_mid = _midpoint(p["LEFT_SHOULDER"], p["RIGHT_SHOULDER"])
    hip_mid = _midpoint(p["LEFT_HIP"], p["RIGHT_HIP"])
    lean = _angle_between((hip_mid[0] - shoulder_mid[0], hip_mid[1] - shoulder_mid[1]), (0.0, 1.0))
    if lean > rules["torso_lean_max_deg"]:
        return _check("level", False, "Stand up straight")
    return _check("level", True)


def _check_pose(p, rules):
    for side in ("LEFT", "RIGHT"):
        elbow = _joint_angle(p[f"{side}_SHOULDER"], p[f"{side}_ELBOW"], p[f"{side}_WRIST"])
        if elbow < rules["elbow_angle_min_deg"]:
            return _check("pose", False, "Straighten your arms")

    for side in ("LEFT", "RIGHT"):
        shoulder, wrist = p[f"{side}_SHOULDER"], p[f"{side}_WRIST"]
        abduction = _angle_between((wrist[0] - shoulder[0], wrist[1] - shoulder[1]), (0.0, 1.0))
        if abduction < rules["arm_abduction_min_deg"]:
            return _check("pose", False, "Move your arms slightly away from your body")
        if abduction > rules["arm_abduction_max_deg"]:
            return _check("pose", False, "Lower your arms a little")

    for side in ("LEFT", "RIGHT"):
        knee = _joint_angle(p[f"{side}_HIP"], p[f"{side}_KNEE"], p[f"{side}_ANKLE"])
        if knee < rules["knee_angle_min_deg"]:
            return _check("pose", False, "Straighten your legs")

    hip_width = _distance(p["LEFT_HIP"], p["RIGHT_HIP"])
    feet_ratio = _distance(p["LEFT_ANKLE"], p["RIGHT_ANKLE"]) / hip_width if hip_width else 0.0
    if feet_ratio < rules["feet_hip_ratio_min"]:
        return _check("pose", False, "Stand with your feet hip-width apart")
    if feet_ratio > rules["feet_hip_ratio_max"]:
        return _check("pose", False, "Bring your feet a little closer together")
    return _check("pose", True)


def validate_pose(landmarks, image_width, image_height, brightness=None, rules=POSE_RULES):
    """landmarks: {NAME: {x, y, z, visibility}} normalised to [0, 1].

    Returns {"ok": bool, "checks": [{"id", "passed", "message"}]} in CHECK_ORDER;
    checks that can't be evaluated because body landmarks are missing are
    reported as failed with "skipped": True.
    """
    aspect = image_width / image_height
    checks = []
    if brightness is not None:
        checks.append(_check_lighting(brightness, rules))

    visibility = _check_visibility(landmarks, rules)
    checks.append(visibility)

    if visibility["passed"]:
        p = {name: _point(lm, aspect) for name, lm in landmarks.items()}
        extent = _body_extent(landmarks, rules)
        checks += [
            _check_framing(extent, rules),
            _check_distance(extent, rules),
            _check_centered(landmarks, rules),
            _check_facing(landmarks, p, rules),
            _check_level(p, rules),
            _check_pose(p, rules),
        ]
    else:
        checks += [
            {"id": check_id, "passed": False, "message": SKIPPED_MESSAGE, "skipped": True}
            for check_id in CHECK_ORDER
            if check_id not in ("lighting", "visibility")
        ]

    return {"ok": all(check["passed"] for check in checks), "checks": checks}


def failed_checks(result):
    """Actionable failures only (skipped checks are implied by an earlier one)."""
    return [
        {"id": check["id"], "message": check["message"]}
        for check in result["checks"]
        if not check["passed"] and not check.get("skipped")
    ]


def assert_valid_pose(landmarks, image_width, image_height, brightness=None):
    result = validate_pose(landmarks, image_width, image_height, brightness)
    if not result["ok"]:
        raise PoseInvalidError(failed_checks(result))
    return result
