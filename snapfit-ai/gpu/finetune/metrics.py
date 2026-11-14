"""Scores for the clothes parser (numpy only).

* mIoU: for each label, intersection / union of predicted and true pixels
  over the whole evaluation set, averaged over the labels that appear in the
  truth or the prediction (a label that appears in neither is skipped).
  Pixels whose true label is the ignore index (255) are not counted.
* kameez consistency: share of kameez / kurta photos where at least 90% of
  the garment is labelled 4 Upper-clothes and less than 5% 5 Skirt / 7 Dress.
  That is what SnapFit needs: its try-on mask covers labels 4 and 7, and a
  "skirt" under a long top is what leaves old cloth behind.
* gate: whether the fine-tuned parser should replace the base one.
"""

import math

import numpy as np

NUM_LABELS = 18
IGNORE = 255
UPPER, SKIRT, DRESS = 4, 5, 7

MIN_TOP_SHARE = 0.90
MAX_SKIRT_DRESS_SHARE = 0.05
# Western mIoU may drop by at most this many points (mIoU in percent).
MAX_WESTERN_DROP = 1.0


def confusion_matrix(pred, truth, num_classes=NUM_LABELS, ignore_index=IGNORE):
    """num_classes x num_classes counts: rows = true label, columns =
    predicted label. Pixels with the ignore index (or any out-of-range id) in
    the truth are skipped; out-of-range predictions are skipped too."""
    pred = np.asarray(pred).astype(np.int64).ravel()
    truth = np.asarray(truth).astype(np.int64).ravel()
    if pred.shape != truth.shape:
        raise ValueError(f"shape mismatch: pred {pred.shape} vs truth {truth.shape}")
    valid = (truth != ignore_index) & (truth >= 0) & (truth < num_classes) & (pred >= 0) & (pred < num_classes)
    index = truth[valid] * num_classes + pred[valid]
    return np.bincount(index, minlength=num_classes * num_classes).reshape(num_classes, num_classes)


def per_class_iou(matrix):
    """IoU per label (0..1), NaN for labels absent from both truth and
    prediction."""
    matrix = np.asarray(matrix, dtype=np.float64)
    intersection = np.diag(matrix)
    union = matrix.sum(axis=0) + matrix.sum(axis=1) - intersection
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(union > 0, intersection / np.where(union > 0, union, 1), np.nan)


def mean_iou(matrix):
    """Mean IoU in percent over the labels that appear (NaN if none)."""
    iou = per_class_iou(matrix)
    if np.all(np.isnan(iou)):
        return float("nan")
    return float(np.nanmean(iou) * 100.0)


def pixel_accuracy(matrix):
    matrix = np.asarray(matrix, dtype=np.float64)
    total = matrix.sum()
    return float(np.trace(matrix) / total * 100.0) if total else float("nan")


def garment_shares(pred, garment_mask):
    """(share labelled 4, share labelled 5 or 7) of the garment pixels."""
    pred = np.asarray(pred)
    garment = np.asarray(garment_mask).astype(bool)
    total = garment.sum()
    if not total:
        return float("nan"), float("nan")
    values = pred[garment]
    return float((values == UPPER).sum() / total), float(np.isin(values, (SKIRT, DRESS)).sum() / total)


def kameez_consistent(pred, garment_mask, min_top=MIN_TOP_SHARE, max_skirt=MAX_SKIRT_DRESS_SHARE):
    """Whether the garment (a kameez / kurta) is labelled as one top: at
    least `min_top` of it 4 and less than `max_skirt` of it 5 / 7."""
    top, skirt = garment_shares(pred, garment_mask)
    if math.isnan(top):
        return False
    return top >= min_top and skirt < max_skirt


def rate(flags):
    """Share of True values, in percent (NaN for an empty list)."""
    flags = list(flags)
    return float(sum(bool(f) for f in flags) / len(flags) * 100.0) if flags else float("nan")


def _finite(*values):
    for value in values:
        try:
            number = float(value)
        except (TypeError, ValueError):
            return False
        if not math.isfinite(number):
            return False
    return True


def gate(western_base, western_finetuned, kameez_base, kameez_finetuned, max_drop=MAX_WESTERN_DROP):
    """The rule for using the fine-tuned parser: Western mIoU drops by at
    most `max_drop` points AND kameez consistency improves (strictly).
    Returns {"recommended", "western_drop", "kameez_gain", "reasons"}."""
    reasons = []
    if not _finite(western_base, western_finetuned, kameez_base, kameez_finetuned):
        return {"recommended": False, "western_drop": None, "kameez_gain": None, "reasons": ["missing or invalid scores"]}
    drop = western_base - western_finetuned
    gain = kameez_finetuned - kameez_base
    if drop > max_drop:
        reasons.append(f"Western mIoU dropped {drop:.2f} points (allowed: {max_drop:.2f})")
    if gain <= 0:
        reasons.append(f"kameez consistency did not improve ({kameez_base:.1f}% -> {kameez_finetuned:.1f}%)")
    return {"recommended": not reasons, "western_drop": drop, "kameez_gain": gain, "reasons": reasons}


def choose_best(history, base_western, max_drop=MAX_WESTERN_DROP):
    """Index of the best epoch in `history` (dicts with "western_miou",
    "kameez", "synthetic_miou", all on validation sets). Among the epochs
    whose Western mIoU is within `max_drop` of the base, the one with the
    best kameez consistency (then synthetic mIoU, then Western mIoU); if no
    epoch is within the limit, the one with the best Western mIoU. None for
    an empty history."""
    if not history:
        return None

    def number(entry, key):
        value = entry.get(key)
        return value if _finite(value) else -1e9

    allowed = [i for i, e in enumerate(history) if _finite(e.get("western_miou"), base_western) and base_western - e["western_miou"] <= max_drop]
    if allowed:
        return max(allowed, key=lambda i: (number(history[i], "kameez"), number(history[i], "synthetic_miou"), number(history[i], "western_miou"), -i))
    return max(range(len(history)), key=lambda i: (number(history[i], "western_miou"), -i))


def iou_table(names, base_iou, finetuned_iou):
    """Markdown rows: label | base IoU | fine-tuned IoU | change (percent)."""
    def fmt(value):
        return "–" if value is None or not math.isfinite(value) else f"{value * 100:.1f}"

    rows = ["| Label | Base | Fine-tuned | Change |", "|---|---|---|---|"]
    for name, base, tuned in zip(names, base_iou, finetuned_iou):
        if (base is None or not math.isfinite(base)) and (tuned is None or not math.isfinite(tuned)):
            continue
        change = (tuned - base) * 100 if _finite(base, tuned) else None
        change_text = "–" if change is None else f"{change:+.1f}"
        rows.append(f"| {name} | {fmt(base)} | {fmt(tuned)} | {change_text} |")
    return "\n".join(rows)
