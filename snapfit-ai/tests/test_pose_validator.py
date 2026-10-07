import pytest

from app.pose_validator import PoseInvalidError, assert_valid_pose, failed_checks, validate_pose

GOOD_BRIGHTNESS = 120


def _validate(pose, brightness=GOOD_BRIGHTNESS):
    return validate_pose(pose["landmarks"], pose["image_width"], pose["image_height"], brightness)


def _failed_ids(result):
    return [check["id"] for check in failed_checks(result)]


def _set_side(landmarks, base, **values):
    for side in ("LEFT", "RIGHT"):
        landmarks[f"{side}_{base}"].update(values)


def _scale_about(landmarks, factor, cx=0.5, cy=0.52):
    for point in landmarks.values():
        point["x"] = cx + (point["x"] - cx) * factor
        point["y"] = cy + (point["y"] - cy) * factor


def test_correct_a_pose_passes(a_pose):
    result = _validate(a_pose)
    assert result["ok"] is True
    assert [check["id"] for check in result["checks"]] == [
        "lighting", "visibility", "framing", "distance", "centered", "facing", "level", "pose",
    ]


def test_brightness_is_optional(a_pose):
    result = validate_pose(a_pose["landmarks"], 768, 1024)
    assert result["ok"] is True
    assert "lighting" not in [check["id"] for check in result["checks"]]


def test_cropped_feet_fail_visibility(a_pose):
    for name in ("LEFT_ANKLE", "RIGHT_ANKLE", "LEFT_HEEL", "RIGHT_HEEL"):
        a_pose["landmarks"][name]["visibility"] = 0.1
    result = _validate(a_pose)
    assert _failed_ids(result) == ["visibility"]
    assert "feet" in failed_checks(result)[0]["message"]
    assert all(check.get("skipped") for check in result["checks"][2:])


def test_hidden_arms_ask_to_show_arms(a_pose):
    _set_side(a_pose["landmarks"], "WRIST", visibility=0.05)
    assert failed_checks(_validate(a_pose))[0]["message"].startswith("Keep both arms in view")


def test_side_on_fails_facing(a_pose):
    landmarks = a_pose["landmarks"]
    landmarks["LEFT_SHOULDER"].update(x=0.52, z=-0.15)
    landmarks["RIGHT_SHOULDER"].update(x=0.48, z=0.15)
    landmarks["LEFT_HIP"].update(x=0.51)
    landmarks["RIGHT_HIP"].update(x=0.49)
    assert "facing" in _failed_ids(_validate(a_pose))


def test_arms_down_by_sides_fail_pose(a_pose):
    landmarks = a_pose["landmarks"]
    for side, x in (("LEFT", 0.615), ("RIGHT", 0.385)):
        landmarks[f"{side}_ELBOW"].update(x=x)
        landmarks[f"{side}_WRIST"].update(x=x)
    result = _validate(a_pose)
    assert _failed_ids(result) == ["pose"]
    assert failed_checks(result)[0]["message"] == "Move your arms slightly away from your body"


def test_arms_raised_too_high_fail_pose(a_pose):
    landmarks = a_pose["landmarks"]
    for side, sign in (("LEFT", 1), ("RIGHT", -1)):
        landmarks[f"{side}_ELBOW"].update(x=0.5 + sign * 0.31, y=0.24)
        landmarks[f"{side}_WRIST"].update(x=0.5 + sign * 0.45, y=0.22)
    assert failed_checks(_validate(a_pose))[0]["message"] == "Lower your arms a little"


def test_bent_knees_fail_pose(a_pose):
    a_pose["landmarks"]["LEFT_KNEE"]["x"] = 0.64
    a_pose["landmarks"]["RIGHT_KNEE"]["x"] = 0.36
    assert failed_checks(_validate(a_pose))[0]["message"] == "Straighten your legs"


def test_feet_together_fail_pose(a_pose):
    landmarks = a_pose["landmarks"]
    for side, foot_x in (("LEFT", 0.52), ("RIGHT", 0.48)):
        for part in ("ANKLE", "HEEL", "FOOT_INDEX"):
            landmarks[f"{side}_{part}"]["x"] = foot_x
        # keep the leg straight: knee on the hip -> ankle line
        landmarks[f"{side}_KNEE"]["x"] = (landmarks[f"{side}_HIP"]["x"] + foot_x) / 2
    assert failed_checks(_validate(a_pose))[-1]["message"] == "Stand with your feet hip-width apart"


def test_tilted_shoulders_fail_level(a_pose):
    a_pose["landmarks"]["LEFT_SHOULDER"]["y"] = 0.275
    a_pose["landmarks"]["RIGHT_SHOULDER"]["y"] = 0.235
    assert "level" in _failed_ids(_validate(a_pose))


def test_too_close_fails_distance(a_pose):
    _scale_about(a_pose["landmarks"], 1.15)
    result = _validate(a_pose)
    assert _failed_ids(result) == ["distance"]
    assert failed_checks(result)[0]["message"] == "Step back a little"


def test_too_far_fails_distance(a_pose):
    _scale_about(a_pose["landmarks"], 0.7)
    result = _validate(a_pose)
    assert _failed_ids(result) == ["distance"]
    assert failed_checks(result)[0]["message"] == "Move closer to the camera"


def test_off_centre_fails_centered(a_pose):
    for point in a_pose["landmarks"].values():
        point["x"] += 0.15
    assert _failed_ids(_validate(a_pose)) == ["centered"]


def test_head_cut_off_fails_framing(a_pose):
    for point in a_pose["landmarks"].values():
        point["y"] -= 0.12
    assert _failed_ids(_validate(a_pose))[0] == "framing"


@pytest.mark.parametrize("brightness, word", [(15, "dark"), (250, "bright")])
def test_bad_lighting_fails(a_pose, brightness, word):
    result = _validate(a_pose, brightness)
    assert _failed_ids(result) == ["lighting"]
    assert word in failed_checks(result)[0]["message"]


def test_assert_valid_pose_raises_with_failed_checks(a_pose):
    _scale_about(a_pose["landmarks"], 0.7)
    with pytest.raises(PoseInvalidError) as excinfo:
        assert_valid_pose(a_pose["landmarks"], 768, 1024, GOOD_BRIGHTNESS)
    assert excinfo.value.failed_checks == [{"id": "distance", "message": "Move closer to the camera"}]


def test_mirrored_photo_is_still_valid(a_pose):
    # A mirrored selfie swaps which side LEFT_*/RIGHT_* land on -- the rules must
    # not depend on that.
    for point in a_pose["landmarks"].values():
        point["x"] = 1 - point["x"]
    assert _validate(a_pose)["ok"] is True
