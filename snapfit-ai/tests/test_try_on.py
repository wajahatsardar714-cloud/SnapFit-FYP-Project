import asyncio
import base64
import io

import cv2
import httpx
import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import main, try_on
from app.try_on import (
    TryOnError,
    body_bands,
    fetch_product_anchor_data,
    garment_ease,
    generate_try_on,
    product_alpha,
)

ANCHORS = {
    "shoulderLeft": {"x": 0.25, "y": 0.15},
    "shoulderRight": {"x": 0.75, "y": 0.15},
    "hipLeft": {"x": 0.25, "y": 0.8},
    "hipRight": {"x": 0.75, "y": 0.8},
}
GARMENT_BGR = (40, 40, 200)
MARKER_BGR = (220, 60, 0)
CUSTOMER_GRAY = 128


def _encode(array, fmt):
    ok, buf = cv2.imencode(fmt, array)
    assert ok
    return buf.tobytes()


def _product_png(width=400, height=500):
    """Transparent PNG: a garment rectangle with a small blue marker exactly
    on each anchor point."""
    image = np.zeros((height, width, 4), np.uint8)
    cv2.rectangle(image, (60, 40), (340, 460), (*GARMENT_BGR, 255), -1)
    for point in ANCHORS.values():
        cx, cy = int(point["x"] * width), int(point["y"] * height)
        cv2.rectangle(image, (cx - 6, cy - 6), (cx + 6, cy + 6), (*MARKER_BGR, 255), -1)
    return _encode(image, ".png")


def _customer_jpeg(width=768, height=1024):
    return _encode(np.full((height, width, 3), CUSTOMER_GRAY, np.uint8), ".jpg")


def _pose(fixture):
    return {"landmarks": fixture["landmarks"], "image_dimensions": {"width": 768, "height": 1024}}


@pytest.fixture(autouse=True)
def clear_alpha_cache():
    try_on._product_alpha_cache.clear()


def _decode(jpeg_bytes):
    return cv2.imdecode(np.frombuffer(jpeg_bytes, np.uint8), cv2.IMREAD_COLOR)


def test_output_is_a_jpeg_the_size_of_the_customer_photo(a_pose):
    result = generate_try_on(_customer_jpeg(), _product_png(), ANCHORS, pose=_pose(a_pose))
    assert result[:2] == b"\xff\xd8"
    assert _decode(result).shape == (1024, 768, 3)


def test_garment_anchors_land_on_the_body_band_edges(a_pose):
    result = _decode(generate_try_on(_customer_jpeg(), _product_png(), ANCHORS, pose=_pose(a_pose)))
    bands, _ = body_bands(a_pose["landmarks"], 768, 1024)
    targets = [bands[0][0], bands[0][1], bands[-1][0], bands[-1][1]]  # shoulders, hips

    tolerance = 3
    for x, y in targets:
        x, y = int(round(x)), int(round(y))
        patch = result[y - tolerance : y + tolerance + 1, x - tolerance : x + tolerance + 1].reshape(-1, 3).astype(int)
        distance_to_marker = np.abs(patch - np.array(MARKER_BGR)).sum(axis=1).min()
        assert distance_to_marker < 90, f"no anchor marker within {tolerance}px of ({x}, {y})"


def test_garment_covers_the_torso_and_leaves_the_background(a_pose):
    result = _decode(generate_try_on(_customer_jpeg(), _product_png(), ANCHORS, pose=_pose(a_pose)))
    bands, _ = body_bands(a_pose["landmarks"], 768, 1024)
    chest_centre = ((bands[1][0] + bands[1][1]) / 2).astype(int)
    assert np.abs(result[chest_centre[1], chest_centre[0]].astype(int) - np.array(GARMENT_BGR)).sum() < 120
    assert np.abs(result[20, 20].astype(int) - CUSTOMER_GRAY).max() < 10


def test_a_larger_ease_draws_the_garment_wider(a_pose):
    narrow, _ = body_bands(a_pose["landmarks"], 768, 1024, ease=1.0)
    wide, _ = body_bands(a_pose["landmarks"], 768, 1024, ease=1.1)
    def width(band):
        return float(np.linalg.norm(band[1] - band[0]))

    assert width(wide[1]) == pytest.approx(width(narrow[1]) * 1.1)


def test_transparent_png_keeps_its_alpha():
    png = _product_png()
    decoded = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_UNCHANGED)
    alpha = product_alpha(png, decoded)
    assert np.array_equal(alpha, decoded[:, :, 3].astype(np.float32) / 255.0)


def test_plain_background_is_removed_without_transparency():
    image = np.full((300, 240, 3), 245, np.uint8)
    cv2.rectangle(image, (60, 50), (180, 250), GARMENT_BGR, -1)
    alpha = product_alpha(_encode(image, ".jpg"), image)
    assert alpha[150, 120] > 0.9
    assert alpha[5, 5] < 0.1


def test_cluttered_background_uses_grabcut():
    rng = np.random.default_rng(0)
    image = rng.integers(0, 255, (300, 240, 3), dtype=np.uint8)
    image[:150, :120] = (250, 250, 250)
    image[150:, 120:] = (10, 10, 10)
    cv2.rectangle(image, (60, 50), (180, 250), GARMENT_BGR, -1)
    alpha = product_alpha(_encode(image, ".png"), image)
    assert alpha[150, 120] > 0.9
    assert alpha[2, 2] < 0.1


def test_product_alpha_is_cached_per_image():
    png = _product_png()
    decoded = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_UNCHANGED)
    assert product_alpha(png, decoded) is product_alpha(png, decoded)


@pytest.mark.parametrize("anchors", [None, {}, {k: v for k, v in ANCHORS.items() if k != "hipLeft"}])
def test_missing_anchors_raise_tryon_not_available(a_pose, anchors):
    with pytest.raises(TryOnError, match="TRYON_NOT_AVAILABLE"):
        generate_try_on(_customer_jpeg(), _product_png(), anchors, pose=_pose(a_pose))


def test_garment_ease_follows_the_recommended_size():
    match = {
        "recommended_size": "L",
        "size_comparison": [
            {"label": "M", "perMeasurement": [{"name": "chest", "userValue": 100, "min": 94, "max": 102}]},
            {"label": "L", "perMeasurement": [{"name": "chest", "userValue": 100, "min": 102, "max": 110}]},
        ],
    }
    assert garment_ease(match) == pytest.approx(1.06)
    assert garment_ease(None) == 1.0
    assert garment_ease({"recommended_size": "M", "size_comparison": [{"label": "M", "perMeasurement": []}]}) == 1.0


class TestFetchProductAnchorData:
    REAL_ASYNC_CLIENT = httpx.AsyncClient

    def _fetch(self, monkeypatch, payload):
        real_client = self.REAL_ASYNC_CLIENT
        transport = httpx.MockTransport(lambda request: httpx.Response(200, json=payload))
        monkeypatch.setattr(try_on.httpx, "AsyncClient", lambda **kwargs: real_client(transport=transport, **kwargs))
        return asyncio.run(fetch_product_anchor_data("m1", "SKU-1"))

    def test_returns_anchors_image_and_garment_length(self, monkeypatch):
        payload = {"anchorPoints": ANCHORS, "imageUrl": "http://backend.test/tee.png", "garmentLength": "long"}
        assert self._fetch(monkeypatch, payload) == (ANCHORS, "http://backend.test/tee.png", "long")

    def test_backends_without_garment_lengths_mean_regular(self, monkeypatch):
        payload = {"anchorPoints": ANCHORS, "imageUrl": "http://backend.test/tee.png"}
        assert self._fetch(monkeypatch, payload)[2] == "regular"


class TestEndpoints:
    client = TestClient(main.app)

    @staticmethod
    def _fake_pose(fixture):
        return {**_pose(fixture), "key_landmarks": fixture["landmarks"], "brightness": 120.0}

    def _patch(self, monkeypatch, a_pose, anchor_error=None):
        monkeypatch.setattr(main, "extract_landmarks", lambda _bytes: self._fake_pose(a_pose))

        async def anchors(_merchant_id, _product_id):
            if anchor_error:
                raise TryOnError(anchor_error)
            return ANCHORS, "http://backend.test/uploads/products/tee.png", "regular"

        async def image_bytes(_url):
            return _product_png()

        monkeypatch.setattr(main, "fetch_product_anchor_data", anchors)
        monkeypatch.setattr(main, "fetch_image_bytes", image_bytes)

    def test_analyze_renders_try_on_from_the_same_pose(self, monkeypatch, a_pose):
        self._patch(monkeypatch, a_pose)
        response = self.client.post(
            "/analyze",
            files={"image": ("me.jpg", _customer_jpeg(), "image/jpeg")},
            data={"try_on_product_id": "SKU-1", "merchant_id": "m1"},
        )
        assert response.status_code == 200
        data_url = response.json()["tryOn"]["image"]
        assert data_url.startswith("data:image/jpeg;base64,")
        assert Image.open(io.BytesIO(base64.b64decode(data_url.split(",", 1)[1]))).size == (768, 1024)

    def test_analyze_reports_try_on_failure_without_failing(self, monkeypatch, a_pose):
        self._patch(monkeypatch, a_pose, anchor_error="TRYON_NOT_AVAILABLE")
        response = self.client.post(
            "/analyze",
            files={"image": ("me.jpg", _customer_jpeg(), "image/jpeg")},
            data={"try_on_product_id": "SKU-1", "merchant_id": "m1"},
        )
        assert response.status_code == 200
        assert response.json()["tryOn"] == {"error": "TRYON_NOT_AVAILABLE"}

    def test_analyze_without_try_on_fields_skips_it(self, monkeypatch, a_pose):
        self._patch(monkeypatch, a_pose)
        response = self.client.post("/analyze", files={"image": ("me.jpg", _customer_jpeg(), "image/jpeg")})
        assert response.json()["tryOn"] is None

    def test_try_on_endpoint_returns_404_when_not_set_up(self, monkeypatch, a_pose):
        self._patch(monkeypatch, a_pose, anchor_error="TRYON_NOT_AVAILABLE")
        response = self.client.post(
            "/try-on",
            files={"image": ("me.jpg", _customer_jpeg(), "image/jpeg")},
            data={"product_id": "SKU-1", "merchant_id": "m1"},
        )
        assert response.status_code == 404
        assert response.json()["detail"] == "TRYON_NOT_AVAILABLE"
