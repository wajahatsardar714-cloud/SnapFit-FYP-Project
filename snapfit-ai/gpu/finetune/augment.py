"""Training augmentation for the clothes parser (numpy + OpenCV only).

At run time the parser's processor squeezes the whole photo to 512x512, so
training does the same: a random crop that keeps most of the photo (or the
whole photo), squeezed to 512x512, a horizontal flip that also swaps the
left / right labels, and a small colour jitter. Labels are resized with
nearest-neighbour so no new ids appear; the ignore value (255) survives.
"""

import cv2
import numpy as np

IGNORE = 255
# Left / right label pairs (ATR): shoes, legs, arms.
FLIP_PAIRS = ((9, 10), (12, 13), (14, 15))

SIZE = 512
FULL_IMAGE_CHANCE = 0.3
SCALE = (0.6, 1.0)  # share of the photo's area kept by a crop
ASPECT_JITTER = (0.8, 1.25)  # crop aspect / photo aspect
BRIGHTNESS = 0.25
CONTRAST = 0.25
SATURATION = 0.25
HUE_DEGREES = 8


def flip_labels(labels):
    """A label map mirrored left-right, with left / right ids swapped."""
    flipped = np.ascontiguousarray(np.asarray(labels)[:, ::-1])
    swapped = flipped.copy()
    for left, right in FLIP_PAIRS:
        swapped[flipped == left] = right
        swapped[flipped == right] = left
    return swapped


def random_crop_box(height, width, rng, scale=SCALE, aspect_jitter=ASPECT_JITTER, full_chance=FULL_IMAGE_CHANCE):
    """(y0, x0, h, w) of a random crop inside a height x width photo."""
    if rng.random() < full_chance:
        return 0, 0, height, width
    for _ in range(10):
        area = height * width * rng.uniform(*scale)
        aspect = (width / float(height)) * float(np.exp(rng.uniform(np.log(aspect_jitter[0]), np.log(aspect_jitter[1]))))
        w = int(round(np.sqrt(area * aspect)))
        h = int(round(np.sqrt(area / aspect)))
        if 0 < w <= width and 0 < h <= height:
            y0 = int(rng.integers(0, height - h + 1))
            x0 = int(rng.integers(0, width - w + 1))
            return y0, x0, h, w
    return 0, 0, height, width


def color_jitter(image, rng, brightness=BRIGHTNESS, contrast=CONTRAST, saturation=SATURATION, hue_degrees=HUE_DEGREES):
    """uint8 RGB image with random brightness, contrast, saturation and hue."""
    out = image.astype(np.float32)
    out *= rng.uniform(1 - brightness, 1 + brightness)
    mean = out.mean()
    out = (out - mean) * rng.uniform(1 - contrast, 1 + contrast) + mean
    grey = out.mean(axis=2, keepdims=True)
    out = (out - grey) * rng.uniform(1 - saturation, 1 + saturation) + grey
    out = np.clip(out, 0, 255).astype(np.uint8)
    if hue_degrees:
        hsv = cv2.cvtColor(out, cv2.COLOR_RGB2HSV)
        # OpenCV hue runs 0..179 (2 degrees per step).
        shift = int(round(rng.uniform(-hue_degrees, hue_degrees) / 2.0))
        hsv[..., 0] = ((hsv[..., 0].astype(np.int16) + shift) % 180).astype(np.uint8)
        out = cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB)
    return out


def train_transform(image, labels, rng, size=SIZE):
    """(image, labels) ready for training: uint8 RGB size x size and uint8
    labels size x size. `labels` must have the image's height and width."""
    image = np.asarray(image)
    labels = np.asarray(labels).astype(np.uint8)
    if image.shape[:2] != labels.shape:
        raise ValueError(f"image {image.shape[:2]} and labels {labels.shape} differ in size")
    y0, x0, h, w = random_crop_box(image.shape[0], image.shape[1], rng)
    image = image[y0: y0 + h, x0: x0 + w]
    labels = labels[y0: y0 + h, x0: x0 + w]
    image = cv2.resize(image, (size, size), interpolation=cv2.INTER_LINEAR)
    labels = cv2.resize(labels, (size, size), interpolation=cv2.INTER_NEAREST)
    if rng.random() < 0.5:
        image = np.ascontiguousarray(image[:, ::-1])
        labels = flip_labels(labels)
    image = color_jitter(image, rng)
    return image, labels


def eval_transform(image, size=SIZE):
    """uint8 RGB size x size (the whole photo squeezed, as the processor does)."""
    return cv2.resize(np.asarray(image), (size, size), interpolation=cv2.INTER_LINEAR)


def normalize(image, mean, std):
    """float32 CHW array: (image / 255 - mean) / std."""
    out = image.astype(np.float32) / 255.0
    out = (out - np.asarray(mean, np.float32)) / np.asarray(std, np.float32)
    return np.ascontiguousarray(out.transpose(2, 0, 1))
