import io
import json
import os

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import main
from app.measurement_engine import estimate_measurements

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


def _analyze(monkeypatch, a_pose, data=None, image_bytes=None, brightness=120.0):
    pose = {**_fake_pose(a_pose), "brightness": brightness}
    monkeypatch.setattr(main, "extract_landmarks", lambda _bytes: pose)
    files = {"image": ("photo.jpg", image_bytes or _jpeg_bytes(), "image/jpeg")}
    return client.post("/analyze", files=files, data=data or {})


def _chart_around_chest(a_pose, height, clothing_fit="regular"):
    """A one-size chart the photo's chest sits well inside, so the size scores 1
    and the reported confidence is exactly the applied factors."""
    chest = estimate_measurements(a_pose["landmarks"], 768, 1024, height, clothing_fit)["chest"]["value"]
    return json.dumps(
        {"unit": "cm", "category": "tops", "sizes": [{"label": "M", "measurements": {"chest": {"min": chest - 5, "max": chest + 5}}}]}
    )


def test_a_good_photo_and_adult_height_add_no_tips_or_warnings(monkeypatch, a_pose):
    body = _analyze(monkeypatch, a_pose, {"user_height": "175"}).json()
    assert body["photoTips"] == []
    assert body["warnings"] == []


def test_a_dim_photo_gets_a_tip_without_failing(monkeypatch, a_pose):
    buffer = io.BytesIO()
    Image.new("RGB", (768, 1024), (50, 50, 50)).save(buffer, "JPEG")
    response = _analyze(monkeypatch, a_pose, image_bytes=buffer.getvalue(), brightness=50.0)
    assert response.status_code == 200
    assert [tip["id"] for tip in response.json()["photoTips"]] == ["dim_light"]


class TestSizingInputs:
    def test_rejects_an_unknown_clothing_fit(self, monkeypatch, a_pose):
        response = _analyze(monkeypatch, a_pose, {"clothing_fit": "baggy"})
        assert response.status_code == 400
        assert response.json()["detail"] == "INVALID_CLOTHING_FIT"

    @pytest.mark.parametrize("height", ["99.9", "230.5", "0", "-170"])
    def test_rejects_an_implausible_height(self, monkeypatch, a_pose, height):
        response = _analyze(monkeypatch, a_pose, {"user_height": height})
        assert response.status_code == 400
        assert response.json()["detail"] == "INVALID_USER_HEIGHT"

    @pytest.mark.parametrize("height", ["100", "230"])
    def test_accepts_heights_at_the_limits(self, monkeypatch, a_pose, height):
        assert _analyze(monkeypatch, a_pose, {"user_height": height}).status_code == 200

    def test_height_stays_optional(self, monkeypatch, a_pose):
        response = _analyze(monkeypatch, a_pose)
        assert response.status_code == 200
        assert response.json()["measurements"] == {}

    @pytest.mark.parametrize("clothing_fit, confidence", [("fitted", 1.0), ("regular", 1.0), ("loose", 0.9)])
    def test_clothing_fit_reaches_measurements_and_confidence(self, monkeypatch, a_pose, clothing_fit, confidence):
        data = {"user_height": "175", "size_chart": _chart_around_chest(a_pose, 175, clothing_fit), "clothing_fit": clothing_fit}
        body = _analyze(monkeypatch, a_pose, data).json()
        assert body["measurements"] == estimate_measurements(a_pose["landmarks"], 768, 1024, 175, clothing_fit)
        assert body["size_recommendation"]["confidence"] == confidence

    def test_clothing_fit_defaults_to_regular(self, monkeypatch, a_pose):
        body = _analyze(monkeypatch, a_pose, {"user_height": "175"}).json()
        assert body["measurements"] == estimate_measurements(a_pose["landmarks"], 768, 1024, 175, "regular")


class TestPossibleChild:
    def test_a_child_height_warns_and_lowers_confidence(self, monkeypatch, a_pose):
        body = _analyze(monkeypatch, a_pose, {"user_height": "140", "size_chart": _chart_around_chest(a_pose, 140)}).json()
        assert body["warnings"] == [
            {
                "id": "possible_child",
                "message": "This size chart is for adults. If you're sizing a child, the recommendation may not fit"
                " — check a kids' size chart.",
            }
        ]
        assert body["size_recommendation"]["confidence"] == 0.6

    def test_loose_clothing_and_a_child_height_combine(self, monkeypatch, a_pose):
        data = {"user_height": "140", "size_chart": _chart_around_chest(a_pose, 140, "loose"), "clothing_fit": "loose"}
        assert _analyze(monkeypatch, a_pose, data).json()["size_recommendation"]["confidence"] == 0.54

    def test_an_adult_height_gets_no_warning(self, monkeypatch, a_pose):
        assert _analyze(monkeypatch, a_pose, {"user_height": "145"}).json()["warnings"] == []

    def test_warns_without_a_chart_too(self, monkeypatch, a_pose):
        assert _analyze(monkeypatch, a_pose, {"user_height": "120"}).json()["warnings"][0]["id"] == "possible_child"
