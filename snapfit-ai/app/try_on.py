"""Virtual try-on: warps a merchant's flat-lay product photo onto a customer's
photo.

The product's 4 anchor points (shoulders, hips) and two interpolated bands
(chest, waist) are mapped onto the customer's body with a piecewise-affine
grid, so the garment follows the torso rather than one flat perspective
plane. Body widths at each band use the same anthropometric breadth model as
measurement_engine. The garment is clipped to a landmark-built body
silhouette (with fabric allowance), forearms stay on top of it, and its
brightness is matched to the scene.

Silhouette from landmarks rather than MediaPipe's segmentation mask: reading
that mask in the pinned mediapipe 1.0.1 aborts the whole process
(native "1 == ChannelSize()" check failure).
"""

import hashlib
import os
from collections import OrderedDict

import cv2
import httpx
import numpy as np

from app.config import (
    CHEST_BREADTH_PER_SHOULDER_SPAN,
    HIP_BREADTH_PER_HIP_JOINT_SPAN,
    SHOULDER_WIDTH_PER_JOINT_SPAN,
    WAIST_BREADTH_PER_HIP_BREADTH,
)
from app.pose_estimator import extract_landmarks
from app.utils import decode_image

BACKEND_API_URL = os.environ.get("BACKEND_API_URL", "http://localhost:5000/api")
HTTP_TIMEOUT_SECONDS = 10

ANCHOR_KEYS = ("shoulderLeft", "shoulderRight", "hipLeft", "hipRight")

# Where the interpolated chest and waist bands sit, as a fraction of the way
# from the shoulder line to the hip line.
CHEST_BAND = 0.3
WAIST_BAND = 0.65

# Garment "ease": how much wider than the body the garment is drawn, from how
# the recommended size's range compares with the shopper's measurement.
EASE_MIN = 0.97
EASE_MAX = 1.15
EASE_MEASUREMENTS = ("chest", "waist", "hip")

# Body silhouette, as fractions of the shoulder-joint span.
UPPER_ARM_WIDTH = 0.32
FOREARM_WIDTH = 0.26
HAND_RADIUS = 0.14
THIGH_WIDTH = 0.42
FABRIC_ALLOWANCE = 0.08
# Garments hang below the hip line (hems, tunics): the torso silhouette is
# extended this fraction of the shoulder-to-hip distance below the hips.
HEM_ALLOWANCE = 0.4
VISIBLE = 0.5

# Plain-background detection for product photos without transparency.
BACKGROUND_DISTANCE_THRESHOLD = 30.0
UNIFORM_CORNER_STD = 12.0
GRABCUT_MAX_SIDE = 400
GRABCUT_ITERATIONS = 3
GRABCUT_INSET = 0.03

CROP_PADDING = 3
# Product photos are downscaled to this multiple of their on-body size.
PRESCALE_HEADROOM = 1.25

# Lighting match: one global gain from the scene brightness around the person,
# relative to a neutral exposure. (A per-pixel shading transfer from the torso
# printed the shopper's own clothes and arms onto light garments.)
EXPOSURE_RING_PX = 61
NEUTRAL_SCENE_LUMA = 160.0
EXPOSURE_STRENGTH = 0.3
EXPOSURE_MIN = 0.85
EXPOSURE_MAX = 1.05

PRODUCT_ALPHA_CACHE_SIZE = 32
_product_alpha_cache = OrderedDict()


class TryOnError(Exception):
    """Raised for try-on-specific failures, distinct from pose estimation errors."""


async def fetch_product_anchor_data(merchant_id, product_id):
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        response = await client.get(
            f"{BACKEND_API_URL}/products/anchor-points",
            params={"merchantId": merchant_id, "productId": product_id},
        )

    if response.status_code == 404:
        raise TryOnError("TRYON_NOT_AVAILABLE")
    response.raise_for_status()

    data = response.json()
    return data["anchorPoints"], data["imageUrl"]


async def fetch_image_bytes(url):
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        response = await client.get(url)
    response.raise_for_status()
    return response.content


def garment_ease(match):
    """Width factor for the garment from a size match (recommend_size output):
    the recommended size's range midpoint over the shopper's own measurement,
    so a size up is drawn looser. 1.0 without measurements."""
    if not match:
        return 1.0
    entry = next((s for s in match.get("size_comparison", []) if s["label"] == match.get("recommended_size")), None)
    for name in EASE_MEASUREMENTS:
        m = next((pm for pm in (entry or {}).get("perMeasurement", []) if pm["name"] == name), None)
        if m and m["userValue"] > 0:
            return float(np.clip((m["min"] + m["max"]) / 2 / m["userValue"], EASE_MIN, EASE_MAX))
    return 1.0


# --- product alpha ------------------------------------------------------------


def _corner_distance_alpha(image):
    height, width = image.shape[:2]
    corners = np.array(
        [image[0, 0], image[0, width - 1], image[height - 1, 0], image[height - 1, width - 1]], dtype=np.float32
    )
    distance = np.linalg.norm(image.astype(np.float32) - corners.mean(axis=0), axis=2)
    return np.clip((distance - BACKGROUND_DISTANCE_THRESHOLD) / BACKGROUND_DISTANCE_THRESHOLD, 0.0, 1.0), corners


def _grabcut_alpha(image):
    height, width = image.shape[:2]
    scale = min(1.0, GRABCUT_MAX_SIDE / max(height, width))
    small = cv2.resize(image, (max(1, int(width * scale)), max(1, int(height * scale))), interpolation=cv2.INTER_AREA)
    sh, sw = small.shape[:2]
    inset_x, inset_y = max(1, int(sw * GRABCUT_INSET)), max(1, int(sh * GRABCUT_INSET))
    mask = np.zeros((sh, sw), np.uint8)
    background, foreground = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(
        small, mask, (inset_x, inset_y, sw - 2 * inset_x, sh - 2 * inset_y), background, foreground,
        GRABCUT_ITERATIONS, cv2.GC_INIT_WITH_RECT,
    )
    alpha = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 1.0, 0.0).astype(np.float32)
    return cv2.resize(alpha, (width, height), interpolation=cv2.INTER_LINEAR)


def product_alpha(product_bytes, product_image):
    """Garment mask (0-1 float) for a decoded product photo, cached by content:
    the PNG's own alpha when it has one; for a plain background, distance from
    the corner colour; otherwise GrabCut."""
    key = hashlib.sha1(product_bytes).hexdigest()
    if key in _product_alpha_cache:
        _product_alpha_cache.move_to_end(key)
        return _product_alpha_cache[key]

    if product_image.shape[2] == 4:
        alpha = product_image[:, :, 3].astype(np.float32) / 255.0
    else:
        alpha, corners = _corner_distance_alpha(product_image)
        if corners.std(axis=0).max() > UNIFORM_CORNER_STD:
            alpha = _grabcut_alpha(product_image)
        alpha = cv2.GaussianBlur(alpha, (5, 5), 0)

    _product_alpha_cache[key] = alpha
    if len(_product_alpha_cache) > PRODUCT_ALPHA_CACHE_SIZE:
        _product_alpha_cache.popitem(last=False)
    return alpha


# --- body geometry ------------------------------------------------------------


def _to_px(point, width, height):
    return np.array([point["x"] * width, point["y"] * height], dtype=np.float32)


def _resolve_screen_pair(landmarks, left_name, right_name):
    # MediaPipe's LEFT_*/RIGHT_* are anatomical (the subject's own left/right), not
    # screen position -- facing the camera, a person's anatomical right lands on
    # screen-left. Rather than hardcode that mapping (fragile if capture ever adds
    # mirroring), resolve it from the actual detected x-coordinates: whichever
    # landmark has the smaller x is on screen-left, matching how a merchant places
    # the product's shoulderLeft/hipLeft anchor while looking at the flat-lay photo.
    left = landmarks[left_name]
    right = landmarks[right_name]
    return (left, right) if left["x"] <= right["x"] else (right, left)


def body_bands(landmarks, width, height, ease=1.0):
    """Screen-left/right edge points of the body at the shoulder, chest, waist
    and hip bands, in pixels: [(left, right), ...] top to bottom."""
    shoulder_l, shoulder_r = (_to_px(p, width, height) for p in _resolve_screen_pair(landmarks, "LEFT_SHOULDER", "RIGHT_SHOULDER"))
    hip_l, hip_r = (_to_px(p, width, height) for p in _resolve_screen_pair(landmarks, "LEFT_HIP", "RIGHT_HIP"))

    shoulder_span = float(np.linalg.norm(shoulder_r - shoulder_l))
    hip_span = float(np.linalg.norm(hip_r - hip_l))
    hip_breadth = hip_span * HIP_BREADTH_PER_HIP_JOINT_SPAN
    half_widths = [
        shoulder_span * SHOULDER_WIDTH_PER_JOINT_SPAN / 2,
        shoulder_span * CHEST_BREADTH_PER_SHOULDER_SPAN / 2,
        hip_breadth * WAIST_BREADTH_PER_HIP_BREADTH / 2,
        hip_breadth / 2,
    ]

    shoulder_mid, hip_mid = (shoulder_l + shoulder_r) / 2, (hip_l + hip_r) / 2
    shoulder_dir = (shoulder_r - shoulder_l) / max(shoulder_span, 1e-6)
    hip_dir = (hip_r - hip_l) / max(hip_span, 1e-6)
    bands = []
    for fraction, half_width in zip((0.0, CHEST_BAND, WAIST_BAND, 1.0), half_widths):
        centre = shoulder_mid + (hip_mid - shoulder_mid) * fraction
        direction = shoulder_dir + (hip_dir - shoulder_dir) * fraction
        direction /= max(float(np.linalg.norm(direction)), 1e-6)
        offset = direction * half_width * ease
        bands.append((centre - offset, centre + offset))
    return bands, shoulder_span


def _capsule(mask, a, b, width):
    cv2.line(mask, tuple(int(v) for v in a), tuple(int(v) for v in b), 255, max(1, int(width)), cv2.LINE_AA)


def body_masks(landmarks, width, height, bands, shoulder_span):
    """(body, forearms) uint8 masks built from landmarks: torso polygon through
    the band edges plus neck, arms and thighs; forearms + hands separately."""
    p = {name: _to_px(lm, width, height) for name, lm in landmarks.items()}
    body = np.zeros((height, width), np.uint8)
    hip_left, hip_right = bands[-1]
    drop = ((hip_left + hip_right) / 2 - (bands[0][0] + bands[0][1]) / 2) * HEM_ALLOWANCE
    hem = (hip_left + drop, hip_right + drop)
    torso = np.array([edge[0] for edge in bands] + [hem[0], hem[1]] + [edge[1] for edge in reversed(bands)], dtype=np.int32)
    cv2.fillPoly(body, [torso], 255, cv2.LINE_AA)

    shoulder_mid = (p["LEFT_SHOULDER"] + p["RIGHT_SHOULDER"]) / 2
    _capsule(body, shoulder_mid, (shoulder_mid + p["NOSE"]) / 2, shoulder_span * 0.35)
    for side in ("LEFT", "RIGHT"):
        _capsule(body, p[f"{side}_SHOULDER"], p[f"{side}_ELBOW"], shoulder_span * UPPER_ARM_WIDTH)
        _capsule(body, p[f"{side}_HIP"], p[f"{side}_KNEE"], shoulder_span * THIGH_WIDTH)

    forearms = np.zeros((height, width), np.uint8)
    for side in ("LEFT", "RIGHT"):
        # Only forearms the model can actually see (hidden ones, e.g. behind
        # the back, would punch holes in the garment).
        if min(landmarks[f"{side}_ELBOW"]["visibility"], landmarks[f"{side}_WRIST"]["visibility"]) < VISIBLE:
            continue
        _capsule(forearms, p[f"{side}_ELBOW"], p[f"{side}_WRIST"], shoulder_span * FOREARM_WIDTH)
        cv2.circle(forearms, tuple(int(v) for v in p[f"{side}_WRIST"]), int(shoulder_span * HAND_RADIUS), 255, -1, cv2.LINE_AA)

    allowance = max(1, int(shoulder_span * FABRIC_ALLOWANCE))
    body = cv2.dilate(body, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * allowance + 1, 2 * allowance + 1)))
    return cv2.bitwise_or(body, forearms), forearms


# --- piecewise warp -----------------------------------------------------------


def _product_bands(anchor_points, width, height):
    shoulder_l = _to_px(anchor_points["shoulderLeft"], width, height)
    shoulder_r = _to_px(anchor_points["shoulderRight"], width, height)
    hip_l = _to_px(anchor_points["hipLeft"], width, height)
    hip_r = _to_px(anchor_points["hipRight"], width, height)
    if min(hip_l[1], hip_r[1]) <= max(shoulder_l[1], shoulder_r[1]):
        raise TryOnError("INVALID_ANCHOR_POINTS")
    return [
        (shoulder_l + (hip_l - shoulder_l) * f, shoulder_r + (hip_r - shoulder_r) * f)
        for f in (0.0, CHEST_BAND, WAIST_BAND, 1.0)
    ]


def _extend_row(src_pair, dst_pair, src_width):
    """Adds the product's left/right image borders to one row, mapped with the
    row's own horizontal scale so sleeves and edges beyond the anchors follow."""
    (sl, sr), (dl, dr) = src_pair, dst_pair
    scale = np.linalg.norm(dr - dl) / max(float(np.linalg.norm(sr - sl)), 1e-6)
    direction = (dr - dl) / max(float(np.linalg.norm(dr - dl)), 1e-6)
    src_row = [np.array([0.0, sl[1]], np.float32), sl, sr, np.array([src_width, sr[1]], np.float32)]
    dst_row = [dl - direction * sl[0] * scale, dl, dr, dr + direction * (src_width - sr[0]) * scale]
    return src_row, dst_row


def build_warp_grid(src_bands, dst_bands, src_width, src_height):
    """4-column grid rows (top border, shoulder, chest, waist, hip, bottom
    border) of matching source/destination points."""
    src_rows, dst_rows = zip(*(_extend_row(s, d, src_width) for s, d in zip(src_bands, dst_bands)))
    src_rows, dst_rows = list(src_rows), list(dst_rows)

    src_span = (src_rows[-1][1][1] + src_rows[-1][2][1]) / 2 - (src_rows[0][1][1] + src_rows[0][2][1]) / 2
    dst_span = float(np.linalg.norm((dst_rows[-1][1] + dst_rows[-1][2]) / 2 - (dst_rows[0][1] + dst_rows[0][2]) / 2))
    vertical_scale = dst_span / max(float(src_span), 1e-6)

    def shifted(row_src, row_dst, target_y):
        src = [np.array([pt[0], target_y], np.float32) for pt in row_src]
        dst = [pt + np.array([0.0, (target_y - s[1]) * vertical_scale], np.float32) for pt, s in zip(row_dst, row_src)]
        return src, dst

    top_src, top_dst = shifted(src_rows[0], dst_rows[0], 0.0)
    bottom_src, bottom_dst = shifted(src_rows[-1], dst_rows[-1], float(src_height))
    return [top_src] + src_rows + [bottom_src], [top_dst] + dst_rows + [bottom_dst]


def _warp_triangle(src_image, out, src_tri, dst_tri):
    """Affine-warps one source triangle into `out` (in place), working inside
    the destination triangle's bounding box only."""
    out_h, out_w = out.shape[:2]
    x, y, w, h = cv2.boundingRect(np.float32([dst_tri]))
    x0, y0, x1, y1 = max(x, 0), max(y, 0), min(x + w, out_w), min(y + h, out_h)
    if x1 <= x0 or y1 <= y0:
        return
    # Padded source crop: seam pixels sample just outside their own triangle,
    # and an unpadded crop would hand them the empty border (visible lines).
    src_h, src_w = src_image.shape[:2]
    bx, by, bw, bh = cv2.boundingRect(np.float32([src_tri]))
    sx, sy = max(bx - CROP_PADDING, 0), max(by - CROP_PADDING, 0)
    sw, sh = min(bx + bw + CROP_PADDING, src_w) - sx, min(by + bh + CROP_PADDING, src_h) - sy
    if sw <= 0 or sh <= 0:
        return
    src_crop = src_image[sy : sy + sh, sx : sx + sw]
    src_local = np.float32([[px - sx, py - sy] for px, py in src_tri])
    dst_local = np.float32([[px - x0, py - y0] for px, py in dst_tri])
    transform = cv2.getAffineTransform(src_local, dst_local)
    warped = cv2.warpAffine(
        src_crop, transform, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0
    )
    # Hard-edged (not anti-aliased) and grown by its 1px outline, so
    # neighbouring triangles overlap slightly instead of leaving seam lines.
    mask = np.zeros((y1 - y0, x1 - x0), np.uint8)
    triangle = np.int32(np.round(dst_local))
    cv2.fillConvexPoly(mask, triangle, 1)
    cv2.polylines(mask, [triangle], True, 1, 1)
    region = out[y0:y1, x0:x1]
    inside = mask.astype(bool)
    region[inside] = warped[inside]


def _prescale_product(product_rgba, anchor_points, dst_bands):
    """Area-downscales a large product photo to about its on-body size before
    warping. Bilinear warping alone samples a big image too sparsely and turns
    fabric texture into moire streaks. Anchors are normalised, so they still
    apply after resizing."""
    p_height, p_width = product_rgba.shape[:2]
    src_span = abs(anchor_points["shoulderRight"]["x"] - anchor_points["shoulderLeft"]["x"]) * p_width
    dst_span = float(np.linalg.norm(dst_bands[0][1] - dst_bands[0][0]))
    scale = PRESCALE_HEADROOM * dst_span / max(src_span, 1e-6)
    if scale >= 1:
        return product_rgba
    size = (max(1, round(p_width * scale)), max(1, round(p_height * scale)))
    return cv2.resize(product_rgba, size, interpolation=cv2.INTER_AREA)


def piecewise_warp(src_image, src_grid, dst_grid, out_size):
    """Warps an HxWxC float32 image through the grid's quads (2 triangles each)."""
    out_w, out_h = out_size
    out = np.zeros((out_h, out_w, src_image.shape[2]), np.float32)
    for r in range(len(src_grid) - 1):
        for c in range(len(src_grid[r]) - 1):
            s = [src_grid[r][c], src_grid[r][c + 1], src_grid[r + 1][c + 1], src_grid[r + 1][c]]
            d = [dst_grid[r][c], dst_grid[r][c + 1], dst_grid[r + 1][c + 1], dst_grid[r + 1][c]]
            _warp_triangle(src_image, out, [s[0], s[1], s[2]], [d[0], d[1], d[2]])
            _warp_triangle(src_image, out, [s[0], s[2], s[3]], [d[0], d[2], d[3]])
    return out


# --- compositing --------------------------------------------------------------


def _soft(mask):
    return cv2.GaussianBlur(mask, (5, 5), 0).astype(np.float32) / 255.0


def _match_scene_exposure(garment_bgr, customer_bgr, body_mask):
    """Darkens/brightens the garment by one mild global gain from the scene's
    brightness right around the person (not the person: their own clothes and
    arms would otherwise be printed onto the garment)."""
    near = cv2.dilate(body_mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (EXPOSURE_RING_PX, EXPOSURE_RING_PX)))
    ring = (near > 0) & (body_mask == 0)
    if not ring.any():
        return garment_bgr
    luma = cv2.cvtColor(customer_bgr.astype(np.uint8), cv2.COLOR_BGR2GRAY)
    gain = np.clip((float(luma[ring].mean()) / NEUTRAL_SCENE_LUMA) ** EXPOSURE_STRENGTH, EXPOSURE_MIN, EXPOSURE_MAX)
    return np.clip(garment_bgr * gain, 0, 255)


def generate_try_on(customer_image_bytes, product_image_bytes, anchor_points, pose=None, ease=1.0):
    """Warps a flat product image onto a customer's photo. Takes plain
    bytes/dicts, returns JPEG bytes the size of the customer photo. Pass an
    already-extracted `pose` to skip running pose detection a second time, and
    an `ease` from garment_ease() to draw a looser size wider.
    """
    if not anchor_points or any(key not in anchor_points for key in ANCHOR_KEYS):
        raise TryOnError("TRYON_NOT_AVAILABLE")

    if pose is None:
        pose = extract_landmarks(customer_image_bytes)
    landmarks = pose["landmarks"]

    customer_image = decode_image(customer_image_bytes)
    if customer_image is None:
        raise TryOnError("INVALID_CUSTOMER_IMAGE")
    height, width = customer_image.shape[:2]

    product_image = decode_image(product_image_bytes, keep_alpha=True)
    if product_image is None:
        raise TryOnError("INVALID_PRODUCT_IMAGE")
    alpha = product_alpha(product_image_bytes, product_image)
    dst_bands, shoulder_span = body_bands(landmarks, width, height, ease)
    product_rgba = _prescale_product(
        np.dstack([product_image[:, :, :3].astype(np.float32), alpha * 255.0]), anchor_points, dst_bands
    )
    p_height, p_width = product_rgba.shape[:2]
    src_grid, dst_grid = build_warp_grid(_product_bands(anchor_points, p_width, p_height), dst_bands, p_width, p_height)

    warped = piecewise_warp(product_rgba, src_grid, dst_grid, (width, height))
    garment, garment_alpha = warped[:, :, :3], warped[:, :, 3] / 255.0

    body, forearms = body_masks(landmarks, width, height, dst_bands, shoulder_span)
    garment_alpha *= _soft(body) * (1.0 - _soft(forearms))

    garment = _match_scene_exposure(garment, customer_image, body)

    composited = customer_image.astype(np.float32) * (1 - garment_alpha[..., None]) + garment * garment_alpha[..., None]
    success, encoded = cv2.imencode(".jpg", np.clip(composited, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not success:
        raise TryOnError("ENCODE_FAILED")
    return encoded.tobytes()
