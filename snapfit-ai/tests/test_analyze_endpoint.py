import io
import json
import os

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import main

REFERENCE_PHOTO = os.path.join(os.path.dirname(__file__), "..", "..", "pose.png")

client = TestClient(main.app)


def _jpeg_bytes(width=768, height=1024):
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (128, 128, 128)).save(buffer, "JPEG")
    return buffer.getvalue()


def _fake_pose(fixture):
    return {
        "landmarks": fixture["landmarks"],
        "key_landmarks": fixture["landmarks"],
        "image_dimensions": {"width": fixture["image_width"], "height": fixture["image_height"]},
        "brightness": 120.0,
    }


def test_analyze_accepts_a_valid_pose(monkeypatch, a_pose):
    monkeypatch.setattr(main, "extract_landmarks", lambda _bytes: _fake_pose(a_pose))
    response = client.post("/analyze", files={"image": ("photo.jpg", _jpeg_bytes(), "image/jpeg")})
    assert response.status_code == 200
    assert response.json()["features"]["ratios"]["shoulder_to_hip_ratio"] > 1


def test_analyze_rejects_an_invalid_pose_with_failed_checks(monkeypatch, a_pose):
    for point in a_pose["landmarks"].values():
        point["x"] += 0.22
    monkeypatch.setattr(main, "extract_landmarks", lambda _bytes: _fake_pose(a_pose))
    response = client.post("/analyze", files={"image": ("photo.jpg", _jpeg_bytes(), "image/jpeg")})
    assert response.status_code == 422
    assert response.json()["detail"] == {
        "code": "POSE_INVALID",
        "failed_checks": [{"id": "centered", "message": "Move to the centre of the frame"}],
    }


@pytest.mark.skipif(not os.path.exists(REFERENCE_PHOTO), reason="pose.png reference photo not present")
def test_analyze_rejects_real_photo_with_arms_behind_back():
    # End-to-end through the real BlazePose model: the repo's reference photo has
    # the arms behind the back and feet together -- not the A-pose the gate asks for.
    with open(REFERENCE_PHOTO, "rb") as photo:
        response = client.post("/analyze", files={"image": ("pose.png", photo.read(), "image/png")})
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "POSE_INVALID"
    assert detail["failed_checks"][0]["id"] == "visibility"


def test_try_on_validates_pose_before_fetching_product(monkeypatch, a_pose):
    scale = 0.7
    for point in a_pose["landmarks"].values():
        point["x"] = 0.5 + (point["x"] - 0.5) * scale
        point["y"] = 0.52 + (point["y"] - 0.52) * scale
    monkeypatch.setattr(main, "extract_landmarks", lambda _bytes: _fake_pose(a_pose))

    async def fail_if_called(*_args):
        raise AssertionError("product data must not be fetched for an invalid pose")

    monkeypatch.setattr(main, "fetch_product_anchor_data", fail_if_called)
    response = client.post(
        "/try-on",
        files={"image": ("photo.jpg", _jpeg_bytes(), "image/jpeg")},
        data={"product_id": "SKU-1", "merchant_id": "m1"},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "POSE_INVALID"


def test_analyze_returns_measurement_comparison_and_keeps_legacy_fields(monkeypatch, a_pose):
    monkeypatch.setattr(main, "extract_landmarks", lambda _bytes: _fake_pose(a_pose))
    chart = {
        "unit": "cm",
        "category": "tops",
        "sizes": [
            {"label": "M", "measurements": {"chest": {"min": 90, "max": 98}}},
            {"label": "L", "measurements": {"chest": {"min": 98, "max": 106}}},
        ],
    }
    response = client.post(
        "/analyze",
        files={"image": ("photo.jpg", _jpeg_bytes(), "image/jpeg")},
        data={"user_height": "175", "size_chart": json.dumps(chart)},
    )

    assert response.status_code == 200
    body = response.json()
    assert set(body["size_recommendation"]) == {"recommended_size", "confidence", "fit_scores", "body_type", "notes"}
    assert body["recommendedSize"] == body["size_recommendation"]["recommended_size"]
    assert body["alternativeSize"] in ("M", "L")
    assert body["measurements"]["chest"]["estimated"] is True
    assert [size["label"] for size in body["sizeComparison"]] == ["M", "L"]
    assert body["sizeComparison"][0]["perMeasurement"][0]["name"] == "chest"
    assert isinstance(body["fitNotes"], list)
