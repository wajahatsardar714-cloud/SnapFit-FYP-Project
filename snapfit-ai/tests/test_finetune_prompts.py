"""Generation specs for the SegFormer fine-tuning notebook
(snapfit-ai/gpu/finetune/prompts.py)."""

import importlib.util
import json
import os
from collections import Counter

import pytest

FINETUNE_DIR = os.path.join(os.path.dirname(__file__), os.pardir, "gpu", "finetune")


def _load(name):
    spec = importlib.util.spec_from_file_location(f"finetune_{name}", os.path.join(FINETUNE_DIR, name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


prompts = _load("prompts")
SPECS = prompts.build_specs(1200, seed=1234)


def test_count_and_unique_ids_and_seeds():
    assert len(SPECS) == 1200
    assert len({s["id"] for s in SPECS}) == 1200
    assert len({s["seed"] for s in SPECS}) == 1200


def test_same_seed_same_list_and_other_seed_differs():
    assert prompts.build_specs(1200, seed=1234) == SPECS
    assert prompts.build_specs(1200, seed=99) != SPECS


def test_group_shares_are_exact():
    counts = Counter((s["top"], s["gender"]) for s in SPECS)
    for top, gender, share in prompts.GROUPS:
        assert abs(counts[(top, gender)] - share * 1200) <= 1


@pytest.mark.parametrize("total", [1, 7, 150, 1001])
def test_any_total_adds_up(total):
    assert len(prompts.build_specs(total)) == total


def test_garment_balance():
    tops = Counter(s["top"] for s in SPECS)
    long_share = (tops["kameez"] + tops["kurta"]) / len(SPECS)
    assert 0.6 <= long_share <= 0.7
    assert tops["shirt"] == tops["tshirt"]
    genders = Counter(s["gender"] for s in SPECS)
    assert abs(genders["man"] - genders["woman"]) / len(SPECS) < 0.1


def test_bottoms_match_the_top():
    for spec in SPECS:
        assert spec["bottom"] in prompts.BOTTOMS[spec["top"]]
    assert all(s["bottom"] == "shalwar" for s in SPECS if s["top"] == "kameez")


def test_dupatta_only_for_women_in_kameez_or_kurta():
    for spec in SPECS:
        if spec["dupatta"]:
            assert spec["gender"] == "woman" and spec["top"] in ("kameez", "kurta")
    women_kameez = [s for s in SPECS if s["top"] == "kameez" and s["gender"] == "woman"]
    share = sum(s["dupatta"] for s in women_kameez) / len(women_kameez)
    assert abs(share - prompts.DUPATTA_SHARE["kameez"]) < 0.02


def test_every_spec_has_expected_labels():
    for spec in SPECS:
        expected = spec["expected"]
        assert expected["top"] == 4
        assert expected["bottom"] == 6
        if spec["dupatta"]:
            assert expected["dupatta"] == 17 and 17 in expected["required"]
        else:
            assert expected["dupatta"] is None and 17 not in expected["required"]
        assert {4, 6} <= set(expected["required"])
        assert spec["long_top"] == (spec["top"] in ("kameez", "kurta"))
        if spec["long_top"]:
            assert spec["min_hem"] is not None
        else:
            assert spec["max_hem"] is not None


def test_prompts_mention_the_outfit_and_fit_clip():
    words = {"kameez": "kameez", "kurta": "kurta", "shirt": "shirt", "tshirt": "t-shirt"}
    for spec in SPECS:
        text = spec["prompt"]
        assert text.startswith("full body photo of ")
        assert words[spec["top"]] in text
        assert spec["bottom"] in text
        assert ("dupatta" in text) == spec["dupatta"]
        assert "head to toe" in text and "front view" in text
        assert prompts.approx_token_count(text) <= 75
        assert "two people" in spec["negative_prompt"] and "nude" in spec["negative_prompt"]
        assert " a a" not in text and " a e" not in text and " a o" not in text


def test_splits():
    splits = Counter(s["split"] for s in SPECS)
    assert splits["test"] >= 150
    assert splits["val"] >= 60
    assert splits["train"] == 1200 - splits["test"] - splits["val"]
    # The test set has a fair share of long tops.
    test = [s for s in SPECS if s["split"] == "test"]
    assert sum(s["long_top"] for s in test) / len(test) > 0.5


def test_first_part_is_still_mixed():
    first = SPECS[:200]
    tops = Counter(s["top"] for s in first)
    assert len(tops) == 4 and min(tops.values()) >= 20


def test_specs_are_json_serialisable_and_summary():
    json.dumps(SPECS)
    table = prompts.summary(SPECS)
    assert sum(table["top"].values()) == 1200
