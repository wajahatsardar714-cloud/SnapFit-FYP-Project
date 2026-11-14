"""Automatic label correction, quality check and training target for the
SegFormer fine-tuning notebook (snapfit-ai/gpu/finetune/labels.py)."""

import importlib.util
import os

import numpy as np
import pytest

FINETUNE_DIR = os.path.join(os.path.dirname(__file__), os.pardir, "gpu", "finetune")


def _load(name):
    spec = importlib.util.spec_from_file_location(f"finetune_{name}", os.path.join(FINETUNE_DIR, name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


labels = _load("labels")
prompts = _load("prompts")

H, W = 400, 200
TOP_ROWS = (40, 380)  # person from the hair down to the shoes


def _spec(top="kameez", dupatta=False, bottom="shalwar"):
    return {
        "top": top,
        "long_top": top in prompts.LONG_TOPS,
        "sleeves": "short" if top == "tshirt" else "full",
        "bottom": bottom,
        "dupatta": dupatta,
        "min_hem": prompts.MIN_HEM.get(top),
        "max_hem": prompts.MAX_HEM.get(top),
    }


def _person(hem=280, top_label=4, arms_from=90, arms_to=230):
    """A standing person in a 400x200 label map: hair, face, a top from row
    85 to `hem`, arms beside it, two legs of pants below and shoes."""
    m = np.zeros((H, W), np.uint8)
    m[40:50, 85:116] = 2  # hair
    m[50:81, 88:113] = 11  # face
    m[81:85, 92:109] = 11  # neck (skin, counted as face here)
    m[85:hem + 1, 70:131] = top_label
    m[arms_from:arms_to + 1, 55:70] = 14
    m[arms_from:arms_to + 1, 131:146] = 15
    m[hem + 1:366, 75:98] = 6  # left leg of the pants
    m[hem + 1:366, 103:126] = 6  # right leg
    m[366:381, 75:98] = 9
    m[366:381, 103:126] = 10
    return m


def _kameez_split():
    """A kameez the parser split into 4 (chest), 5 (skirt) and 7 (dress)."""
    m = _person(hem=280)
    m[181:231, 70:131] = 5
    m[231:281, 70:131] = 7
    return m


# ---------------------------------------------------------------- correction

def test_kameez_split_into_upper_skirt_dress_becomes_one_top():
    raw = _kameez_split()
    fixed, info = labels.correct_labels(raw, _spec("kameez"))
    assert info["hem_source"] == "pants"
    assert info["hem_row"] == 281
    assert np.all(fixed[85:281, 70:131] == 4)
    assert not np.isin(fixed, (5, 7)).any()
    # The real pants stay pants.
    assert np.all(fixed[281:366, 75:98] == 6)


def test_face_hair_arms_and_shoes_are_never_changed():
    raw = _kameez_split()
    fixed, _ = labels.correct_labels(raw, _spec("kameez"))
    for label in (2, 11, 14, 15, 9, 10):
        assert np.array_equal(fixed == label, raw == label), label


def test_shalwar_called_skirt_below_the_hem_becomes_pants():
    raw = _person(hem=280)
    raw[281:321][raw[281:321] == 6] = 5  # upper part of both shalwar legs labelled "skirt"
    fixed, info = labels.correct_labels(raw, _spec("kameez"))
    # The two legs mark the hem even though the pants share starts lower.
    assert info["hem_row"] == 281
    assert np.all(fixed[281:366, 75:98] == 6)
    assert np.all(fixed[281:366, 103:126] == 6)
    assert np.all(fixed[85:281, 70:131] == 4)


def test_dress_below_the_hem_becomes_pants():
    raw = _person(hem=200, top_label=4)
    raw[300:366][raw[300:366] == 6] = 7
    fixed, _ = labels.correct_labels(raw, _spec("shirt", bottom="trousers"))
    assert not np.isin(fixed, (5, 7)).any()
    assert np.all(fixed[300:366, 75:98] == 6)


def test_scarf_without_dupatta_becomes_upper_clothes():
    raw = _person(hem=280)
    raw[90:200, 95:106] = 17
    fixed, _ = labels.correct_labels(raw, _spec("kameez", dupatta=False))
    assert not (fixed == 17).any()
    assert np.all(fixed[90:200, 95:106] == 4)


def test_scarf_is_kept_when_the_spec_has_a_dupatta():
    raw = _person(hem=280)
    raw[90:200, 95:106] = 17
    fixed, _ = labels.correct_labels(raw, _spec("kameez", dupatta=True))
    assert np.all(fixed[90:200, 95:106] == 17)


def test_skirt_blob_not_touching_the_top_above_the_hem_is_ignored():
    raw = _person(hem=280)
    raw[150:170, 5:20] = 5  # a separate blob beside the person
    fixed, _ = labels.correct_labels(raw, _spec("kameez"))
    assert np.all(fixed[150:170, 5:20] == labels.IGNORE)


def test_no_pants_and_no_legs_means_the_hem_is_guessed():
    raw = _person(hem=280)
    raw[281:366, 75:126] = 5  # one solid "skirt" block down to the shoes
    _, info = labels.correct_labels(raw, _spec("kameez"))
    assert info["hem_source"] == "guess"


def test_empty_map_is_returned_unchanged():
    raw = np.zeros((10, 10), np.uint8)
    fixed, info = labels.correct_labels(raw, _spec())
    assert np.array_equal(fixed, raw)
    assert info["hem_source"] == "none"


def test_two_legs_ignores_a_thin_strip_beside_the_body():
    row = np.zeros(100, bool)
    row[20:60] = True
    row[64:67] = True  # dupatta end
    assert not labels._two_legs(row, 2)
    row[64:90] = True  # a real second leg
    assert labels._two_legs(row, 2)


# ------------------------------------------------------------ quality check

def _confident(m):
    return np.ones(m.shape, np.float32)


def test_good_kameez_passes():
    fixed, info = labels.correct_labels(_kameez_split(), _spec("kameez"))
    result = labels.quality_check(fixed, _spec("kameez"), _confident(fixed), info)
    assert result["ok"], result


def test_short_kameez_is_rejected():
    raw = _person(hem=170)  # ends near the waist: (170-40)/341 = 0.38
    fixed, info = labels.correct_labels(raw, _spec("kameez"))
    result = labels.quality_check(fixed, _spec("kameez"), _confident(fixed), info)
    assert "top_too_short" in result["reasons"]


def test_long_shirt_is_rejected_for_a_short_top_spec():
    fixed, info = labels.correct_labels(_person(hem=280), _spec("shirt", bottom="jeans"))
    result = labels.quality_check(fixed, _spec("shirt", bottom="jeans"), _confident(fixed), info)
    assert "top_too_long" in result["reasons"]


def test_good_shirt_passes():
    spec = _spec("shirt", bottom="jeans")
    fixed, info = labels.correct_labels(_person(hem=200), spec)
    result = labels.quality_check(fixed, spec, _confident(fixed), info)
    assert result["ok"], result


def test_second_person_is_rejected():
    m = _person(hem=280)
    m[100:300, 160:195] = 4  # another body at the side
    m[80:100, 170:185] = 11
    result = labels.quality_check(m, _spec("kameez"), _confident(m))
    assert "several_people" in result["reasons"]
    assert "several_faces" in result["reasons"]


def test_missing_face_is_rejected():
    m = _person(hem=280)
    m[m == 11] = 2
    assert "no_face" in labels.quality_check(m, _spec("kameez"))["reasons"]


def test_half_body_is_rejected():
    m = _person(hem=280)
    m[200:] = 0
    reasons = labels.quality_check(m, _spec("kameez"))["reasons"]
    assert "not_full_body" in reasons


def test_low_confidence_is_rejected_and_relaxed_is_more_lenient():
    fixed, info = labels.correct_labels(_kameez_split(), _spec("kameez"))
    prob = np.full(fixed.shape, 0.7, np.float32)
    assert "low_confidence" in labels.quality_check(fixed, _spec("kameez"), prob, info)["reasons"]
    assert "low_confidence" not in labels.quality_check(fixed, _spec("kameez"), prob, info, relaxed=True)["reasons"]


def test_missing_dupatta_is_rejected_only_in_strict_mode():
    spec = _spec("kameez", dupatta=True)
    fixed, info = labels.correct_labels(_person(hem=280), spec)
    assert "missing_dupatta" in labels.quality_check(fixed, spec, _confident(fixed), info)["reasons"]
    assert labels.quality_check(fixed, spec, _confident(fixed), info, relaxed=True)["ok"]


def test_dupatta_present_passes():
    spec = _spec("kameez", dupatta=True)
    raw = _person(hem=280)
    raw[90:260, 95:106] = 17
    fixed, info = labels.correct_labels(raw, spec)
    assert labels.quality_check(fixed, spec, _confident(fixed), info)["ok"]


def test_garment_over_the_head_is_rejected():
    m = _person(hem=200)
    m[40:50, 85:116] = 4  # the "top" covers the hair area
    assert "garment_on_head" in labels.quality_check(m, _spec("shirt", bottom="jeans"))["reasons"]


def test_tshirt_without_bare_arms_is_rejected():
    spec = _spec("tshirt", bottom="jeans")
    m = _person(hem=200)
    m[np.isin(m, (14, 15))] = 4  # the arms were labelled as the shirt
    assert "no_bare_arms" in labels.quality_check(m, spec)["reasons"]


def test_guessed_hem_is_rejected():
    raw = _person(hem=280)
    raw[281:366, 75:126] = 5
    fixed, info = labels.correct_labels(raw, _spec("kameez"))
    assert "hem_unclear" in labels.quality_check(fixed, _spec("kameez"), _confident(fixed), info)["reasons"]


def test_no_person():
    assert labels.quality_check(np.zeros((50, 50), np.uint8), _spec())["reasons"] == ["no_person"]


# ---------------------------------------------------------- training target

def test_training_target_ignores_unsure_pixels():
    m = _person(hem=280)
    confidence = np.ones(m.shape, np.float32)
    garment = np.ones(m.shape, np.float32)
    garment[100:110, 70:131] = 0.3  # unsure about part of the top
    confidence[60:70, 88:113] = 0.2  # unsure about part of the face
    target = labels.training_target(m, confidence, garment)
    assert np.all(target[100:110, 70:131] == labels.IGNORE)
    assert np.all(target[60:70, 88:113] == labels.IGNORE)
    assert np.all(target[200:210, 70:131] == 4)
    assert target.dtype == np.uint8


# ---------------------------------------------------------------- SAM merge

def test_sam_grows_the_top_into_nearby_background_only():
    m = _person(hem=280)
    sam = (m == 4).copy()
    sam[85:281, 68:70] = True  # arm pixels (rows 90-230) and background next to the top
    sam[282:285, 70:131] = True  # just below the hem, over the pants and the gap
    refined, used = labels.refine_with_sam(m, sam)
    assert used
    # Background in the gap between the legs becomes top; pants and arms stay.
    assert np.all(refined[282:285, 98:103] == 4)
    assert np.all(refined[282:285, 75:98] == 6)
    assert np.all(refined[90:231, 68:70] == 14)


def test_sam_is_not_used_when_it_disagrees():
    m = _person(hem=280)
    sam = np.zeros(m.shape, bool)
    sam[0:100, 0:200] = True
    refined, used = labels.refine_with_sam(m, sam)
    assert not used
    assert np.array_equal(refined, m)


def test_top_box():
    m = _person(hem=280)
    assert labels.top_box(m) == (70, 85, 130, 280)
    assert labels.top_box(np.zeros((5, 5), np.uint8)) is None


@pytest.mark.parametrize("top", ["kameez", "kurta", "shirt", "tshirt"])
def test_every_prompt_spec_works_with_the_correction(top):
    spec = next(s for s in prompts.build_specs(200) if s["top"] == top)
    fixed, info = labels.correct_labels(_kameez_split(), spec)
    assert fixed.shape == (H, W)
    labels.quality_check(fixed, spec, _confident(fixed), info)
