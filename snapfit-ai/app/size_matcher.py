from app.config import CATEGORY_WEIGHTS, DEFAULT_WEIGHTS, FIT_TOLERANCE_PCT, NEAR_EDGE_PCT
from app.measurement_engine import MEASUREMENT_NAMES

INCH_TO_CM = 2.54

TIE_BREAK_MARGIN = 0.1
NOTES_ALTERNATIVE_MARGIN = 0.15
RATIO_MODE_CONFIDENCE_PENALTY = 0.7
HEIGHT_HINT = "Add your height for measurement-based sizing — it improves accuracy."

# Heuristic thresholds for body-type classification from body proportions.
# Not calibrated against labeled data - tune as real user feedback comes in.
SHOULDER_HIP_ATHLETIC_THRESHOLD = 1.3
SHOULDER_WIDTH_BROAD_THRESHOLD = 0.27
SHOULDER_WIDTH_SLIM_THRESHOLD = 0.23

READABLE_NAMES = {"shoulderWidth": "shoulder width", "torsoLength": "torso length"}


class SizeMatchError(Exception):
    pass


def _range_to_cm(measurement_range, unit):
    if not measurement_range or measurement_range.get("min") is None or measurement_range.get("max") is None:
        return None
    factor = INCH_TO_CM if unit == "inches" else 1.0
    return {"min": measurement_range["min"] * factor, "max": measurement_range["max"] * factor}


def _midpoint(measurement_range):
    if not measurement_range or measurement_range.get("min") is None or measurement_range.get("max") is None:
        return None
    return (measurement_range["min"] + measurement_range["max"]) / 2


def _similarity(user_value, size_value):
    denominator = max(abs(user_value), 1e-9)
    return max(0.0, min(1.0, 1 - abs(user_value - size_value) / denominator))


def classify_body_type(ratios):
    if ratios.get("shoulder_to_hip_ratio", 1.0) >= SHOULDER_HIP_ATHLETIC_THRESHOLD:
        return "athletic"
    shoulder_width_ratio = ratios.get("shoulder_width_ratio", 0.0)
    if shoulder_width_ratio >= SHOULDER_WIDTH_BROAD_THRESHOLD:
        return "broad"
    if shoulder_width_ratio <= SHOULDER_WIDTH_SLIM_THRESHOLD:
        return "slim"
    return "average"


def distance_to_range(value, cm_range):
    """0 inside [min, max], otherwise the gap to the nearest edge."""
    if value < cm_range["min"]:
        return cm_range["min"] - value
    if value > cm_range["max"]:
        return value - cm_range["max"]
    return 0.0


def range_status(value, cm_range):
    if value < cm_range["min"]:
        return "below"
    if value > cm_range["max"]:
        return "above"
    return "within"


def _measurement_score(value, cm_range):
    """1 inside the range, falling linearly to 0 at FIT_TOLERANCE_PCT of the
    range midpoint beyond the nearest edge."""
    tolerance = FIT_TOLERANCE_PCT * (cm_range["min"] + cm_range["max"]) / 2
    return max(0.0, 1.0 - distance_to_range(value, cm_range) / tolerance) if tolerance > 0 else 0.0


def category_weights(category, names):
    """Weights for the measurements actually compared, re-normalised to sum to 1."""
    base = CATEGORY_WEIGHTS.get(category, DEFAULT_WEIGHTS)
    weights = {name: base.get(name, 0) for name in names}
    if not any(weights.values()):
        # The chart only defines measurements this category doesn't weight
        # (e.g. a tops chart with just inseam) -- weigh what's there equally.
        weights = {name: 1 for name in names}
    total = sum(weights.values())
    return {name: weight / total for name, weight in weights.items()}


def compare_sizes(measurements, size_chart):
    """Per-size comparison of the user's cm measurements against the chart.

    Returns [{label, score, distance, perMeasurement: [{name, userValue, min,
    max, status}]}] in chart order. score is the category-weighted fit (0-1);
    distance is the weighted gap relative to each range midpoint, used to rank
    sizes when none fits at all.
    """
    unit = size_chart.get("unit", "inches")
    category = size_chart.get("category")
    comparison = []

    for size in size_chart.get("sizes") or []:
        chart_measurements = size.get("measurements") or {}
        per_measurement = []
        for name in MEASUREMENT_NAMES:
            cm_range = _range_to_cm(chart_measurements.get(name), unit)
            user = measurements.get(name)
            if cm_range is None or user is None:
                continue
            per_measurement.append(
                {
                    "name": name,
                    "userValue": user["value"],
                    "min": round(cm_range["min"], 1),
                    "max": round(cm_range["max"], 1),
                    "status": range_status(user["value"], cm_range),
                    "_score": _measurement_score(user["value"], cm_range),
                    "_relative_gap": distance_to_range(user["value"], cm_range) / ((cm_range["min"] + cm_range["max"]) / 2),
                }
            )

        weights = category_weights(category, [entry["name"] for entry in per_measurement])
        comparison.append(
            {
                "label": size.get("label"),
                "score": round(sum(weights[e["name"]] * e["_score"] for e in per_measurement), 3),
                "distance": round(sum(weights[e["name"]] * e["_relative_gap"] for e in per_measurement), 4),
                "perMeasurement": [{k: v for k, v in e.items() if not k.startswith("_")} for e in per_measurement],
            }
        )

    if not any(size["perMeasurement"] for size in comparison):
        raise SizeMatchError("NO_COMPARABLE_MEASUREMENTS")
    return comparison


def _rank(comparison, sizes_order):
    """(recommended, alternative) labels. Best score wins, smaller distance
    breaks ties (so a nearest size exists even when nothing fits); a near-tie
    with the next size up prefers the looser fit."""
    ranked = sorted(comparison, key=lambda size: (-size["score"], size["distance"]))
    top = ranked[0]
    if len(ranked) == 1:
        return top["label"], None
    second = ranked[1]
    if (
        top["score"] > 0
        and top["score"] - second["score"] <= TIE_BREAK_MARGIN
        and sizes_order.index(second["label"]) > sizes_order.index(top["label"])
    ):
        return second["label"], top["label"]
    return top["label"], second["label"]


def _neighbour(sizes_order, label, step):
    index = sizes_order.index(label) + step
    return sizes_order[index] if 0 <= index < len(sizes_order) else None


def build_fit_notes(recommended, comparison, sizes_order):
    entry = next(size for size in comparison if size["label"] == recommended)
    larger = _neighbour(sizes_order, recommended, 1)
    smaller = _neighbour(sizes_order, recommended, -1)
    notes = []
    for m in entry["perMeasurement"]:
        name = READABLE_NAMES.get(m["name"], m["name"])
        if m["status"] == "above":
            tail = f"consider {larger}." if larger else f"{recommended} may feel tight."
            notes.append(f"Your {name} is above {recommended}'s range — {tail}")
        elif m["status"] == "below":
            tail = f"{smaller} may fit closer." if smaller else f"{recommended} may feel loose."
            notes.append(f"Your {name} is below {recommended}'s range — {tail}")
        elif larger and m["userValue"] >= m["max"] - NEAR_EDGE_PCT * (m["max"] - m["min"]):
            notes.append(f"{name.capitalize()} is near the top of {recommended}; consider {larger} for a looser fit.")
    return notes


def _score_size_by_ratios(size, ratios):
    measurements = size.get("measurements", {})
    shoulder = _midpoint(measurements.get("shoulderWidth"))
    hip = _midpoint(measurements.get("hip"))
    torso = _midpoint(measurements.get("torsoLength"))
    inseam = _midpoint(measurements.get("inseam"))

    comparisons = []

    if shoulder is not None and hip:
        comparisons.append(_similarity(ratios["shoulder_to_hip_ratio"], shoulder / hip))

    if torso is not None and inseam is not None and (torso + inseam):
        comparisons.append(_similarity(ratios["torso_length_ratio"], torso / (torso + inseam)))

    return (sum(comparisons) / len(comparisons)) if comparisons else 0.0


def _ratio_mode_comparison(sizes, ratios):
    comparison = [
        {"label": size.get("label"), "score": round(_score_size_by_ratios(size, ratios), 3), "distance": 0.0, "perMeasurement": []}
        for size in sizes
    ]
    if not any(size["score"] for size in comparison):
        raise SizeMatchError("NO_COMPARABLE_MEASUREMENTS")
    return comparison


def _build_notes(recommended, fit_scores, sizes_order, ratio_mode):
    notes = f"Based on your proportions, {recommended} is the best fit."

    recommended_score = fit_scores[recommended]
    alternatives = sorted(
        ((label, score) for label, score in fit_scores.items() if label != recommended),
        key=lambda item: abs(recommended_score - item[1]),
    )
    if alternatives:
        alt_label, alt_score = alternatives[0]
        if abs(recommended_score - alt_score) <= NOTES_ALTERNATIVE_MARGIN:
            is_larger = sizes_order.index(alt_label) > sizes_order.index(recommended)
            fit_word = "looser" if is_larger else "closer"
            notes += f" {alt_label} may also work if you prefer a {fit_word} fit."

    if ratio_mode:
        notes += " This estimate is based on body proportions only, without a height reference, so it is less precise."

    return notes


def recommend_size(features, size_chart, measurements=None):
    """measurements: estimate_measurements() output; empty/None -> proportion-only
    mode (no height), which scores sizes by body ratios and applies a confidence
    penalty.

    Returns the original keys (recommended_size, confidence, fit_scores,
    body_type, notes) plus alternative_size, size_comparison and fit_notes.
    """
    sizes = size_chart.get("sizes") or []
    if not sizes:
        raise SizeMatchError("EMPTY_SIZE_CHART")

    sizes_order = [size.get("label") for size in sizes]
    ratios = features.get("ratios", {})
    ratio_mode = not measurements

    comparison = _ratio_mode_comparison(sizes, ratios) if ratio_mode else compare_sizes(measurements, size_chart)
    recommended, alternative = _rank(comparison, sizes_order)
    fit_scores = {size["label"]: size["score"] for size in comparison}

    confidence = fit_scores[recommended]
    if ratio_mode:
        confidence *= RATIO_MODE_CONFIDENCE_PENALTY

    return {
        "recommended_size": recommended,
        "confidence": round(confidence, 2),
        "fit_scores": {label: round(score, 2) for label, score in fit_scores.items()},
        "body_type": classify_body_type(ratios),
        "notes": _build_notes(recommended, fit_scores, sizes_order, ratio_mode),
        "alternative_size": alternative,
        "size_comparison": [{k: v for k, v in size.items() if k != "distance"} for size in comparison],
        "fit_notes": [HEIGHT_HINT] if ratio_mode else build_fit_notes(recommended, comparison, sizes_order),
    }
