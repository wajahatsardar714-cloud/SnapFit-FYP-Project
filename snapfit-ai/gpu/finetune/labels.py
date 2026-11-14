"""Automatic labels for the synthetic photos (numpy + OpenCV only).

The current parser (SegFormer-B2 Clothes) labels each generated photo. Its
mistakes on South Asian wear are predictable: the long lower part of a kameez
or kurta comes out as 5 Skirt or 7 Dress, a shalwar is sometimes called a
skirt, and a scarf label (17) appears on garments without a dupatta. Because
every photo was generated from a known spec (prompts.py), those mistakes can
be fixed without a human:

* label 17 is kept only when the spec has a dupatta (otherwise it becomes 4);
* 5 Skirt / 7 Dress pixels above the top's hem that touch the main top
  become 4 Upper-clothes (the whole kameez / kurta is 4);
* 5 / 7 pixels at or below the hem become 6 Pants (shalwar, trousers);
* 5 / 7 pixels above the hem that do not touch the top cannot be decided and
  are ignored in training (255).

Face, hair, arms, legs, shoes, bag and hat are never changed. The hem is the
first row (below the upper body) where pants fill most of the person's width
or the clothes split into two legs.
Then `quality_check` decides whether the photo and its labels are good enough
to train on, and `training_target` blanks out pixels the parser was unsure
about.
"""

import cv2
import numpy as np

NUM_LABELS = 18
IGNORE = 255
LABEL_NAMES = [
    "Background", "Hat", "Hair", "Sunglasses", "Upper-clothes", "Skirt", "Pants",
    "Dress", "Belt", "Left-shoe", "Right-shoe", "Face", "Left-leg", "Right-leg",
    "Left-arm", "Right-arm", "Bag", "Scarf",
]
BACKGROUND, UPPER, SKIRT, PANTS, DRESS, BELT, FACE, SCARF = 0, 4, 5, 6, 7, 8, 11, 17
ARMS = (14, 15)
# Labels the correction may change; everything else is left alone.
MERGE_LABELS = (UPPER, SKIRT, DRESS)
STRAY_LABELS = (SKIRT, DRESS)
# Clothing labels (for the confidence checks and the head check).
GARMENT_LABELS = (UPPER, SKIRT, PANTS, DRESS, BELT, SCARF)

# Hem search: starts this far down the person (above it is the upper body),
# and needs, in each row over a run of HEM_RUN_SHARE of the person's height,
# pants on at least HEM_PANTS_SHARE of the person's pixels or two legs.
HEM_SEARCH_START = 0.35
HEM_PANTS_SHARE = 0.5
HEM_RUN_SHARE = 0.02
# Two-legs test: clothing and bare-leg labels (not arms, so hanging hands do
# not count; not shoes, which are always apart), runs of at least LEG_MIN_RUN
# of the person's width, the second widest at least LEG_WIDTH_RATIO of the
# widest.
LEG_LABELS = (UPPER, SKIRT, PANTS, DRESS, BELT, SCARF, 12, 13)
LEG_MIN_RUN = 0.03
LEG_WIDTH_RATIO = 0.35
# Where the hem probably is when no pants are visible (only reported; such
# photos are dropped by the quality check).
HEM_GUESS = {"kameez": 0.72, "kurta": 0.62}
HEM_GUESS_SHORT = 0.5

# Quality check thresholds (shares of the image or of the person's pixels).
MIN_PERSON_SHARE = 0.06
MAX_PERSON_SHARE = 0.80
MIN_PERSON_PART = 0.015  # of the image: a second blob this big = a second person
MIN_FACE_PART = 0.0002  # of the image
MIN_HEIGHT_SHARE = 0.55  # person height / image height (full body)
MAX_FACE_ROW = 0.25  # face centre within the top quarter of the person
MIN_TOP_SHARE = 0.06
MIN_BOTTOM_SHARE = 0.02
MIN_DUPATTA_SHARE = 0.004
MIN_ARM_SHARE = 0.008  # short sleeves must show some bare arm
MAX_LEFTOVER_SHARE = 0.005  # 5 / 7 left after the correction
MAX_IGNORE_SHARE = 0.15
MIN_GARMENT_CONFIDENCE = 0.75
MIN_GARMENT_CONFIDENCE_RELAXED = 0.60
HEAD_ROWS = 0.08  # top share of the person checked for garment labels
MAX_GARMENT_ON_HEAD = 0.25
HEM_PERCENTILE = 99.5  # lowest row of the top, ignoring specks

# Training target: pixels the parser was unsure about are ignored.
MIN_GARMENT_PROB = 0.5
MIN_OTHER_CONFIDENCE = 0.4

# SAM refinement: only when SAM agrees with the parser's top this well, and
# only background pixels this close to the top become top.
SAM_MIN_IOU = 0.8
SAM_BAND = 8


def person_box(labels):
    """(top_row, bottom_row, left_col, right_col) of all non-background
    pixels, or None when there is no person."""
    person = (labels != BACKGROUND) & (labels != IGNORE)
    if not person.any():
        return None
    rows = np.flatnonzero(person.any(axis=1))
    cols = np.flatnonzero(person.any(axis=0))
    return int(rows[0]), int(rows[-1]), int(cols[0]), int(cols[-1])


def _two_legs(row, min_width):
    """Whether a row of a clothing/leg mask splits into two legs: at least
    two runs of `min_width`+ pixels, the two widest of similar width (a thin
    dupatta end hanging beside a kameez is not a leg)."""
    padded = np.concatenate(([False], row, [False]))
    edges = np.flatnonzero(padded[1:] != padded[:-1])
    widths = np.sort(edges[1::2] - edges[0::2])[::-1]
    widths = widths[widths >= min_width]
    return widths.size >= 2 and widths[1] >= LEG_WIDTH_RATIO * widths[0]


def find_hem(labels, box=None):
    """(row, found): the first row, below HEM_SEARCH_START of the person,
    from which (for a run of rows) either pants fill at least
    HEM_PANTS_SHARE of the person's pixels or the clothes split into two
    legs. A kameez covers the legs down to its hem, so the split also finds
    a shalwar the parser called "skirt". found is False when there is no
    such row."""
    box = box or person_box(labels)
    if box is None:
        return 0, False
    top, bottom, left, right = box
    height = bottom - top + 1
    person = (labels != BACKGROUND) & (labels != IGNORE)
    person_rows = person.sum(axis=1).astype(np.float64)
    pants_rows = (labels == PANTS).sum(axis=1).astype(np.float64)
    share = np.divide(pants_rows, person_rows, out=np.zeros_like(pants_rows), where=person_rows > 0)
    legs = np.isin(labels, LEG_LABELS)
    min_width = max(2, int(round((right - left + 1) * LEG_MIN_RUN)))
    start = top + int(height * HEM_SEARCH_START)
    flags = np.zeros(labels.shape[0], bool)
    for row in range(start, bottom + 1):
        flags[row] = share[row] >= HEM_PANTS_SHARE or _two_legs(legs[row], min_width)
    run = max(1, int(round(height * HEM_RUN_SHARE)))
    for row in range(start, bottom - run + 2):
        if flags[row: row + run].all():
            return row, True
    return bottom + 1, False


def _guess_hem(spec, box):
    top, bottom = box[0], box[1]
    share = HEM_GUESS.get(spec.get("top"), HEM_GUESS_SHORT)
    return top + int((bottom - top + 1) * share)


def correct_labels(labels, spec):
    """(corrected, info): the parser's labels fixed using what the spec says
    the person wears. info has the hem row, whether it was found from the
    pants ("pants") or guessed ("guess"), and how many pixels changed."""
    labels = np.asarray(labels).astype(np.uint8)
    out = labels.copy()
    box = person_box(out)
    info = {"hem_row": None, "hem_frac": None, "hem_source": "none", "changed": 0}
    if box is None:
        return out, info

    if not spec.get("dupatta"):
        out[out == SCARF] = UPPER

    hem, found = find_hem(out, box)
    if not found:
        hem = _guess_hem(spec, box)
    info["hem_row"] = int(hem)
    info["hem_frac"] = (hem - box[0]) / float(box[1] - box[0] + 1)
    info["hem_source"] = "pants" if found else "guess"

    candidates = np.isin(out, MERGE_LABELS).astype(np.uint8)
    count, regions = cv2.connectedComponents(candidates, connectivity=8)
    upper_counts = np.bincount(regions[out == UPPER].ravel(), minlength=count)
    upper_counts[0] = 0
    if upper_counts.max() > 0:
        main = int(upper_counts.argmax())
    else:
        sizes = np.bincount(regions.ravel(), minlength=count)
        sizes[0] = 0
        main = int(sizes.argmax()) if count > 1 else -1
    attached = regions == main if main > 0 else np.zeros(out.shape, bool)

    stray = np.isin(out, STRAY_LABELS)
    below = (np.arange(out.shape[0]) >= hem)[:, None]
    corrected = out.copy()
    corrected[stray & below] = PANTS
    corrected[stray & ~below & attached] = UPPER
    corrected[stray & ~below & ~attached] = IGNORE
    info["changed"] = int((corrected != labels).sum())
    return corrected, info


def _components(mask, min_area):
    count, _, stats, centroids = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    keep = [i for i in range(1, count) if stats[i, cv2.CC_STAT_AREA] >= min_area]
    return keep, stats, centroids


def quality_check(corrected, spec, garment_prob=None, info=None, relaxed=False):
    """Whether a corrected label map is good enough to train on.

    Returns {"ok": bool, "reasons": [...], "stats": {...}}. Reasons:
    no_person, person_too_small, person_too_large, several_people, no_face,
    several_faces, not_full_body, face_not_at_top, missing_top, missing_bottom,
    missing_dupatta, top_too_short, top_too_long, hem_unclear,
    skirt_or_dress_left, too_uncertain, low_confidence, garment_on_head,
    no_bare_arms. relaxed=True skips the softer checks (face position, the
    dupatta, bare arms) and lowers the confidence bar.
    """
    corrected = np.asarray(corrected)
    height, width = corrected.shape
    image_area = float(height * width)
    reasons, stats = [], {}

    box = person_box(corrected)
    if box is None:
        return {"ok": False, "reasons": ["no_person"], "stats": stats}
    person = (corrected != BACKGROUND)
    person_area = float(person.sum())
    top, bottom = box[0], box[1]
    person_height = bottom - top + 1
    stats["person_share"] = person_area / image_area
    if stats["person_share"] < MIN_PERSON_SHARE:
        reasons.append("person_too_small")
    if stats["person_share"] > MAX_PERSON_SHARE:
        reasons.append("person_too_large")

    parts, _, _ = _components(person, MIN_PERSON_PART * image_area)
    stats["people"] = len(parts)
    if len(parts) > 1:
        reasons.append("several_people")

    faces, face_stats, face_centres = _components(corrected == FACE, MIN_FACE_PART * image_area)
    stats["faces"] = len(faces)
    if not faces:
        reasons.append("no_face")
    elif len(faces) > 1:
        reasons.append("several_faces")

    stats["height_share"] = person_height / float(height)
    if stats["height_share"] < MIN_HEIGHT_SHARE:
        reasons.append("not_full_body")
    if len(faces) == 1 and not relaxed:
        face_row = (face_centres[faces[0]][1] - top) / float(person_height)
        stats["face_row"] = float(face_row)
        if face_row > MAX_FACE_ROW:
            reasons.append("face_not_at_top")

    def share(ids):
        return float(np.isin(corrected, ids).sum()) / person_area

    stats["top_share"] = share((UPPER,))
    stats["bottom_share"] = share((PANTS,))
    stats["dupatta_share"] = share((SCARF,))
    if stats["top_share"] < MIN_TOP_SHARE:
        reasons.append("missing_top")
    if stats["bottom_share"] < MIN_BOTTOM_SHARE:
        reasons.append("missing_bottom")
    if spec.get("dupatta") and not relaxed and stats["dupatta_share"] < MIN_DUPATTA_SHARE:
        reasons.append("missing_dupatta")

    top_rows = np.nonzero(corrected == UPPER)[0]
    if top_rows.size:
        hem_frac = (np.percentile(top_rows, HEM_PERCENTILE) - top) / float(person_height)
        stats["top_hem_frac"] = float(hem_frac)
        if spec.get("long_top") and spec.get("min_hem") is not None and hem_frac < spec["min_hem"]:
            reasons.append("top_too_short")
        if not spec.get("long_top") and spec.get("max_hem") is not None and hem_frac > spec["max_hem"]:
            reasons.append("top_too_long")

    if info is not None and info.get("hem_source") == "guess":
        reasons.append("hem_unclear")

    stats["leftover_share"] = share(STRAY_LABELS)
    if stats["leftover_share"] > MAX_LEFTOVER_SHARE:
        reasons.append("skirt_or_dress_left")
    stats["ignore_share"] = share((IGNORE,))
    if stats["ignore_share"] > MAX_IGNORE_SHARE:
        reasons.append("too_uncertain")

    garment = np.isin(corrected, GARMENT_LABELS)
    if garment_prob is not None and garment.any():
        stats["garment_confidence"] = float(np.asarray(garment_prob, dtype=np.float64)[garment].mean())
        bar = MIN_GARMENT_CONFIDENCE_RELAXED if relaxed else MIN_GARMENT_CONFIDENCE
        if stats["garment_confidence"] < bar:
            reasons.append("low_confidence")

    head = slice(top, top + max(1, int(person_height * HEAD_ROWS)))
    head_person = float(person[head].sum())
    stats["garment_on_head"] = float(garment[head].sum()) / head_person if head_person else 0.0
    if stats["garment_on_head"] > MAX_GARMENT_ON_HEAD:
        reasons.append("garment_on_head")

    stats["arm_share"] = share(ARMS)
    if spec.get("sleeves") == "short" and not relaxed and stats["arm_share"] < MIN_ARM_SHARE:
        reasons.append("no_bare_arms")

    return {"ok": not reasons, "reasons": reasons, "stats": stats}


def training_target(corrected, confidence, garment_prob):
    """The label map to train on: `corrected` with unsure pixels set to
    IGNORE. confidence: the parser's top probability per pixel; garment_prob:
    its summed probability of the clothing labels (both 0..1)."""
    target = np.asarray(corrected).astype(np.uint8).copy()
    confidence = np.asarray(confidence, dtype=np.float32)
    garment_prob = np.asarray(garment_prob, dtype=np.float32)
    garment = np.isin(target, GARMENT_LABELS)
    other = ~garment & (target != IGNORE)
    target[garment & (garment_prob < MIN_GARMENT_PROB)] = IGNORE
    target[other & (confidence < MIN_OTHER_CONFIDENCE)] = IGNORE
    return target


def top_box(corrected):
    """(x0, y0, x1, y1) of the top garment (label 4), or None."""
    ys, xs = np.nonzero(np.asarray(corrected) == UPPER)
    if not ys.size:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def refine_with_sam(corrected, sam_mask, min_iou=SAM_MIN_IOU, band=SAM_BAND):
    """(labels, used): grow the top (4) into background pixels that SAM puts
    on the garment, within `band` pixels of the parser's top. Used only when
    SAM's mask overlaps the parser's top by at least `min_iou` (otherwise SAM
    found something else and the labels are returned unchanged). Never
    touches face, hair, arms, legs or any other label."""
    corrected = np.asarray(corrected)
    top = corrected == UPPER
    sam = np.asarray(sam_mask).astype(bool)
    if sam.shape != top.shape or not top.any() or not sam.any():
        return corrected, False
    iou = (top & sam).sum() / float((top | sam).sum())
    if iou < min_iou:
        return corrected, False
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * band + 1, 2 * band + 1))
    near = cv2.dilate(top.astype(np.uint8), kernel) > 0
    refined = corrected.copy()
    refined[sam & near & (corrected == BACKGROUND)] = UPPER
    return refined, True
