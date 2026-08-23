import os

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python import vision

MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "pose_landmarker_heavy.task")

KEY_LANDMARKS = {
    "NOSE": 0,
    "LEFT_SHOULDER": 11,
    "RIGHT_SHOULDER": 12,
    "LEFT_ELBOW": 13,
    "RIGHT_ELBOW": 14,
    "LEFT_WRIST": 15,
    "RIGHT_WRIST": 16,
    "LEFT_HIP": 23,
    "RIGHT_HIP": 24,
    "LEFT_KNEE": 25,
    "RIGHT_KNEE": 26,
    "LEFT_ANKLE": 27,
    "RIGHT_ANKLE": 28,
}

LANDMARK_NAMES = {lm.value: lm.name for lm in vision.PoseLandmark}


class PoseEstimationError(Exception):
    pass


def _make_landmarker():
    options = vision.PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=vision.RunningMode.IMAGE,
        num_poses=1,
        min_pose_detection_confidence=0.5,
    )
    return vision.PoseLandmarker.create_from_options(options)


def extract_landmarks(image_bytes):
    image_array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)

    if image is None:
        raise PoseEstimationError("INVALID_IMAGE")

    height, width = image.shape[:2]
    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=image_rgb)

    with _make_landmarker() as landmarker:
        result = landmarker.detect(mp_image)

    if not result.pose_landmarks:
        raise PoseEstimationError("NO_BODY_DETECTED")

    pose = result.pose_landmarks[0]

    landmarks = {
        LANDMARK_NAMES[i]: {
            "x": landmark.x,
            "y": landmark.y,
            "z": landmark.z,
            "visibility": landmark.visibility,
        }
        for i, landmark in enumerate(pose)
    }

    key_landmarks = {name: landmarks[name] for name in KEY_LANDMARKS}

    return {
        "landmarks": landmarks,
        "key_landmarks": key_landmarks,
        "image_dimensions": {"height": height, "width": width},
    }
