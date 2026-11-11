"""Photorealistic try-on on a remote GPU (CatVTON, see gpu/README.md).

SnapFit sends the shopper's photo, the product photo and a clothing mask
built from its own MediaPipe pose (so the GPU side needs no DensePose), and
blends the garment it generates back into the shopper's own photo
(try_on_compositing.py). Configured with TRYON_GPU_URL / TRYON_GPU_TOKEN;
when unset or failing, callers fall back to the local warp try-on.

Newer GPU servers also parse clothes (/parse: an ATR label id per pixel) and
inpaint from a text prompt (/inpaint). With them the mask also covers the
shopper's own top wherever the parser finds it (loose sleeves, a flared
kameez), a long top's part below the new garment's hem is repainted as plain
trousers, and the result is parsed again to tell the shopper when their own
top still shows. Older servers answer 404 there and the try-on works from the
pose mask alone. These extra steps never fail a try-on.
"""

import asyncio
import io
import logging
import os
import time
from typing import NamedTuple, Optional

import cv2
import httpx
import numpy as np
from PIL import Image

from app.try_on import (
    FABRIC_ALLOWANCE,
    TryOnError,
    arm_capsules,
    arm_masks,
    body_bands,
    body_masks,
    body_silhouette,
)
from app.try_on_compositing import (
    BODY_EDGE_SOFTNESS,
    FEATHER,
    MODEL_SIZE,
    PERSON_JPEG_QUALITY,
    composite_garment,
    correct_garment_colour,
    encode_jpeg,
    fit_within,
    from_model_frame,
    labels_from_model_frame,
    model_pixel,
    on_body,
    product_garment_colour,
    to_model_frame,
    torso_core,
)
from app.utils import decode_image

logger = logging.getLogger("snapfit-ai")

GPU_TIMEOUT_SECONDS = 120
# The startup health check only needs the tunnel and server to answer.
HEALTH_TIMEOUT_SECONDS = 10
# Parsing is one quick segmentation pass, inpainting a diffusion run shorter
# than the try-on's. A slow optional step is skipped rather than waited for.
PARSE_TIMEOUT_SECONDS = 30
INPAINT_TIMEOUT_SECONDS = 60
# The backend and the phone wait 180 s for the whole answer, so every GPU call
# of one try-on ends within this many seconds of the request's start (pose,
# measurements and any wait for the GPU included), leaving room for the local
# warp fallback. A step with less than MIN_STEP_SECONDS left is skipped (the
# optional ones) or fails as a timeout (the try-on itself).
TRY_ON_BUDGET_SECONDS = 160
MIN_STEP_SECONDS = 5
# A server that answered 404 on an optional endpoint (an older notebook) is
# not asked again for this long: a newer notebook may come up behind the same
# tunnel URL.
FEATURE_RETRY_SECONDS = 600
# Mask allowance beyond the body for the garment region, as a fraction of
# shoulder span; scaled up by the size ease so a looser size gets more room.
MASK_ALLOWANCE = 0.12
# With the shopper's clothes parsed, the mask hugs the body instead: CatVTON
# stretches a garment to fill its mask (a wide mask gives a boxy shirt), and
# the old clothes beyond it are repainted by /inpaint rather than covered.
MASK_ALLOWANCE_PARSED = 0.05
# Where the mask's hem line sits for each garment length (the product
# mapping's garmentLength), as a fraction of the shoulder-to-hip distance below
# the hip line; negative is above it. A little past where such a garment ends:
# the model needs room for the hem, but stretches the garment to fill a mask
# that reaches much further.
HEM_BELOW_HIPS = {
    # Just under the waist band (0.35 above the hips, WAIST_BAND in try_on).
    "cropped": -0.25,
    # Past the crotch line (about 0.2), so the hem of the shopper's own top is
    # repainted too instead of showing below the new garment.
    "regular": 0.3,
    # Mid-thigh is about 0.35-0.4 (hip-to-knee is 0.7-0.8 of shoulder-to-hip).
    "long": 0.45,
}
# 40 steps took 83-97 s on a T4; 30 keeps a whole size check with try-on
# inside the budget, and the blend back into the photo loses the finest detail
# more steps would add.
INFERENCE_STEPS = 30
GUIDANCE_SCALE = 2.5

# The product's sleeves (the backend's sleeveLength); unknown values count as
# short, the most common.
SLEEVE_LENGTHS = ("none", "short", "long")

# ATR label ids in the GPU server's /parse maps (SegFormer-B2 Clothes).
SKIRT = 5
# The shopper's own top: upper clothes and dress (a kameez is labelled either).
OLD_TOP_LABELS = (4, 7)
# The parsed top is grown by this fraction of shoulder span: the parser's
# edges are a few pixels off, and the old fabric's last pixels must go too.
OLD_TOP_GROWTH = 0.04
# Only parsed clothes touching the shopper's body, and within this fraction of
# shoulder span of it, are theirs: a jacket hanging on the wall behind them is
# parsed as upper clothes too.
PERSON_REACH = 0.5
# Hat, hair, sunglasses and face: never repainted, grown by FACE_MARGIN of
# shoulder span. They protect the face instead of a fixed neck line, so the
# collar of the shopper's own top below the chin can be repainted.
PROTECTED_LABELS = (1, 2, 3, 11)
FACE_MARGIN = 0.03
# Whatever the parser says, nothing above this share of the way from the
# mouth down to the shoulder line (about the chin) is repainted.
CHIN_BELOW_MOUTH = 0.2
# Parsed top within this fraction of shoulder span beyond the landmark arm
# capsules counts as sleeve and is repainted at any height: a loose kurta
# sleeve hangs well past the capsules plus MASK_ALLOWANCE.
SLEEVE_ALLOWANCE = 0.3
# The parser calls the lower part of a kameez or tunic "skirt". Skirt counts
# as the shopper's top only when the top itself (sleeves aside) reaches this
# fraction of the shoulder-to-hip distance below the hip line; a short top
# ends above the hips, so a real skirt under one is left alone.
LONG_TOP_REACH = 0.1
# The shopper's own top outside the mask (a kameez below the new garment's
# hem, its flare, loose sleeve edges) is repainted as trousers and background
# when it covers more than this share of the body area; less is parser noise
# along an edge, not worth a diffusion run.
MIN_TROUSERS_AREA = 0.02
TROUSERS_PROMPT = "plain trousers, natural fabric, matching the person's lower legs, plain background behind the person, photo"
TROUSERS_NEGATIVE_PROMPT = "shirt, kameez, kurta, tunic, long top, dress, skirt, long sleeves, shawl, text, watermark"
# Stable Diffusion inpainting's settings, fewer steps than its usual 30 to
# stay inside the budget; a fixed seed so the same photo always gets the same
# trousers.
INPAINT_STEPS = 20
INPAINT_GUIDANCE = 7.5
INPAINT_SEED = 0
# The shopper is told their own top may still show (tip FITTED_TOP) when the
# parser still finds it outside where the product sits on more than this
# share of the body area: a whole sleeve or a band below the hem, not stray
# pixels along an edge.
FITTED_TOP_LEFTOVER = 0.03
FITTED_TOP_TIP = "FITTED_TOP"
# When set, each GPU try-on saves its masks, clothes map and result there for
# tuning. Off by default: the files include the shopper's photo, so it is for
# test photos only, and the folder must be emptied after.
DEBUG_DIR_ENV = "SNAPFIT_TRYON_DEBUG_DIR"

# url -> {feature: time.monotonic() of its 404}
_unsupported_features = {}
# The GPU server runs one job at a time; a second shopper's try-on waits here
# (its time budget running) instead of racing the first through the tunnel.
_gpu_turn = asyncio.Lock()


class GpuTryOn(NamedTuple):
    """generate_gpu_try_on's result: the JPEG bytes, and a try-on tip code
    (FITTED_TOP_TIP) or None."""

    image: bytes
    tip: Optional[str]


def reset_feature_cache():
    """Forgets which GPU servers lacked /parse or /inpaint."""
    _unsupported_features.clear()


def _supports(url, feature):
    since = _unsupported_features.get(url, {}).get(feature)
    return since is None or time.monotonic() - since > FEATURE_RETRY_SECONDS


def _request_headers(token):
    # ngrok's free tier shows browsers an interstitial page; this header tells it
    # this is an API call (other tunnels ignore it).
    return {"X-Token": token, "ngrok-skip-browser-warning": "1"}


def gpu_try_on_config():
    """(url, token) when the GPU try-on is configured, else None."""
    url = os.environ.get("TRYON_GPU_URL", "").strip().rstrip("/")
    token = os.environ.get("TRYON_GPU_TOKEN", "").strip()
    return (url, token) if url and token else None


async def gpu_health(config):
    """Name of the GPU the remote server reports on /health. Raises
    TryOnError("GPU_UNREACHABLE") when it doesn't answer healthily."""
    url, token = config
    try:
        async with httpx.AsyncClient(timeout=HEALTH_TIMEOUT_SECONDS) as client:
            response = await client.get(f"{url}/health", headers=_request_headers(token))
        response.raise_for_status()
        return response.json()["gpu"]
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        raise TryOnError("GPU_UNREACHABLE")


# --- masks --------------------------------------------------------------------


class _Body(NamedTuple):
    bands: list
    shoulder_span: float
    shoulder_y: float
    hip_y: float
    # First row at the garment's hem line, and the neck row: without a parsed
    # face, nothing above it is repainted. Nothing above the chin row ever is.
    hem_row: int
    neck_row: int
    chin_row: int


def _body(landmarks, width, height, ease=1.0, length="regular"):
    bands, shoulder_span = body_bands(landmarks, width, height, ease)
    shoulder_y = (bands[0][0][1] + bands[0][1][1]) / 2
    hip_y = (bands[-1][0][1] + bands[-1][1][1]) / 2
    hem = HEM_BELOW_HIPS.get(length, HEM_BELOW_HIPS["regular"])
    # The neck: halfway between mouth and shoulder line.
    mouth_y = (landmarks["MOUTH_LEFT"]["y"] + landmarks["MOUTH_RIGHT"]["y"]) / 2 * height
    return _Body(
        bands,
        shoulder_span,
        shoulder_y,
        hip_y,
        max(0, int(hip_y + hem * (hip_y - shoulder_y))),
        max(0, int(mouth_y + 0.5 * (shoulder_y - mouth_y))),
        max(0, int(mouth_y + CHIN_BELOW_MOUTH * (shoulder_y - mouth_y))),
    )


def _disc(radius):
    radius = max(1, int(radius))
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * radius + 1, 2 * radius + 1))


def clothing_mask(landmarks, width, height, ease=1.0, length="regular", allowance=MASK_ALLOWANCE):
    """Garment region the model may repaint, as a PNG-ready uint8 mask: the
    torso down to the hem line for the garment's length (unknown lengths count
    as regular) and both whole arms, so old sleeves of any length are replaced;
    never the face or the hands. Looser sizes (ease > 1) get a wider mask so
    the generated garment can sit looser. `allowance`: how far beyond the
    body, as a fraction of shoulder span."""
    body = _body(landmarks, width, height, ease, length)
    arms, hands = arm_masks(landmarks, width, height, body.shoulder_span)
    kernel = _disc(body.shoulder_span * allowance * ease)
    torso = cv2.dilate(body_silhouette(landmarks, width, height, body.bands, body.shoulder_span), kernel)
    # The hem bounds the torso and legs only: in an A-pose the forearms reach
    # below a cropped hem line.
    torso[body.hem_row :, :] = 0
    region = cv2.bitwise_or(torso, cv2.dilate(arms, kernel))
    region[: body.neck_row, :] = 0
    return cv2.bitwise_and(region, cv2.bitwise_not(hands))


def _sleeve_region(landmarks, width, height, shoulder_span):
    arms = arm_capsules(landmarks, width, height, shoulder_span)
    return cv2.dilate(arms, _disc(shoulder_span * SLEEVE_ALLOWANCE))


def _old_top(labels, include_skirt, landmarks, width, height):
    """uint8 mask of the shopper's own top in a parsed image: the top labels
    (and skirt with include_skirt), only in regions touching the landmark body
    and within PERSON_REACH of it."""
    ids = OLD_TOP_LABELS + ((SKIRT,) if include_skirt else ())
    top = np.isin(labels, ids).astype(np.uint8) * 255
    if not top.any():
        return top
    bands, shoulder_span = body_bands(landmarks, width, height)
    body = body_masks(landmarks, width, height, bands, shoulder_span)[0] > 0
    _, regions = cv2.connectedComponents(top)
    theirs = np.unique(regions[body & (top > 0)])
    top = np.isin(regions, theirs[theirs > 0]).astype(np.uint8) * 255
    zone = cv2.dilate(body.astype(np.uint8) * 255, _disc(shoulder_span * PERSON_REACH))
    return cv2.bitwise_and(top, zone)


def _protected(landmarks, width, height, labels, body):
    """uint8 mask never repainted: everything above the chin row, and the
    parsed hat, hair, sunglasses and face grown by FACE_MARGIN."""
    face = np.isin(labels, PROTECTED_LABELS).astype(np.uint8) * 255
    face = cv2.dilate(face, _disc(body.shoulder_span * FACE_MARGIN))
    face[: body.chin_row, :] = 255
    return face


def wears_long_top(landmarks, width, height, labels):
    """Whether the shopper's own top in a parsed photo (`labels`: an ATR id
    per pixel, photo frame), sleeves aside, reaches LONG_TOP_REACH below the
    hip line, as a kameez or tunic does: then the parser's "skirt" under it is
    part of that top."""
    body = _body(landmarks, width, height)
    top = _old_top(labels, False, landmarks, width, height)
    top[_sleeve_region(landmarks, width, height, body.shoulder_span) > 0] = 0
    # A speck of mislabelled pixels doesn't make a top long.
    top = cv2.morphologyEx(top, cv2.MORPH_OPEN, _disc(body.shoulder_span * OLD_TOP_GROWTH))
    rows = np.flatnonzero(top.any(axis=1))
    return bool(len(rows)) and rows[-1] > body.hip_y + LONG_TOP_REACH * (body.hip_y - body.shoulder_y)


def clothes_aware_masks(landmarks, width, height, labels, ease=1.0, length="regular"):
    """(mask, lower) uint8 masks from the pose and the parsed photo (`labels`:
    an ATR id per pixel, photo frame). mask is what CatVTON repaints: the
    body-hugging clothing_mask (MASK_ALLOWANCE_PARSED) plus the collar of the
    shopper's own top between the chin and the neck line. lower is the rest of
    that top (grown by OLD_TOP_GROWTH) outside the mask: below the hem, its
    flare, loose sleeve edges, to be repainted as trousers and background.
    Neither touches the face (_protected) or the hands."""
    body = _body(landmarks, width, height, ease, length)
    _, hands = arm_masks(landmarks, width, height, body.shoulder_span)
    keep = cv2.bitwise_not(cv2.bitwise_or(hands, _protected(landmarks, width, height, labels, body)))
    include_skirt = wears_long_top(landmarks, width, height, labels)
    top = cv2.dilate(_old_top(labels, include_skirt, landmarks, width, height), _disc(body.shoulder_span * OLD_TOP_GROWTH))

    collar = top.copy()
    collar[body.neck_row :, :] = 0
    mask = clothing_mask(landmarks, width, height, ease, length, MASK_ALLOWANCE_PARSED)
    mask = cv2.bitwise_and(cv2.bitwise_or(mask, collar), keep)
    lower = cv2.bitwise_and(cv2.bitwise_and(top, cv2.bitwise_not(mask)), keep)
    return mask, lower


def _torso(body, width, height):
    """uint8 torso polygon through the band edges, from the shoulder line
    down to the hem row (straight down below the hips)."""
    left = [edge[0] for edge in body.bands]
    right = [edge[1] for edge in reversed(body.bands)]
    drop = np.float32([0, max(0.0, body.hem_row - body.hip_y)])
    hem = [body.bands[-1][0] + drop, body.bands[-1][1] + drop]
    torso = np.zeros((height, width), np.uint8)
    cv2.fillPoly(torso, [np.int32(left + hem + right)], 255)
    torso[body.hem_row :, :] = 0
    return torso


def colour_region(mask, landmarks, width, height, ease=1.0, sleeves="short"):
    """Soft uint8 region whose generated garment is colour corrected: the
    mask on the body, minus the arm parts the product leaves bare (forearms
    for short sleeves, whole arms for none), so bare skin is never pulled
    toward the product's colour. The torso always stays in."""
    region = cv2.min(mask, on_body(landmarks, width, height, ease))
    if sleeves == "long":
        return region
    body = _body(landmarks, width, height, ease)
    kernel = _disc(body.shoulder_span * MASK_ALLOWANCE * ease)
    bare = cv2.dilate(arm_capsules(landmarks, width, height, body.shoulder_span, upper=sleeves == "none"), kernel)
    bare = cv2.bitwise_and(bare, cv2.bitwise_not(cv2.dilate(_torso(body, width, height), kernel)))
    # Softened as on_body's edge, so a garment crossing it shows no seam.
    bare = cv2.GaussianBlur(bare, (0, 0), body.shoulder_span * BODY_EDGE_SOFTNESS)
    return cv2.min(region, cv2.bitwise_not(bare))


def _body_area(landmarks, width, height):
    bands, shoulder_span = body_bands(landmarks, width, height)
    return max(1, int((body_masks(landmarks, width, height, bands, shoulder_span)[0] > 0).sum()))


def leftover_share(landmarks, width, height, labels, include_skirt, ease=1.0, length="regular", sleeves="short"):
    """Share of the body area where a parsed try-on result (`labels`) still
    shows the shopper's own top outside where the product sits: the torso
    above the hem plus the arm parts its sleeves cover (upper arms for short,
    whole arms for long, none for none). The slack around them is everything
    the new garment may fill: the silhouette's fabric allowance, the mask's
    allowance, the blend's feather and OLD_TOP_GROWTH. include_skirt: whether
    the shopper's own top was a long one (wears_long_top on the original
    photo)."""
    body = _body(landmarks, width, height, ease, length)
    expected = _torso(body, width, height)
    if sleeves != "none":
        arms = arm_capsules(landmarks, width, height, body.shoulder_span, forearms=sleeves == "long")
        expected = cv2.bitwise_or(expected, arms)
    slack = body.shoulder_span * (FABRIC_ALLOWANCE + MASK_ALLOWANCE * ease + OLD_TOP_GROWTH)
    expected = cv2.dilate(expected, _disc(slack + FEATHER * model_pixel(width, height)))
    leftover = (_old_top(labels, include_skirt, landmarks, width, height) > 0) & (expected == 0)
    return float(leftover.sum()) / _body_area(landmarks, width, height)


# --- GPU calls ----------------------------------------------------------------


def _png(array):
    ok, encoded = cv2.imencode(".png", array)
    if not ok:
        raise TryOnError("ENCODE_FAILED")
    return encoded.tobytes()


def garment_on_white(product_image_bytes):
    """CatVTON expects an RGB garment photo; flatten transparency onto white."""
    image = decode_image(product_image_bytes, keep_alpha=True)
    if image is None:
        raise TryOnError("INVALID_PRODUCT_IMAGE")
    if image.shape[2] == 4:
        alpha = image[:, :, 3:4].astype(np.float32) / 255.0
        image = (image[:, :, :3] * alpha + 255 * (1 - alpha)).astype(np.uint8)
    return _png(image)


async def _optional_call(config, feature, files, data, timeout, retry=False):
    """Body of a 200 answer from an optional GPU endpoint (/parse, /inpaint),
    or None. A 404 (an older server) is remembered for FEATURE_RETRY_SECONDS;
    any other failure is logged and skipped, never raised. With `retry`, a
    dropped connection (not a timeout: the GPU is busy then) is tried once
    more: the tunnel sometimes drops a request."""
    url, token = config
    if not _supports(url, feature):
        return None
    if timeout < MIN_STEP_SECONDS:
        logger.warning(f"No time left for GPU /{feature}; try-on continues without it")
        return None
    for attempt in range(2 if retry else 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(f"{url}/{feature}", files=files, data=data, headers=_request_headers(token))
            break
        except httpx.TimeoutException as e:
            logger.warning(f"GPU /{feature} failed ({type(e).__name__}); try-on continues without it")
            return None
        except httpx.HTTPError as e:
            if retry and attempt == 0:
                logger.warning(f"GPU /{feature} dropped ({type(e).__name__}); trying once more")
                continue
            logger.warning(f"GPU /{feature} failed ({type(e).__name__}); try-on continues without it")
            return None
    if response.status_code == 404:
        _unsupported_features.setdefault(url, {})[feature] = time.monotonic()
        logger.info(f"GPU server has no /{feature}; try-ons skip it")
        return None
    if response.status_code != 200:
        logger.warning(f"GPU /{feature} answered {response.status_code}; try-on continues without it")
        return None
    return response.content


def _decode_labels(content):
    """A 2-D label map from a single-channel (or palette) PNG, scaled to
    MODEL_SIZE without blending ids; None when it isn't one."""
    try:
        with Image.open(io.BytesIO(content)) as image:
            labels = np.asarray(image)
    except (OSError, ValueError):
        return None
    if labels.ndim != 2 or not labels.size:
        return None
    return cv2.resize(labels.astype(np.uint8), MODEL_SIZE, interpolation=cv2.INTER_NEAREST)


def _time_left(deadline, cap):
    return min(cap, deadline - time.monotonic())


async def _parse(config, frame_jpeg, width, height, timeout=PARSE_TIMEOUT_SECONDS, retry=False):
    """ATR labels of a model-frame JPEG, mapped back to the width x height
    photo frame (nearest-neighbour); None when unsupported or failing."""
    files = {"image": ("image.jpg", frame_jpeg, "image/jpeg")}
    content = await _optional_call(config, "parse", files, {}, timeout, retry)
    if content is None:
        return None
    labels = _decode_labels(content)
    if labels is None:
        logger.warning("GPU /parse returned no label map; try-on continues without it")
        return None
    return labels_from_model_frame(labels, width, height)


async def _inpaint_trousers(config, image, lower, timeout=INPAINT_TIMEOUT_SECONDS):
    """`image` with the `lower` region repainted as plain trousers by the
    GPU's /inpaint and blended in like the garment; unchanged when that is
    unsupported or fails."""
    height, width = image.shape[:2]
    files = {
        "image": ("image.jpg", encode_jpeg(to_model_frame(image, cv2.BORDER_REPLICATE), PERSON_JPEG_QUALITY), "image/jpeg"),
        "mask": ("mask.png", _png(to_model_frame(lower, cv2.BORDER_CONSTANT)), "image/png"),
    }
    data = {
        "prompt": TROUSERS_PROMPT,
        "negative_prompt": TROUSERS_NEGATIVE_PROMPT,
        "steps": str(INPAINT_STEPS),
        "guidance": str(INPAINT_GUIDANCE),
        "seed": str(INPAINT_SEED),
    }
    content = await _optional_call(config, "inpaint", files, data, timeout)
    inpainted = decode_image(content) if content is not None else None
    if inpainted is None:
        if content is not None:
            logger.warning("GPU /inpaint returned no image; try-on continues without it")
        return image
    return composite_garment(image, from_model_frame(inpainted, width, height), lower)


def _debug_saver():
    """A function(name, image) saving one debug image of this try-on into
    DEBUG_DIR_ENV's folder, or None when debugging is off. Never raises."""
    folder = os.environ.get(DEBUG_DIR_ENV, "").strip()
    if not folder:
        return None
    stamp = time.strftime("%Y%m%d-%H%M%S")

    def save(name, image):
        try:
            os.makedirs(folder, exist_ok=True)
            cv2.imwrite(os.path.join(folder, f"{stamp}-{name}"), image)
        except (OSError, cv2.error) as e:
            logger.warning(f"Try-on debug image {name} not saved ({e})")

    return save


def _mask_overlay(photo, mask, lower):
    """The photo with the CatVTON mask tinted red and the repaint region
    blue, for the debug images."""
    overlay = photo.copy()
    overlay[mask > 127] = overlay[mask > 127] // 2 + np.uint8([0, 0, 127])
    if lower is not None:
        overlay[lower > 127] = overlay[lower > 127] // 2 + np.uint8([127, 0, 0])
    return overlay


async def generate_gpu_try_on(
    customer_image_bytes,
    product_image_bytes,
    pose,
    ease=1.0,
    config=None,
    length="regular",
    sleeves="short",
    deadline=None,
):
    """GpuTryOn(image, tip): a JPEG of the shopper's own photo (upright,
    longest side capped at try_on_compositing.MAX_OUTPUT_SIDE) with the garment
    generated by the remote CatVTON server blended into the clothing region,
    everything outside it the original photo; and FITTED_TOP_TIP when the
    shopper's own top still shows in it, else None. `sleeves` is the
    product's sleeve length (SLEEVE_LENGTHS; unknown counts as short).
    `deadline` (time.monotonic()) is when every GPU call must be done; by
    default TRY_ON_BUDGET_SECONDS from now. One try-on uses the GPU at a time.
    Raises TryOnError when the try-on itself fails (unconfigured, unreachable,
    timeout, bad response); the parse and inpaint steps never raise."""
    config = config or gpu_try_on_config()
    if not config:
        raise TryOnError("GPU_NOT_CONFIGURED")
    deadline = deadline if deadline is not None else time.monotonic() + TRY_ON_BUDGET_SECONDS
    async with _gpu_turn:
        return await _generate(customer_image_bytes, product_image_bytes, pose, ease, config, length, sleeves, deadline)


async def _generate(customer_image_bytes, product_image_bytes, pose, ease, config, length, sleeves, deadline):
    url, token = config
    debug = _debug_saver()
    landmarks = pose["landmarks"]
    sleeves = sleeves if sleeves in SLEEVE_LENGTHS else "short"

    # Upright pixels, as the pose (and so the mask) saw them: the server
    # ignores EXIF orientation.
    photo = decode_image(customer_image_bytes)
    if photo is None:
        raise TryOnError("INVALID_CUSTOMER_IMAGE")
    photo = fit_within(photo)
    height, width = photo.shape[:2]
    person_jpeg = encode_jpeg(to_model_frame(photo, cv2.BORDER_REPLICATE), PERSON_JPEG_QUALITY)

    mask, lower, long_top = clothing_mask(landmarks, width, height, ease, length), None, False
    labels = await _parse(config, person_jpeg, width, height, _time_left(deadline, PARSE_TIMEOUT_SECONDS), retry=True)
    if labels is not None:
        try:
            long_top = wears_long_top(landmarks, width, height, labels)
            mask, lower = clothes_aware_masks(landmarks, width, height, labels, ease, length)
        except (cv2.error, ValueError, IndexError) as e:
            logger.warning(f"Clothes-aware mask failed ({e}); using the pose mask")
            labels, lower = None, None
    if debug:
        if labels is not None:
            debug("1-clothes.png", cv2.applyColorMap((labels * 14).astype(np.uint8), cv2.COLORMAP_JET))
        debug("2-masks.jpg", _mask_overlay(photo, mask, lower))

    product_colour = product_garment_colour(product_image_bytes)
    files = {
        "person": ("person.jpg", person_jpeg, "image/jpeg"),
        "garment": ("garment.png", garment_on_white(product_image_bytes), "image/png"),
        "mask": ("mask.png", _png(to_model_frame(mask, cv2.BORDER_CONSTANT)), "image/png"),
    }
    data = {"steps": str(INFERENCE_STEPS), "guidance": str(GUIDANCE_SCALE)}

    timeout = _time_left(deadline, GPU_TIMEOUT_SECONDS)
    if timeout < MIN_STEP_SECONDS:
        raise TryOnError("GPU_TIMEOUT")
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(f"{url}/tryon", files=files, data=data, headers=_request_headers(token))
    except httpx.TimeoutException:
        raise TryOnError("GPU_TIMEOUT")
    except httpx.HTTPError:
        raise TryOnError("GPU_UNREACHABLE")

    generated = decode_image(response.content) if response.status_code == 200 else None
    if generated is None:
        raise TryOnError(f"GPU_ERROR:{response.status_code}")

    generated = from_model_frame(generated, width, height)
    region = colour_region(mask, landmarks, width, height, ease, sleeves)
    generated = correct_garment_colour(generated, region, torso_core(landmarks, width, height), product_colour)
    result = composite_garment(photo, generated, mask)
    if debug:
        debug("3-catvton.jpg", result)

    if lower is not None and (lower > 127).sum() > MIN_TROUSERS_AREA * _body_area(landmarks, width, height):
        result = await _inpaint_trousers(config, result, lower, _time_left(deadline, INPAINT_TIMEOUT_SECONDS))
        if debug:
            debug("4-repainted.jpg", result)

    tip = None
    # Only when the first parse worked: a server that just failed it would
    # most likely fail (or time out on) this one too.
    if labels is not None:
        result_jpeg = encode_jpeg(to_model_frame(result, cv2.BORDER_REPLICATE), PERSON_JPEG_QUALITY)
        final = await _parse(config, result_jpeg, width, height, _time_left(deadline, PARSE_TIMEOUT_SECONDS))
        try:
            if final is not None:
                share = leftover_share(landmarks, width, height, final, long_top, ease, length, sleeves)
                tip = FITTED_TOP_TIP if share > FITTED_TOP_LEFTOVER else None
                logger.info(f"Try-on leftover of the shopper's own top: {share:.3f} of the body")
        except (cv2.error, ValueError, IndexError) as e:
            logger.warning(f"Leftover check failed ({e}); try-on returned without it")
    return GpuTryOn(encode_jpeg(result), tip)
