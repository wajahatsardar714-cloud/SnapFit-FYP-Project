import asyncio
import base64
import io

import cv2
import httpx
import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import gpu_try_on, main
from app.gpu_try_on import clothing_mask, garment_on_white, generate_gpu_try_on
from app.try_on import TryOnError

W, H = 768, 1024
JPEG = b"\xff\xd8\xff\xe0fake-jpeg"
CONFIG = ("https://gpu.test", "secret-token")
LENGTHS = ("cropped", "regular", "long")


def _encode(array, fmt):
    ok, buf = cv2.imencode(fmt, array)
    assert ok
    return buf.tobytes()


def _photo():
    return _encode(np.full((H, W, 3), 128, np.uint8), ".jpg")


def _garment_png():
    image = np.zeros((500, 400, 4), np.uint8)
    cv2.rectangle(image, (60, 40), (340, 460), (40, 40, 200, 255), -1)
    return _encode(image, ".png")


def _pose(fixture):
    return {"landmarks": fixture["landmarks"], "image_dimensions": {"width": W, "height": H}}


def _px(landmark):
    return int(landmark["x"] * W), int(landmark["y"] * H)


class TestClothingMask:
    def test_covers_the_torso_but_not_face_or_legs(self, a_pose):
        lm = a_pose["landmarks"]
        mask = clothing_mask(lm, W, H)
        chest = ((np.array(_px(lm["LEFT_SHOULDER"])) + np.array(_px(lm["RIGHT_HIP"]))) / 2).astype(int)
        assert mask[chest[1], chest[0]] == 255
        nose_x, nose_y = _px(lm["NOSE"])
        assert mask[nose_y, nose_x] == 0
        knee_x, knee_y = _px(lm["LEFT_KNEE"])
        assert mask[knee_y, knee_x] == 0

    @pytest.mark.parametrize("length", LENGTHS)
    @pytest.mark.parametrize("elbow_visibility", [0.99, 0.2])
    def test_repaints_whole_arms_but_not_hands_or_face(self, a_pose, length, elbow_visibility):
        lm = a_pose["landmarks"]
        for side in ("LEFT", "RIGHT"):
            lm[f"{side}_ELBOW"]["visibility"] = elbow_visibility
        mask = clothing_mask(lm, W, H, length=length)
        for side in ("LEFT", "RIGHT"):
            shoulder, elbow, wrist = (np.array(_px(lm[f"{side}_{joint}"])) for joint in ("SHOULDER", "ELBOW", "WRIST"))
            for x, y in [(shoulder + elbow) // 2, (elbow + wrist) // 2, (elbow + (wrist - elbow) * 0.8).astype(int)]:
                assert mask[y, x] == 255
            for finger in ("PINKY", "INDEX", "THUMB"):
                x, y = _px(lm[f"{side}_{finger}"])
                assert mask[y, x] == 0
        for point in ("NOSE", "MOUTH_LEFT", "MOUTH_RIGHT", "LEFT_EYE", "RIGHT_EYE"):
            x, y = _px(lm[point])
            assert mask[y, x] == 0

    def test_a_hand_resting_on_the_body_stays_out(self, a_pose):
        lm = a_pose["landmarks"]
        lm["LEFT_WRIST"].update(x=0.55, y=0.42)
        for finger, (x, y) in {"PINKY": (0.535, 0.45), "INDEX": (0.525, 0.45), "THUMB": (0.53, 0.44)}.items():
            lm[f"LEFT_{finger}"].update(x=x, y=y)
        mask = clothing_mask(lm, W, H)
        x, y = _px(lm["LEFT_INDEX"])
        assert mask[y, x] == 0
        assert mask[y, int(0.45 * W)] == 255

    def test_hands_behind_the_back_leave_no_hole_and_stay_above_a_cropped_hem(self, a_pose):
        lm = a_pose["landmarks"]
        for side, x in (("LEFT", 0.53), ("RIGHT", 0.47)):
            for joint in ("WRIST", "PINKY", "INDEX", "THUMB"):
                lm[f"{side}_{joint}"].update(x=x, y=0.5, visibility=0.05)
        hand_x, hand_y = _px(lm["LEFT_INDEX"])
        assert clothing_mask(lm, W, H)[hand_y, hand_x] == 255
        assert clothing_mask(lm, W, H, length="cropped")[hand_y, hand_x] == 0

    def test_the_hem_moves_down_with_the_garment_length(self, a_pose):
        lm = a_pose["landmarks"]
        hems = {length: np.nonzero(clothing_mask(lm, W, H, length=length)[:, W // 2])[0].max() for length in LENGTHS}
        hip_y = (lm["LEFT_HIP"]["y"] + lm["RIGHT_HIP"]["y"]) / 2 * H
        knee_y = (lm["LEFT_KNEE"]["y"] + lm["RIGHT_KNEE"]["y"]) / 2 * H
        assert hems["cropped"] < hip_y < hems["regular"] < hems["long"]
        assert hems["long"] > (hip_y + knee_y) / 2

    def test_unknown_lengths_count_as_regular(self, a_pose):
        lm = a_pose["landmarks"]
        assert np.array_equal(clothing_mask(lm, W, H, length="maxi"), clothing_mask(lm, W, H))

    def test_a_looser_size_gets_a_wider_region(self, a_pose):
        lm = a_pose["landmarks"]
        assert (clothing_mask(lm, W, H, ease=1.1) > 0).sum() > (clothing_mask(lm, W, H, ease=1.0) > 0).sum()


def test_garment_transparency_is_flattened_onto_white():
    decoded = cv2.imdecode(np.frombuffer(garment_on_white(_garment_png()), np.uint8), cv2.IMREAD_UNCHANGED)
    assert decoded.shape == (500, 400, 3)
    assert tuple(decoded[5, 5]) == (255, 255, 255)
    assert tuple(decoded[250, 200]) == (40, 40, 200)


REAL_ASYNC_CLIENT = httpx.AsyncClient


def _patch_transport(monkeypatch, handler):
    real_client = REAL_ASYNC_CLIENT
    monkeypatch.setattr(
        gpu_try_on.httpx, "AsyncClient", lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs)
    )


class TestGenerateGpuTryOn:
    def test_sends_photo_garment_mask_and_token(self, monkeypatch, a_pose):
        seen = {}

        def handler(request):
            seen["url"] = str(request.url)
            seen["token"] = request.headers.get("x-token")
            seen["body"] = request.content
            return httpx.Response(200, content=JPEG)

        _patch_transport(monkeypatch, handler)
        result = asyncio.run(generate_gpu_try_on(_photo(), _garment_png(), _pose(a_pose), config=CONFIG))

        assert result == JPEG
        assert seen["url"] == "https://gpu.test/tryon"
        assert seen["token"] == "secret-token"
        for field in (b'name="person"', b'name="garment"', b'name="mask"', b'name="steps"'):
            assert field in seen["body"]

    def test_the_mask_follows_the_garment_length(self, monkeypatch, a_pose):
        seen = {}

        def handler(request):
            seen["body"] = request.content
            return httpx.Response(200, content=JPEG)

        _patch_transport(monkeypatch, handler)
        asyncio.run(generate_gpu_try_on(_photo(), _garment_png(), _pose(a_pose), config=CONFIG, length="long"))

        lm = a_pose["landmarks"]
        assert gpu_try_on._png(clothing_mask(lm, W, H, length="long")) in seen["body"]
        assert gpu_try_on._png(clothing_mask(lm, W, H)) not in seen["body"]

    @pytest.mark.parametrize(
        "handler, code",
        [
            (lambda request: httpx.Response(401, json={"detail": "BAD_TOKEN"}), "GPU_ERROR:401"),
            (lambda request: httpx.Response(200, content=b"not a jpeg"), "GPU_ERROR:200"),
        ],
    )
    def test_bad_responses_raise(self, monkeypatch, a_pose, handler, code):
        _patch_transport(monkeypatch, handler)
        with pytest.raises(TryOnError, match=code):
            asyncio.run(generate_gpu_try_on(_photo(), _garment_png(), _pose(a_pose), config=CONFIG))

    def test_unreachable_and_timeout(self, monkeypatch, a_pose):
        def refuse(request):
            raise httpx.ConnectError("refused", request=request)

        _patch_transport(monkeypatch, refuse)
        with pytest.raises(TryOnError, match="GPU_UNREACHABLE"):
            asyncio.run(generate_gpu_try_on(_photo(), _garment_png(), _pose(a_pose), config=CONFIG))

        def slow(request):
            raise httpx.ReadTimeout("slow", request=request)

        _patch_transport(monkeypatch, slow)
        with pytest.raises(TryOnError, match="GPU_TIMEOUT"):
            asyncio.run(generate_gpu_try_on(_photo(), _garment_png(), _pose(a_pose), config=CONFIG))

    def test_unconfigured(self, monkeypatch, a_pose):
        monkeypatch.delenv("TRYON_GPU_URL", raising=False)
        with pytest.raises(TryOnError, match="GPU_NOT_CONFIGURED"):
            asyncio.run(generate_gpu_try_on(_photo(), _garment_png(), _pose(a_pose)))


class TestTryOnEngineSelection:
    client = TestClient(main.app)
    ANCHORS = {
        "shoulderLeft": {"x": 0.25, "y": 0.15},
        "shoulderRight": {"x": 0.75, "y": 0.15},
        "hipLeft": {"x": 0.25, "y": 0.8},
        "hipRight": {"x": 0.75, "y": 0.8},
    }

    def _patch(self, monkeypatch, a_pose, gpu):
        fake_pose = {**_pose(a_pose), "key_landmarks": a_pose["landmarks"], "brightness": 120.0}
        monkeypatch.setattr(main, "extract_landmarks", lambda _bytes: fake_pose)

        async def anchors(_m, _p):
            return self.ANCHORS, "http://backend.test/tee.png", "long"

        async def image_bytes(_url):
            return _garment_png()

        monkeypatch.setattr(main, "fetch_product_anchor_data", anchors)
        monkeypatch.setattr(main, "fetch_image_bytes", image_bytes)
        monkeypatch.setenv("TRYON_GPU_URL", "https://gpu.test")
        monkeypatch.setenv("TRYON_GPU_TOKEN", "secret-token")
        monkeypatch.setattr(main, "generate_gpu_try_on", gpu)

    def _analyze(self):
        response = self.client.post(
            "/analyze",
            files={"image": ("me.jpg", _photo(), "image/jpeg")},
            data={"try_on_product_id": "SKU-1", "merchant_id": "m1"},
        )
        assert response.status_code == 200
        return response.json()["tryOn"]

    def test_uses_the_gpu_model_when_it_answers(self, monkeypatch, a_pose):
        async def gpu(*_args, **_kwargs):
            return _encode(np.full((1024, 768, 3), 200, np.uint8), ".jpg")

        self._patch(monkeypatch, a_pose, gpu)
        try_on = self._analyze()
        assert try_on["engine"] == "catvton"
        decoded = Image.open(io.BytesIO(base64.b64decode(try_on["image"].split(",", 1)[1])))
        assert decoded.size == (768, 1024)

    def test_passes_the_products_garment_length_to_the_gpu_model(self, monkeypatch, a_pose):
        seen = {}

        async def gpu(*_args, **kwargs):
            seen.update(kwargs)
            return JPEG

        self._patch(monkeypatch, a_pose, gpu)
        assert self._analyze()["engine"] == "catvton"
        assert seen["length"] == "long"

    def test_falls_back_to_the_warp_when_the_gpu_fails(self, monkeypatch, a_pose):
        async def gpu(*_args, **_kwargs):
            raise TryOnError("GPU_UNREACHABLE")

        self._patch(monkeypatch, a_pose, gpu)
        try_on = self._analyze()
        assert try_on["engine"] == "warp"
        assert try_on["image"].startswith("data:image/jpeg;base64,")
