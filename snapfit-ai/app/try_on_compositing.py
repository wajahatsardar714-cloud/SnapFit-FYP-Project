"""Image processing around the GPU try-on model (see gpu_try_on.py).

The server centre-crops whatever it gets to 768x1024 and regenerates the whole
frame, softly. So the shopper's photo is letterboxed to the model's frame
before sending, the result is mapped back to the photo's own frame, and only
the clothing region is blended into the original photo.
"""

import math

import cv2
import numpy as np

from app.try_on import TryOnError

# CatVTON's working resolution (gpu/catvton_server.py WIDTH, HEIGHT). Sending
# exactly this size makes the server's crop and resize no-ops.
MODEL_SIZE = (768, 1024)
# Longest side of the returned photo. The garment is generated at 768x1024 and
# upscaled back; much past ~1.5x it looks soft next to the photo's own detail,
# and a larger JPEG only slows the data URL the widget receives.
MAX_OUTPUT_SIDE = 1600
# The person photo the model sees: near-lossless, since the model can only
# keep detail it receives.
PERSON_JPEG_QUALITY = 95
OUTPUT_JPEG_QUALITY = 92

# Blending, in model-output pixels (scaled to the photo). The feather ramps up
# inward from the mask edge, so every pixel outside the mask stays the
# original's; about 1.5 cells of the model's 8x-downsampled latent, the width
# over which its edit fades in at the mask edge.
FEATHER = 12.0
# Mild unsharp mask on the garment, which comes back soft (and upscaled).
UNSHARP_SIGMA = 1.0
UNSHARP_AMOUNT = 0.5


def _resize(image, size):
    if (image.shape[1], image.shape[0]) == tuple(size):
        return image
    shrinking = size[0] < image.shape[1]
    return cv2.resize(image, size, interpolation=cv2.INTER_AREA if shrinking else cv2.INTER_CUBIC)


def fit_within(image, max_side=MAX_OUTPUT_SIDE):
    """The image scaled down so its longest side is at most max_side."""
    height, width = image.shape[:2]
    scale = max_side / max(height, width)
    if scale >= 1:
        return image
    return _resize(image, (round(width * scale), round(height * scale)))


def encode_jpeg(image, quality=OUTPUT_JPEG_QUALITY):
    ok, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise TryOnError("ENCODE_FAILED")
    return encoded.tobytes()


# --- model frame --------------------------------------------------------------


def _letterbox(width, height):
    """(padded_width, padded_height, left, top): the smallest frame with the
    model's exact aspect ratio that holds width x height, image centred."""
    divisor = math.gcd(*MODEL_SIZE)
    unit_w, unit_h = MODEL_SIZE[0] // divisor, MODEL_SIZE[1] // divisor
    units = max(math.ceil(width / unit_w), math.ceil(height / unit_h))
    padded_w, padded_h = unit_w * units, unit_h * units
    return padded_w, padded_h, (padded_w - width) // 2, (padded_h - height) // 2


def _model_pixel(width, height):
    """Photo pixels per model-output pixel."""
    return _letterbox(width, height)[1] / MODEL_SIZE[1]


def to_model_frame(image, border_type):
    """The image padded to the model's aspect ratio (so the server's centre
    crop removes nothing) and scaled to MODEL_SIZE. border_type is
    cv2.BORDER_REPLICATE for the photo, cv2.BORDER_CONSTANT (zero) for masks."""
    height, width = image.shape[:2]
    padded_w, padded_h, left, top = _letterbox(width, height)
    padded = cv2.copyMakeBorder(image, top, padded_h - height - top, left, padded_w - width - left, border_type)
    return _resize(padded, MODEL_SIZE)


def from_model_frame(frame, width, height):
    """Inverse of to_model_frame: a model-frame image (at any resolution) back
    to the width x height photo's frame, padding removed."""
    padded_w, padded_h, left, top = _letterbox(width, height)
    return _resize(frame, (padded_w, padded_h))[top : top + height, left : left + width]


# --- compositing --------------------------------------------------------------


def composite_garment(photo, generated, mask):
    """The photo with the (mildly sharpened) generated image blended in over
    the mask, feathered inward from its edge: every pixel outside the mask is
    the photo's own."""
    height, width = photo.shape[:2]
    scale = _model_pixel(width, height)
    inside = (mask > 127).astype(np.uint8)
    alpha = np.clip(cv2.distanceTransform(inside, cv2.DIST_L2, 5) / (FEATHER * scale), 0.0, 1.0)[..., None]
    # Brightness only: sharpening each colour channel fringes colour edges
    # (sleeve hems, arms against the garment).
    luma = cv2.cvtColor(generated, cv2.COLOR_BGR2GRAY).astype(np.float32)
    detail = luma - cv2.GaussianBlur(luma, (0, 0), UNSHARP_SIGMA * scale)
    sharpened = generated + UNSHARP_AMOUNT * detail[..., None]
    return np.clip(np.rint(photo * (1.0 - alpha) + sharpened * alpha), 0, 255).astype(np.uint8)
