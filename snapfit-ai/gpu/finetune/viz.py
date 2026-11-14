"""Picture grids for the report (numpy + OpenCV only): photo | base parser |
fine-tuned parser, one row per example, with a colour legend."""

import cv2
import numpy as np

LABEL_NAMES = [
    "Background", "Hat", "Hair", "Sunglasses", "Upper-clothes", "Skirt", "Pants",
    "Dress", "Belt", "Left-shoe", "Right-shoe", "Face", "Left-leg", "Right-leg",
    "Left-arm", "Right-arm", "Bag", "Scarf",
]
# RGB colours, one per ATR label; the ones that matter most for SnapFit
# (4 top, 5 skirt, 6 pants, 7 dress, 17 scarf) are strong and distinct.
PALETTE = np.array([
    [0, 0, 0],        # 0 Background
    [128, 64, 0],     # 1 Hat
    [255, 200, 0],    # 2 Hair
    [90, 90, 90],     # 3 Sunglasses
    [220, 20, 60],    # 4 Upper-clothes (red)
    [255, 140, 0],    # 5 Skirt (orange)
    [30, 90, 255],    # 6 Pants (blue)
    [190, 0, 255],    # 7 Dress (purple)
    [120, 120, 0],    # 8 Belt
    [0, 120, 120],    # 9 Left-shoe
    [0, 170, 170],    # 10 Right-shoe
    [255, 220, 180],  # 11 Face
    [160, 255, 160],  # 12 Left-leg
    [100, 200, 100],  # 13 Right-leg
    [255, 180, 220],  # 14 Left-arm
    [220, 130, 180],  # 15 Right-arm
    [140, 100, 60],   # 16 Bag
    [0, 230, 120],    # 17 Scarf (green)
], dtype=np.uint8)
IGNORE_COLOUR = np.array([255, 255, 255], dtype=np.uint8)


def colorize(labels):
    """RGB image of a label map (255 = ignore shown white)."""
    labels = np.asarray(labels)
    out = np.empty(labels.shape + (3,), np.uint8)
    out[:] = IGNORE_COLOUR
    valid = labels < len(PALETTE)
    out[valid] = PALETTE[labels[valid]]
    return out


def _fit(item, height):
    """A photo (H x W x 3) resized smoothly, or a label map (H x W) resized
    with nearest-neighbour and coloured, to the given height."""
    item = np.asarray(item)
    width = max(1, int(round(item.shape[1] * height / float(item.shape[0]))))
    if item.ndim == 2:
        return colorize(cv2.resize(item.astype(np.uint8), (width, height), interpolation=cv2.INTER_NEAREST))
    return cv2.resize(item.astype(np.uint8), (width, height), interpolation=cv2.INTER_AREA)


def _text(canvas, text, x, y, scale=0.5, colour=(0, 0, 0)):
    cv2.putText(canvas, text, (x, y), cv2.FONT_HERSHEY_SIMPLEX, scale, colour, 1, cv2.LINE_AA)


def legend(width, labels=range(len(LABEL_NAMES))):
    """White strip with a colour box and the name of each label."""
    labels = list(labels)
    per_row = max(1, width // 150)
    rows = (len(labels) + per_row - 1) // per_row
    canvas = np.full((rows * 24 + 8, width, 3), 255, np.uint8)
    for n, label in enumerate(labels):
        x = 8 + (n % per_row) * 150
        y = 8 + (n // per_row) * 24
        canvas[y: y + 16, x: x + 16] = PALETTE[label]
        cv2.rectangle(canvas, (x, y), (x + 15, y + 15), (0, 0, 0), 1)
        _text(canvas, f"{label} {LABEL_NAMES[label]}", x + 22, y + 13, 0.42)
    return canvas


def comparison_grid(rows, titles=("photo", "base parser", "fine-tuned"), row_height=320, captions=None):
    """One RGB image: each row is (photo, base labels, fine-tuned labels);
    label maps are coloured. A header, optional row captions and a legend
    are added."""
    if not rows:
        raise ValueError("no rows")
    rendered = []
    for n, row in enumerate(rows):
        cells = []
        for item in row:
            cell = _fit(item, row_height)
            cells.append(np.pad(cell, ((0, 0), (4, 4), (0, 0)), constant_values=255))
        line = np.concatenate(cells, axis=1)
        if captions:
            bar = np.full((22, line.shape[1], 3), 255, np.uint8)
            _text(bar, str(captions[n])[:120], 6, 16, 0.45)
            line = np.concatenate([bar, line], axis=0)
        rendered.append(line)
    width = max(r.shape[1] for r in rendered)
    rendered = [np.pad(r, ((0, 4), (0, width - r.shape[1]), (0, 0)), constant_values=255) for r in rendered]
    header = np.full((30, width, 3), 255, np.uint8)
    column = width // max(1, len(rows[0]))
    for n, title in enumerate(titles):
        _text(header, title, n * column + 10, 21, 0.6)
    return np.concatenate([header] + rendered + [legend(width)], axis=0)
