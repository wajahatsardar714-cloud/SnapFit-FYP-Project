"""Photorealistic try-on on a remote GPU (CatVTON, see gpu/README.md).

SnapFit sends the shopper's photo, the product photo and a clothing mask
built from its own MediaPipe pose (so the GPU side needs no DensePose), and
gets a 768x1024 JPEG back. Configured with TRYON_GPU_URL / TRYON_GPU_TOKEN;
when unset or failing, callers fall back to the local warp try-on.
"""

import os

import cv2
import httpx
import numpy as np

from app.try_on import TryOnError, body_bands, body_masks
from app.utils import decode_image

GPU_TIMEOUT_SECONDS = 120
# Mask allowance beyond the body for the garment region, as a fraction of
# shoulder span; scaled up by the size ease so a looser size gets more room.
MASK_ALLOWANCE = 0.12
# How far below the hip line a top may reach, as a fraction of the
# shoulder-to-hip distance (about the crotch line; lower and the model starts
# repainting trousers).
HEM_BELOW_HIPS = 0.2
INFERENCE_STEPS = 30
GUIDANCE_SCALE = 2.5


def _request_headers(token):
    # ngrok's free tier shows browsers an interstitial page; this header tells it
    # this is an API call (other tunnels ignore it).
    return {"X-Token": token, "ngrok-skip-browser-warning": "1"}


def gpu_try_on_config():
    """(url, token) when the GPU try-on is configured, else None."""
    url = os.environ.get("TRYON_GPU_URL", "").strip().rstrip("/")
    token = os.environ.get("TRYON_GPU_TOKEN", "").strip()
    return (url, token) if url and token else None


def clothing_mask(landmarks, width, height, ease=1.0):
    """Upper-body garment region (torso + upper arms), as a PNG-ready uint8
    mask: the area the model may repaint. Looser sizes (ease > 1) get a wider
    mask so the generated garment can sit looser."""
    bands, shoulder_span = body_bands(landmarks, width, height, ease)
    body, forearms = body_masks(landmarks, width, height, bands, shoulder_span)
    allowance = max(1, int(shoulder_span * MASK_ALLOWANCE * ease))
    grown = cv2.dilate(body, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * allowance + 1, 2 * allowance + 1)))
    # Keep the face and the legs out of the repaint region: from the neck
    # (halfway between mouth and shoulder line) down to the hem line.
    shoulder_y = (bands[0][0][1] + bands[0][1][1]) / 2
    hip_y = (bands[-1][0][1] + bands[-1][1][1]) / 2
    mouth_y = (landmarks["MOUTH_LEFT"]["y"] + landmarks["MOUTH_RIGHT"]["y"]) / 2 * height
    head_limit = int(mouth_y + 0.5 * (shoulder_y - mouth_y))
    hem_limit = int(hip_y + HEM_BELOW_HIPS * (hip_y - shoulder_y))
    grown[: max(0, head_limit), :] = 0
    grown[max(0, hem_limit) :, :] = 0
    return cv2.bitwise_and(grown, cv2.bitwise_not(forearms))


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


async def generate_gpu_try_on(customer_image_bytes, product_image_bytes, pose, ease=1.0, config=None):
    """JPEG bytes from the remote CatVTON server. Raises TryOnError on any
    failure (unconfigured, unreachable, timeout, bad response)."""
    config = config or gpu_try_on_config()
    if not config:
        raise TryOnError("GPU_NOT_CONFIGURED")
    url, token = config

    dimensions = pose["image_dimensions"]
    mask = clothing_mask(pose["landmarks"], dimensions["width"], dimensions["height"], ease)
    files = {
        "person": ("person.jpg", customer_image_bytes, "image/jpeg"),
        "garment": ("garment.png", garment_on_white(product_image_bytes), "image/png"),
        "mask": ("mask.png", _png(mask), "image/png"),
    }
    data = {"steps": str(INFERENCE_STEPS), "guidance": str(GUIDANCE_SCALE)}

    try:
        async with httpx.AsyncClient(timeout=GPU_TIMEOUT_SECONDS) as client:
            response = await client.post(f"{url}/tryon", files=files, data=data, headers=_request_headers(token))
    except httpx.TimeoutException:
        raise TryOnError("GPU_TIMEOUT")
    except httpx.HTTPError:
        raise TryOnError("GPU_UNREACHABLE")

    if response.status_code != 200 or not response.content.startswith(b"\xff\xd8"):
        raise TryOnError(f"GPU_ERROR:{response.status_code}")
    return response.content
