import math

import pytest

from app.measurement_engine import ellipse_circumference, estimate_measurements
from app.size_matcher import (
    HEIGHT_HINT,
    SizeMatchError,
    category_weights,
    compare_sizes,
    distance_to_range,
    range_status,
    recommend_size,
)

FEATURES = {"ratios": {"shoulder_to_hip_ratio": 1.4, "shoulder_width_ratio": 0.25, "torso_length_ratio": 0.35}}


def m(**values):
    return {name: {"value": value, "unit": "cm", "estimated": name in ("chest", "waist", "hip")} for name, value in values.items()}


def chart(sizes, unit="cm", category="tops"):
    return {
        "unit": unit,
        "category": category,
        "sizes": [
            {"label": label, "measurements": {name: {"min": lo, "max": hi} for name, (lo, hi) in ranges.items()}}
            for label, ranges in sizes
        ],
    }


TEES = chart(
    [
        ("S", {"chest": (86, 94), "shoulderWidth": (40, 43)}),
        ("M", {"chest": (94, 102), "shoulderWidth": (43, 46)}),
        ("L", {"chest": (102, 110), "shoulderWidth": (46, 49)}),
    ]
)


class TestRangeMaths:
    @pytest.mark.parametrize(
        "value, expected_distance, expected_status",
        [(90, 0, "within"), (94, 0, "within"), (98, 0, "within"), (85, 5, "below"), (101.5, 3.5, "above")],
    )
    def test_distance_and_status(self, value, expected_distance, expected_status):
        cm_range = {"min": 90, "max": 98}
        assert distance_to_range(value, cm_range) == pytest.approx(expected_distance)
        assert range_status(value, cm_range) == expected_status

    def test_inch_charts_are_compared_in_cm(self):
        inch_chart = chart([("M", {"chest": (37, 40)})], unit="inches")
        [size] = compare_sizes(m(chest=98), inch_chart)
        assert size["perMeasurement"][0] == {"name": "chest", "userValue": 98, "min": 94.0, "max": 101.6, "status": "within"}
        assert size["score"] == 1


class TestNearestSize:
    def test_picks_the_size_that_contains_the_measurements(self):
        result = recommend_size(FEATURES, TEES, m(chest=97, shoulderWidth=44))
        assert result["recommended_size"] == "M"
        assert result["confidence"] == 1

    def test_between_sizes_picks_the_nearer_one(self):
        gapped = chart([("M", {"chest": (94, 100)}), ("L", {"chest": (106, 112)})])
        assert recommend_size(FEATURES, gapped, m(chest=104.5))["recommended_size"] == "L"
        assert recommend_size(FEATURES, gapped, m(chest=101))["recommended_size"] == "M"

    def test_below_the_smallest_size_returns_the_smallest(self):
        result = recommend_size(FEATURES, TEES, m(chest=70, shoulderWidth=34))
        assert result["recommended_size"] == "S"
        assert result["alternative_size"] == "M"
        assert result["confidence"] == 0
        assert {e["status"] for e in result["size_comparison"][0]["perMeasurement"]} == {"below"}
        assert "S may feel loose" in result["fit_notes"][0]

    def test_above_the_largest_size_returns_the_largest(self):
        result = recommend_size(FEATURES, TEES, m(chest=130, shoulderWidth=55))
        assert result["recommended_size"] == "L"
        assert "L may feel tight" in result["fit_notes"][0]

    def test_near_tie_prefers_the_looser_size(self):
        result = recommend_size(FEATURES, TEES, m(chest=102.5, shoulderWidth=46))
        assert result["recommended_size"] == "L"
        assert result["alternative_size"] == "M"

    def test_near_top_of_range_suggests_next_size(self):
        result = recommend_size(FEATURES, TEES, m(chest=101.5, shoulderWidth=44))
        assert result["recommended_size"] == "M"
        assert result["fit_notes"] == ["Chest is near the top of M; consider L for a looser fit."]


class TestCategoryWeighting:
    MIXED = [
        ("M", {"chest": (94, 102), "inseam": (76, 80)}),
        ("L", {"chest": (102, 110), "inseam": (80, 84)}),
    ]
    USER = m(chest=97, inseam=82)

    def test_tops_follow_the_chest(self):
        assert recommend_size(FEATURES, chart(self.MIXED, category="tops"), self.USER)["recommended_size"] == "M"

    def test_bottoms_follow_the_inseam(self):
        assert recommend_size(FEATURES, chart(self.MIXED, category="bottoms"), self.USER)["recommended_size"] == "L"

    def test_weights_renormalise_over_compared_measurements(self):
        assert category_weights("bottoms", ["waist", "inseam"]) == pytest.approx({"waist": 0.4 / 0.6, "inseam": 0.2 / 0.6})
        assert category_weights("footwear", ["chest", "hip"]) == {"chest": 0.5, "hip": 0.5}
        assert category_weights("tops", ["inseam"]) == {"inseam": 1.0}


class TestRatioMode:
    RATIO_CHART = chart(
        [
            ("S", {"shoulderWidth": (40, 43), "hip": (28, 31), "torsoLength": (50, 54), "inseam": (76, 80)}),
            ("M", {"shoulderWidth": (43, 46), "hip": (31, 34), "torsoLength": (54, 58), "inseam": (80, 84)}),
        ]
    )

    def test_without_height_uses_proportions_and_asks_for_height(self):
        result = recommend_size(FEATURES, self.RATIO_CHART, measurements={})
        assert result["recommended_size"] in ("S", "M")
        assert result["fit_notes"] == [HEIGHT_HINT]
        assert all(size["perMeasurement"] == [] for size in result["size_comparison"])
        assert result["confidence"] <= 0.7

    def test_chart_without_comparable_fields_raises(self):
        with pytest.raises(SizeMatchError, match="NO_COMPARABLE_MEASUREMENTS"):
            recommend_size(FEATURES, chart([("M", {"waist": (80, 84)})]), m(chest=97))

    def test_empty_chart_raises(self):
        with pytest.raises(SizeMatchError, match="EMPTY_SIZE_CHART"):
            recommend_size(FEATURES, {"sizes": []}, m(chest=97))


class TestMeasurementEngine:
    def test_ellipse_circumference_matches_a_circle(self):
        assert ellipse_circumference(10, 10) == pytest.approx(math.pi * 10)

    def test_no_height_gives_no_measurements(self, a_pose):
        assert estimate_measurements(a_pose["landmarks"], 768, 1024) == {}

    def test_returns_every_chart_measurement_with_estimated_flags(self, a_pose):
        result = estimate_measurements(a_pose["landmarks"], 768, 1024, 175)
        assert list(result) == ["shoulderWidth", "chest", "waist", "hip", "torsoLength", "inseam"]
        assert {name for name, v in result.items() if v["estimated"]} == {"chest", "waist", "hip"}
        assert all(v["unit"] == "cm" and v["value"] > 0 for v in result.values())

    def test_scales_linearly_with_height(self, a_pose):
        short = estimate_measurements(a_pose["landmarks"], 768, 1024, 160)
        tall = estimate_measurements(a_pose["landmarks"], 768, 1024, 192)
        for name in short:
            assert tall[name]["value"] / short[name]["value"] == pytest.approx(1.2, abs=0.01)
