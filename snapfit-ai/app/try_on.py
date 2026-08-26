import os

import cv2
import httpx
import numpy as np

from app.pose_estimator import extract_landmarks

BACKEND_API_URL = os.environ.get("BACKEND_API_URL", "http://localhost:5000/api")
HTTP_TIMEOUT_SECONDS = 10
BACKGROUND_DISTANCE_THRESHOLD = 30.0

ANCHOR_KEYS = ("shoulderLeft", "shoulderRight", "hipLeft", "hipRight")


class TryOnError(Exception):
    """Raised for try-on-specific failures, distinct from pose estimation errors."""


async def fetch_product_anchor_data(merchant_id, product_id):
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        response = await client.get(
            f"{BACKEND_API_URL}/products/anchor-points",
            params={"merchantId": merchant_id, "productId": product_id},
        )

    if response.status_code == 404:
        raise TryOnError("PRODUCT_ANCHOR_POINTS_NOT_FOUND")
    response.raise_for_status()

    data = response.json()
    return data["anchorPoints"], data["imageUrl"]


async def fetch_image_bytes(url):
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        response = await client.get(url)
    response.raise_for_status()
    return response.content


def _to_px(point, width, height):
    return [point["x"] * width, point["y"] * height]


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


def _build_alpha_mask(product_image):
    # RGBA product photo: use its own alpha channel as the garment mask.
    if product_image.shape[2] == 4:
        alpha = product_image[:, :, 3].astype(np.float32) / 255.0
        return alpha, product_image[:, :, :3]

    # No alpha channel (a plain JPG, the common case for merchant photos): assume a
    # roughly uniform background (typical flat-lay product photography) sampled
    # from the four corners, and treat pixels far from that color as the garment.
    height, width = product_image.shape[:2]
    corners = np.array(
        [
            product_image[0, 0],
            product_image[0, width - 1],
            product_image[height - 1, 0],
            product_image[height - 1, width - 1],
        ],
        dtype=np.float32,
    )
    background_color = corners.mean(axis=0)

    distance = np.linalg.norm(product_image.astype(np.float32) - background_color, axis=2)
    alpha = np.clip((distance - BACKGROUND_DISTANCE_THRESHOLD) / BACKGROUND_DISTANCE_THRESHOLD, 0.0, 1.0)
    alpha = cv2.GaussianBlur(alpha, (5, 5), 0)
    return alpha, product_image


def generate_try_on(customer_image_bytes, product_image_bytes, anchor_points):
    """Warps a flat product image onto a customer's photo via 4 corresponding
    points (product anchor points -> the customer's own BlazePose landmarks).

    Independently callable: takes plain bytes/dicts in, returns JPEG bytes out --
    no dependency on the size-recommendation request/response shape.
    """
    for key in ANCHOR_KEYS:
        if key not in anchor_points:
            raise TryOnError(f"MISSING_ANCHOR_POINT:{key}")

    pose = extract_landmarks(customer_image_bytes)
    landmarks = pose["landmarks"]
    height = pose["image_dimensions"]["height"]
    width = pose["image_dimensions"]["width"]

    shoulder_left, shoulder_right = _resolve_screen_pair(landmarks, "LEFT_SHOULDER", "RIGHT_SHOULDER")
    hip_left, hip_right = _resolve_screen_pair(landmarks, "LEFT_HIP", "RIGHT_HIP")

    dst_points = np.float32(
        [
            _to_px(shoulder_left, width, height),
            _to_px(shoulder_right, width, height),
            _to_px(hip_left, width, height),
            _to_px(hip_right, width, height),
        ]
    )

    product_array = np.frombuffer(product_image_bytes, dtype=np.uint8)
    product_image = cv2.imdecode(product_array, cv2.IMREAD_UNCHANGED)
    if product_image is None:
        raise TryOnError("INVALID_PRODUCT_IMAGE")

    p_height, p_width = product_image.shape[:2]
    src_points = np.float32([_to_px(anchor_points[key], p_width, p_height) for key in ANCHOR_KEYS])

    alpha_mask, product_rgb = _build_alpha_mask(product_image)

    customer_array = np.frombuffer(customer_image_bytes, dtype=np.uint8)
    customer_image = cv2.imdecode(customer_array, cv2.IMREAD_COLOR)
    if customer_image is None:
        raise TryOnError("INVALID_CUSTOMER_IMAGE")

    transform = cv2.getPerspectiveTransform(src_points, dst_points)
    warped_rgb = cv2.warpPerspective(product_rgb, transform, (width, height))
    warped_alpha = cv2.warpPerspective(alpha_mask, transform, (width, height), borderValue=0)

    alpha_3ch = warped_alpha[:, :, None]
    composited = customer_image.astype(np.float32) * (1 - alpha_3ch) + warped_rgb.astype(np.float32) * alpha_3ch
    composited = np.clip(composited, 0, 255).astype(np.uint8)

    success, encoded = cv2.imencode(".jpg", composited)
    if not success:
        raise TryOnError("ENCODE_FAILED")
    return encoded.tobytes()
