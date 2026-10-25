"""Image processing around the GPU try-on model (see gpu_try_on.py).

The server centre-crops whatever it gets to 768x1024 and regenerates the whole
frame, softly and with some colour drift. So the shopper's photo is
letterboxed to the model's frame before sending, the result is mapped back to
the photo's own frame, its garment is pulled toward the product's colour, and
only the clothing region is blended into the original photo.
"""

import math

import cv2
import numpy as np

from app.try_on import TryOnError, body_bands, body_masks, product_alpha
from app.utils import decode_image

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

# Colour correction (CIELAB, L 0-100; distances in Lab units, ~2 = just
# noticeable).
# Product pixels whose alpha is at least this are measured (no edge fringes).
SOLID_ALPHA = 0.9
# Less solid foreground than this share of the product photo means the
# background removal failed (e.g. a white tee on a white backdrop): skip.
MIN_PRODUCT_COVERAGE = 0.05
# A product is "one colour" when SPREAD_PERCENTILE % of its pixels lie within
# MAX_PRODUCT_COLOUR_SPREAD of its median colour. Folds and shading on a plain
# garment stay around 3-10; stripes, checks or prints in a second colour
# cover over a quarter of the garment at 30+ and are left uncorrected (a
# small logo covers less and does not count).
SPREAD_PERCENTILE = 75
MAX_PRODUCT_COLOUR_SPREAD = 15.0
# The generated garment's reference colour is its median over the middle of
# the torso (chest to waist, this share of the body width): covered by any
# top, clear of the arms.
TORSO_CORE_WIDTH = 0.5
# Only the landmark body silhouette is corrected: beyond it the mask's
# allowance holds background the model repainted, which can be as pale as a
# white garment (a white wall would turn cream). Its edge is blurred by this
# fraction of the shoulder span, so a garment hanging a little wider still
# gets most of the correction.
BODY_EDGE_SOFTNESS = 0.04
# Within that, pixels within GATE_FULL of the reference are garment (fully
# corrected), fading to untouched at GATE_NONE, so skin keeps its colour
# (~30+ from a pale or dark garment). Lightness counts half: folds and
# shadow on the garment differ mostly in lightness.
GATE_LIGHTNESS_WEIGHT = 0.5
GATE_FULL = 15.0
GATE_NONE = 25.0
# Share of the gap to the product's colour that is closed. Chroma mostly (the
# drift is the model's; a little of its response to the scene's colour cast
# stays). Lightness half: the product photo is studio-lit, while the
# garment's lightness should follow the shopper's scene exposure.
CHROMA_STRENGTH = 0.8
LIGHTNESS_STRENGTH = 0.5
# Caps per correction, so a mis-measured garment cannot be repainted wholesale.
MAX_CHROMA_SHIFT = 20.0
MAX_LIGHTNESS_SHIFT = 15.0


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


# --- colour correction --------------------------------------------------------


def _to_lab(bgr):
    return cv2.cvtColor(bgr.astype(np.float32) / 255.0, cv2.COLOR_BGR2Lab)


def _from_lab(lab):
    return np.clip(np.rint(cv2.cvtColor(lab, cv2.COLOR_Lab2BGR) * 255.0), 0, 255).astype(np.uint8)


def product_garment_colour(product_image_bytes):
    """The product garment's median Lab colour, from its solid pixels; None
    when it has no single colour (stripes, checks, large prints) or too little
    foreground to measure."""
    image = decode_image(product_image_bytes, keep_alpha=True)
    if image is None:
        raise TryOnError("INVALID_PRODUCT_IMAGE")
    solid = product_alpha(product_image_bytes, image) >= SOLID_ALPHA
    if solid.mean() < MIN_PRODUCT_COVERAGE:
        return None
    lab = _to_lab(image[:, :, :3])[solid]
    colour = np.median(lab, axis=0)
    if np.percentile(np.linalg.norm(lab - colour, axis=1), SPREAD_PERCENTILE) > MAX_PRODUCT_COLOUR_SPREAD:
        return None
    return colour


def torso_core(landmarks, width, height):
    """uint8 mask of the middle of the torso (chest to waist band, inner
    TORSO_CORE_WIDTH of the body's width)."""
    bands, _ = body_bands(landmarks, width, height)
    corners = []
    for left, right in (bands[1], bands[2]):
        centre = (left + right) / 2
        corners.append((centre + (left - centre) * TORSO_CORE_WIDTH, centre + (right - centre) * TORSO_CORE_WIDTH))
    (chest_l, chest_r), (waist_l, waist_r) = corners
    core = np.zeros((height, width), np.uint8)
    cv2.fillConvexPoly(core, np.int32([chest_l, chest_r, waist_r, waist_l]), 255)
    return core


def on_body(landmarks, width, height, ease=1.0):
    """Soft uint8 mask of the landmark body silhouette (torso, neck, arms,
    thighs, with fabric allowance), the size ease widening it as for the
    clothing mask."""
    bands, shoulder_span = body_bands(landmarks, width, height, ease)
    body, _ = body_masks(landmarks, width, height, bands, shoulder_span)
    return cv2.GaussianBlur(body, (0, 0), shoulder_span * BODY_EDGE_SOFTNESS)


def _colour_gate(lab, reference):
    distance = np.linalg.norm((lab - reference) * (GATE_LIGHTNESS_WEIGHT, 1.0, 1.0), axis=2)
    return np.clip((GATE_NONE - distance) / (GATE_NONE - GATE_FULL), 0.0, 1.0)


def correct_garment_colour(generated, region, torso, target):
    """Moves the generated garment's colour toward `target` (the product's,
    from product_garment_colour) to undo the model's colour drift. One offset
    for the whole garment, so its shading is kept. Only pixels in `region`
    (uint8, soft: the clothing mask on the body) that are close in colour to
    the generated torso move. Unchanged when target is None."""
    core = (region > 127) & (torso > 0)
    if target is None or not core.any():
        return generated
    lab = _to_lab(generated)
    gate = _colour_gate(lab, np.median(lab[core], axis=0))
    garment = lab[(gate >= 1.0) & (region > 127)]
    if not len(garment):
        return generated

    shift = (target - np.median(garment, axis=0)) * (LIGHTNESS_STRENGTH, CHROMA_STRENGTH, CHROMA_STRENGTH)
    shift[0] = np.clip(shift[0], -MAX_LIGHTNESS_SHIFT, MAX_LIGHTNESS_SHIFT)
    shift[1:] *= min(1.0, MAX_CHROMA_SHIFT / max(float(np.linalg.norm(shift[1:])), 1e-6))

    weight = gate * (region / 255.0)
    touched = weight > 0
    corrected = generated.copy()
    corrected[touched] = _from_lab((lab + weight[..., None] * shift).astype(np.float32))[touched]
    return corrected


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
