INCH_TO_CM = 2.54

MEASUREMENT_MAP = {
    "chest": "chest_cm",
    "shoulderWidth": "shoulder_width_cm",
    "hip": "hip_width_cm",
    "torsoLength": "torso_length_cm",
    "inseam": "inseam_cm",
}

FIT_THRESHOLD_PCT = 0.10
TIE_BREAK_MARGIN = 0.1
NOTES_ALTERNATIVE_MARGIN = 0.15
RATIO_MODE_CONFIDENCE_PENALTY = 0.7

# Heuristic thresholds for body-type classification from body proportions.
# Not calibrated against labeled data - tune as real user feedback comes in.
SHOULDER_HIP_ATHLETIC_THRESHOLD = 1.3
SHOULDER_WIDTH_BROAD_THRESHOLD = 0.27
SHOULDER_WIDTH_SLIM_THRESHOLD = 0.23


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


def _score_size_by_measurements(size, unit, estimated_cm):
    measurements = size.get("measurements", {})
    total = 0.0
    compared = 0

    for chart_key, feature_key in MEASUREMENT_MAP.items():
        estimated = estimated_cm.get(feature_key)
        cm_range = _range_to_cm(measurements.get(chart_key), unit)
        if estimated is None or cm_range is None:
            continue

        compared += 1
        if cm_range["min"] <= estimated <= cm_range["max"]:
            total += 1.0
        else:
            width = cm_range["max"] - cm_range["min"]
            threshold = FIT_THRESHOLD_PCT * width
            distance = (
                cm_range["min"] - estimated if estimated < cm_range["min"] else estimated - cm_range["max"]
            )
            if threshold > 0 and distance <= threshold:
                total += 0.5

    return (total / compared) if compared else 0.0, compared


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

    return (sum(comparisons) / len(comparisons)) if comparisons else 0.0, len(comparisons)


def _pick_recommended(fit_scores, sizes_order):
    ranked = sorted(fit_scores.items(), key=lambda item: item[1], reverse=True)
    top_label, top_score = ranked[0]

    if len(ranked) > 1:
        second_label, second_score = ranked[1]
        if top_score - second_score <= TIE_BREAK_MARGIN:
            top_index = sizes_order.index(top_label)
            second_index = sizes_order.index(second_label)
            if second_index > top_index:
                return second_label

    return top_label


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


def recommend_size(features, size_chart, user_height_cm=None):
    sizes = size_chart.get("sizes") or []
    if not sizes:
        raise SizeMatchError("EMPTY_SIZE_CHART")

    sizes_order = [size.get("label") for size in sizes]
    ratios = features.get("ratios", {})
    estimated_cm = features.get("estimated_cm")

    ratio_mode = user_height_cm is None or not estimated_cm

    fit_scores = {}
    if ratio_mode:
        for size in sizes:
            score, _ = _score_size_by_ratios(size, ratios)
            fit_scores[size.get("label")] = score
    else:
        unit = size_chart.get("unit", "inches")
        for size in sizes:
            score, _ = _score_size_by_measurements(size, unit, estimated_cm)
            fit_scores[size.get("label")] = score

    if not any(fit_scores.values()):
        raise SizeMatchError("NO_COMPARABLE_MEASUREMENTS")

    recommended = _pick_recommended(fit_scores, sizes_order)
    confidence = fit_scores[recommended]
    if ratio_mode:
        confidence *= RATIO_MODE_CONFIDENCE_PENALTY

    return {
        "recommended_size": recommended,
        "confidence": round(confidence, 2),
        "fit_scores": {label: round(score, 2) for label, score in fit_scores.items()},
        "body_type": classify_body_type(ratios),
        "notes": _build_notes(recommended, fit_scores, sizes_order, ratio_mode),
    }
