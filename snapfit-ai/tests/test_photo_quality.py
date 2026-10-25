import cv2
import numpy as np
import pytest

from app.config import (
    DIM_LIGHT_BRIGHTNESS,
    HIP_BREADTH_PER_HIP_JOINT_SPAN,
    POSE_RULES,
    SHOULDER_WIDTH_PER_JOINT_SPAN,
)
from app.photo_quality import TIP_MESSAGES, body_box, photo_tips, torso_box
from app.utils import mean_brightness

W, H = 768, 1024
PERSON_COLOUR = (70, 90, 120)
LIMBS = [
    ("LEFT_SHOULDER", "LEFT_ELBOW"),
    ("LEFT_ELBOW", "LEFT_WRIST"),
    ("RIGHT_SHOULDER", "RIGHT_ELBOW"),
    ("RIGHT_ELBOW", "RIGHT_WRIST"),
    ("LEFT_HIP", "LEFT_KNEE"),
    ("LEFT_KNEE", "LEFT_ANKLE"),
    ("RIGHT_HIP", "RIGHT_KNEE"),
    ("RIGHT_KNEE", "RIGHT_ANKLE"),
]


def _px(landmark):
    return int(landmark["x"] * W), int(landmark["y"] * H)


def _plain_wall(level=180):
    # A little sensor noise, as on a real plain wall.
    noise = np.random.default_rng(0).normal(0, 3, (H, W, 3))
    return np.clip(level + noise, 0, 255).astype(np.uint8)


def _busy_room():
    rng = np.random.default_rng(1)
    image = _plain_wall()
    for _ in range(800):
        x, y = int(rng.integers(0, W)), int(rng.integers(0, H))
        w, h = int(rng.integers(10, 80)), int(rng.integers(10, 80))
        cv2.rectangle(image, (x, y), (x + w, y + h), tuple(int(c) for c in rng.integers(0, 256, 3)), -1)
    return image


def _widened(landmarks, left, right, factor):
    (lx, ly), (rx, ry) = _px(landmarks[left]), _px(landmarks[right])
    mid, half = (lx + rx) / 2, (lx - rx) / 2 * factor
    return (int(mid + half), ly), (int(mid - half), ry)


def _draw_person(image, landmarks):
    """A stand-in figure in a flat clothing colour: head, limbs, and a torso
    outline wider than its joints, as on a real body."""
    shoulders = _widened(landmarks, "LEFT_SHOULDER", "RIGHT_SHOULDER", SHOULDER_WIDTH_PER_JOINT_SPAN)
    hips = _widened(landmarks, "LEFT_HIP", "RIGHT_HIP", HIP_BREADTH_PER_HIP_JOINT_SPAN)
    cv2.fillPoly(image, [np.array([shoulders[0], shoulders[1], hips[1], hips[0]])], PERSON_COLOUR)
    for start, end in LIMBS:
        cv2.line(image, _px(landmarks[start]), _px(landmarks[end]), PERSON_COLOUR, 30)
    cv2.circle(image, _px(landmarks["NOSE"]), 45, PERSON_COLOUR, -1)
    return image


def _ids(image, landmarks):
    return [tip["id"] for tip in photo_tips(image, landmarks)]


def _box_slices(box):
    x0, y0, x1, y1 = box
    return slice(y0, y1), slice(x0, x1)


def test_a_well_lit_photo_on_a_plain_wall_gets_no_tips(a_pose):
    lm = a_pose["landmarks"]
    assert photo_tips(_draw_person(_plain_wall(), lm), lm) == []


def test_tips_carry_their_messages(a_pose):
    lm = a_pose["landmarks"]
    dark = (_draw_person(_busy_room(), lm) * 0.3).astype(np.uint8)
    tips = photo_tips(dark, lm)
    assert tips and all(tip["message"] == TIP_MESSAGES[tip["id"]] for tip in tips)


class TestDimLight:
    def test_the_tip_threshold_sits_above_the_hard_gate(self):
        assert DIM_LIGHT_BRIGHTNESS > POSE_RULES["brightness_min"]

    def test_a_dim_photo_that_passes_the_gate_gets_a_tip(self, a_pose):
        lm = a_pose["landmarks"]
        dim = (_draw_person(_plain_wall(), lm) * 0.3).astype(np.uint8)
        assert POSE_RULES["brightness_min"] < mean_brightness(dim) < DIM_LIGHT_BRIGHTNESS
        assert _ids(dim, lm) == ["dim_light"]


class TestGlare:
    def test_a_blown_out_patch_on_the_body_gets_a_tip(self, a_pose):
        lm = a_pose["landmarks"]
        image = _draw_person(_plain_wall(), lm)
        rows, cols = _box_slices(torso_box(lm, W, H))
        image[rows.start : rows.start + (rows.stop - rows.start) // 3, cols] = 255
        assert _ids(image, lm) == ["glare"]

    def test_a_white_backdrop_around_the_body_is_not_glare(self, a_pose):
        lm = a_pose["landmarks"]
        image = _draw_person(np.full((H, W, 3), 255, np.uint8), lm)
        assert "glare" not in _ids(image, lm)


class TestClutteredBackground:
    def test_a_busy_background_gets_a_tip(self, a_pose):
        lm = a_pose["landmarks"]
        assert _ids(_draw_person(_busy_room(), lm), lm) == ["cluttered_background"]

    def test_a_door_frame_and_a_picture_are_not_clutter(self, a_pose):
        lm = a_pose["landmarks"]
        image = _plain_wall()
        cv2.rectangle(image, (20, 150), (100, H), (120, 110, 100), 6)
        cv2.rectangle(image, (660, 200), (740, 300), (60, 60, 60), 4)
        assert _ids(_draw_person(image, lm), lm) == []

    def test_patterned_clothing_is_not_clutter(self, a_pose):
        lm = a_pose["landmarks"]
        image = _plain_wall()
        rows, cols = _box_slices(body_box(lm, W, H))
        image[rows, cols] = _busy_room()[rows, cols]
        assert _ids(image, lm) == []

    def test_no_judgement_when_the_body_fills_the_frame(self, a_pose):
        corners = {
            "LEFT_SHOULDER": {"x": 0.02, "y": 0.02, "visibility": 1.0},
            "RIGHT_HIP": {"x": 0.98, "y": 0.98, "visibility": 1.0},
        }
        assert _ids(_busy_room(), corners) == []


@pytest.mark.parametrize("visibility", [0.0, None])
def test_invisible_landmarks_give_no_boxes(a_pose, visibility):
    lm = a_pose["landmarks"]
    for point in lm.values():
        point["visibility"] = visibility
    assert body_box(lm, W, H) is None and torso_box(lm, W, H) is None
    assert _ids(_draw_person(_busy_room(), a_pose["landmarks"]), lm) == []
