import math


def euclidean_distance(p1, p2):
    return math.hypot(p1["x"] - p2["x"], p1["y"] - p2["y"])


def midpoint(p1, p2):
    return {"x": (p1["x"] + p2["x"]) / 2, "y": (p1["y"] + p2["y"]) / 2}


def _to_px(landmark, image_width, image_height):
    return {"x": landmark["x"] * image_width, "y": landmark["y"] * image_height}


def calculate_features(landmarks, image_height, image_width, user_height_cm=None):
    px = {
        name: _to_px(lm, image_width, image_height)
        for name, lm in landmarks.items()
    }

    shoulder_mid = midpoint(px["LEFT_SHOULDER"], px["RIGHT_SHOULDER"])
    hip_mid = midpoint(px["LEFT_HIP"], px["RIGHT_HIP"])
    ankle_mid = midpoint(px["LEFT_ANKLE"], px["RIGHT_ANKLE"])

    body_height_px = euclidean_distance(shoulder_mid, ankle_mid)

    shoulder_width_px = euclidean_distance(px["LEFT_SHOULDER"], px["RIGHT_SHOULDER"])
    hip_width_px = euclidean_distance(px["LEFT_HIP"], px["RIGHT_HIP"])
    torso_length_px = euclidean_distance(shoulder_mid, hip_mid)
    leg_length_px = euclidean_distance(hip_mid, ankle_mid)

    left_arm_px = euclidean_distance(px["LEFT_SHOULDER"], px["LEFT_ELBOW"]) + euclidean_distance(
        px["LEFT_ELBOW"], px["LEFT_WRIST"]
    )
    right_arm_px = euclidean_distance(px["RIGHT_SHOULDER"], px["RIGHT_ELBOW"]) + euclidean_distance(
        px["RIGHT_ELBOW"], px["RIGHT_WRIST"]
    )
    arm_length_px = (left_arm_px + right_arm_px) / 2

    shoulder_width_ratio = shoulder_width_px / body_height_px
    hip_width_ratio = hip_width_px / body_height_px
    torso_length_ratio = torso_length_px / body_height_px
    leg_length_ratio = leg_length_px / body_height_px
    shoulder_to_hip_ratio = shoulder_width_px / hip_width_px
    arm_length_ratio = arm_length_px / body_height_px
    chest_width_estimate_ratio = shoulder_width_ratio * 0.9

    ratios = {
        "shoulder_width_ratio": shoulder_width_ratio,
        "hip_width_ratio": hip_width_ratio,
        "torso_length_ratio": torso_length_ratio,
        "leg_length_ratio": leg_length_ratio,
        "shoulder_to_hip_ratio": shoulder_to_hip_ratio,
        "arm_length_ratio": arm_length_ratio,
        "chest_width_estimate_ratio": chest_width_estimate_ratio,
    }

    estimated_cm = None
    if user_height_cm is not None:
        pixel_to_cm_ratio = user_height_cm / body_height_px
        estimated_cm = {
            "shoulder_width_cm": shoulder_width_px * pixel_to_cm_ratio,
            "hip_width_cm": hip_width_px * pixel_to_cm_ratio,
            "chest_cm": shoulder_width_px * 0.9 * pixel_to_cm_ratio,
            "torso_length_cm": torso_length_px * pixel_to_cm_ratio,
            "inseam_cm": leg_length_px * pixel_to_cm_ratio,
        }

    return {
        "ratios": ratios,
        "estimated_cm": estimated_cm,
        "body_height_px": body_height_px,
    }
