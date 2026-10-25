import asyncio
import base64
import io
import re

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
CONFIG = ("https://gpu.test", "secret-token")


def _encode(array, fmt):
    ok, buf = cv2.imencode(fmt, array)
    assert ok
    return buf.tobytes()


def _decode(data, flags=cv2.IMREAD_COLOR):
    return cv2.imdecode(np.frombuffer(data, np.uint8), flags)


def _photo(width=W, height=H):
    return _encode(np.full((height, width, 3), 128, np.uint8), ".jpg")


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

    def test_keeps_visible_forearms_out(self, a_pose):
        lm = a_pose["landmarks"]
        elbow, wrist = np.array(_px(lm["LEFT_ELBOW"])), np.array(_px(lm["LEFT_WRIST"]))
        mid = ((elbow + wrist) / 2).astype(int)
        assert clothing_mask(lm, W, H)[mid[1], mid[0]] == 0

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


def _form_fields(request):
    boundary = request.headers["content-type"].split("boundary=")[1].encode()
    fields = {}
    for part in request.content.split(b"--" + boundary)[1:-1]:
        head, _, body = part.partition(b"\r\n\r\n")
        fields[re.search(rb'name="([^"]+)"', head).group(1).decode()] = body[: -len(b"\r\n")]
    return fields


def _fake_gpu(seen, paint=(240, 220, 200)):
    """Stands in for the CatVTON server: records the request, paints the mask
    region of the person frame it got (pale blue: a drifted white garment) and
    returns that frame as a JPEG."""

    def handler(request):
        fields = _form_fields(request)
        seen.update(fields, url=str(request.url), token=request.headers.get("x-token"))
        person = _decode(fields["person"])
        person[_decode(fields["mask"], cv2.IMREAD_GRAYSCALE) > 127] = paint
        return httpx.Response(200, content=_encode(person, ".jpg"))

    return handler


class TestGenerateGpuTryOn:
    def test_sends_photo_garment_mask_and_token(self, monkeypatch, a_pose):
        seen = {}
        _patch_transport(monkeypatch, _fake_gpu(seen))
        result = asyncio.run(generate_gpu_try_on(_photo(), _garment_png(), _pose(a_pose), config=CONFIG))

        assert result.startswith(b"\xff\xd8")
        assert seen["url"] == "https://gpu.test/tryon"
        assert seen["token"] == "secret-token"
        assert seen["steps"] == b"30"
        assert seen["guidance"] == b"2.5"
        assert _decode(seen["person"]).shape == (H, W, 3)
        assert _decode(seen["mask"], cv2.IMREAD_GRAYSCALE).shape == (H, W)
        assert _decode(seen["garment"]).shape == (500, 400, 3)

    @pytest.mark.parametrize("size, expected", [((900, 1000), (900, 1000)), ((2400, 3200), (1200, 1600))])
    def test_returns_the_whole_photo_frame_capped_in_size(self, monkeypatch, a_pose, size, expected):
        seen = {}
        _patch_transport(monkeypatch, _fake_gpu(seen))
        result = asyncio.run(generate_gpu_try_on(_photo(*size), _garment_png(), _pose(a_pose), config=CONFIG))

        assert _decode(seen["person"]).shape == (H, W, 3)
        assert _decode(result).shape == (expected[1], expected[0], 3)

    def test_blends_the_garment_into_the_original_photo(self, monkeypatch, a_pose):
        # A smooth, lossless photo, so only the returned JPEG adds error.
        ramp = np.linspace(60, 190, W, dtype=np.float32)
        photo = np.dstack([np.tile(ramp, (H, 1))] * 3).astype(np.uint8)
        _patch_transport(monkeypatch, _fake_gpu({}))

        result = _decode(
            asyncio.run(generate_gpu_try_on(_encode(photo, ".png"), _garment_png(), _pose(a_pose), config=CONFIG))
        ).astype(int)

        mask = clothing_mask(a_pose["landmarks"], W, H)
        clear_of_seam = cv2.dilate(mask, np.ones((17, 17), np.uint8)) == 0
        assert np.abs(result - photo)[clear_of_seam].max() <= 6
        garment = cv2.erode(mask, np.ones((41, 41), np.uint8)) > 0
        assert np.abs(result - (240, 220, 200))[garment].mean() < 6

    def test_an_exif_rotated_photo_is_sent_upright(self, monkeypatch, a_pose):
        upright = np.full((H, W, 3), 128, np.uint8)
        upright[:100] = (0, 0, 255)
        exif = Image.Exif()
        exif[0x0112] = 6  # stored rotated a quarter turn: "rotate 90 CW to display"
        stored = io.BytesIO()
        Image.fromarray(cv2.cvtColor(np.ascontiguousarray(np.rot90(upright)), cv2.COLOR_BGR2RGB)).save(
            stored, "JPEG", exif=exif.tobytes()
        )
        seen = {}
        _patch_transport(monkeypatch, _fake_gpu(seen))

        result = asyncio.run(generate_gpu_try_on(stored.getvalue(), _garment_png(), _pose(a_pose), config=CONFIG))

        person = _decode(seen["person"])
        assert person.shape == (H, W, 3)
        assert tuple(person[50, W // 2]) == pytest.approx((0, 0, 255), abs=12)
        assert _decode(result).shape == (H, W, 3)

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
            return self.ANCHORS, "http://backend.test/tee.png"

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
        async def gpu(*_args):
            return _encode(np.full((1024, 768, 3), 200, np.uint8), ".jpg")

        self._patch(monkeypatch, a_pose, gpu)
        try_on = self._analyze()
        assert try_on["engine"] == "catvton"
        decoded = Image.open(io.BytesIO(base64.b64decode(try_on["image"].split(",", 1)[1])))
        assert decoded.size == (768, 1024)

    def test_falls_back_to_the_warp_when_the_gpu_fails(self, monkeypatch, a_pose):
        async def gpu(*_args):
            raise TryOnError("GPU_UNREACHABLE")

        self._patch(monkeypatch, a_pose, gpu)
        try_on = self._analyze()
        assert try_on["engine"] == "warp"
        assert try_on["image"].startswith("data:image/jpeg;base64,")
