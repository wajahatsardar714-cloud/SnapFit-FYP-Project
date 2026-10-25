import asyncio
import base64
import io
import re
import threading

import cv2
import httpx
import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import gpu_try_on, main
from app.gpu_try_on import clothing_mask, garment_on_white, generate_gpu_try_on, gpu_health
from app.try_on import TryOnError

W, H = 768, 1024
CONFIG = ("https://gpu.test", "secret-token")
LENGTHS = ("cropped", "regular", "long")


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
        assert seen["steps"] == b"40"
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

    def test_blends_a_colour_corrected_garment_into_the_original_photo(self, monkeypatch, a_pose):
        # A smooth, lossless photo, so only the returned JPEG adds error.
        ramp = np.linspace(60, 190, W, dtype=np.float32)
        photo = np.dstack([np.tile(ramp, (H, 1))] * 3).astype(np.uint8)
        white_tee = np.zeros((500, 400, 4), np.uint8)
        white_tee[40:460, 60:340] = (245, 245, 245, 255)
        _patch_transport(monkeypatch, _fake_gpu({}))

        result = _decode(
            asyncio.run(generate_gpu_try_on(_encode(photo, ".png"), _encode(white_tee, ".png"), _pose(a_pose), config=CONFIG))
        ).astype(int)

        mask = clothing_mask(a_pose["landmarks"], W, H)
        clear_of_seam = cv2.dilate(mask, np.ones((17, 17), np.uint8)) == 0
        assert np.abs(result - photo)[clear_of_seam].max() <= 6
        garment = cv2.erode(mask, np.ones((41, 41), np.uint8)) > 0
        blue_minus_red = result[..., 0] - result[..., 2]
        assert blue_minus_red[garment].mean() < 0.5 * (240 - 200)

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

    def test_the_mask_follows_the_garment_length(self, monkeypatch, a_pose):
        seen = {}
        _patch_transport(monkeypatch, _fake_gpu(seen))
        asyncio.run(generate_gpu_try_on(_photo(), _garment_png(), _pose(a_pose), config=CONFIG, length="long"))

        lm = a_pose["landmarks"]
        sent = _decode(seen["mask"], cv2.IMREAD_GRAYSCALE)
        assert np.array_equal(sent, clothing_mask(lm, W, H, length="long"))
        assert not np.array_equal(sent, clothing_mask(lm, W, H))

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


class TestGpuHealth:
    def test_returns_the_gpu_name_and_sends_the_token(self, monkeypatch):
        seen = {}

        def healthy(request):
            seen.update(url=str(request.url), token=request.headers.get("x-token"))
            return httpx.Response(200, json={"status": "ok", "gpu": "Tesla T4"})

        _patch_transport(monkeypatch, healthy)
        assert asyncio.run(gpu_health(CONFIG)) == "Tesla T4"
        assert seen == {"url": "https://gpu.test/health", "token": "secret-token"}

    @pytest.mark.parametrize(
        "handler",
        [
            lambda request: httpx.Response(502, text="tunnel down"),
            lambda request: httpx.Response(200, text="<html>not json</html>"),
            lambda request: httpx.Response(200, json={"status": "ok"}),
        ],
    )
    def test_unhealthy_answers_raise(self, monkeypatch, handler):
        _patch_transport(monkeypatch, handler)
        with pytest.raises(TryOnError, match="GPU_UNREACHABLE"):
            asyncio.run(gpu_health(CONFIG))

    def test_unreachable_raises(self, monkeypatch):
        def refuse(request):
            raise httpx.ConnectError("refused", request=request)

        _patch_transport(monkeypatch, refuse)
        with pytest.raises(TryOnError, match="GPU_UNREACHABLE"):
            asyncio.run(gpu_health(CONFIG))


class TestStartupWarmUp:
    @staticmethod
    def _configure(monkeypatch, health):
        monkeypatch.setenv("TRYON_GPU_URL", "https://gpu.test")
        monkeypatch.setenv("TRYON_GPU_TOKEN", "secret-token")
        monkeypatch.setattr(main, "gpu_health", health)

    @pytest.mark.parametrize(
        "answer, level, text",
        [("Tesla T4", "INFO", "reachable (Tesla T4)"), (TryOnError("GPU_UNREACHABLE"), "WARNING", "unreachable")],
    )
    def test_checks_the_gpu_in_the_background_and_logs_the_result(self, monkeypatch, caplog, answer, level, text):
        checked = threading.Event()

        async def health(config):
            checked.set()
            if isinstance(answer, Exception):
                raise answer
            return answer

        self._configure(monkeypatch, health)
        with caplog.at_level("INFO", logger="snapfit-ai"), TestClient(main.app) as client:
            assert checked.wait(5)
            assert client.get("/health").status_code == 200
        assert any(record.levelname == level and text in record.getMessage() for record in caplog.records)

    def test_a_slow_gpu_never_holds_up_startup(self, monkeypatch):
        started = threading.Event()

        async def hang(config):
            started.set()
            await asyncio.sleep(3600)

        self._configure(monkeypatch, hang)
        with TestClient(main.app) as client:
            assert client.get("/health").status_code == 200
            assert started.wait(5)

    def test_skipped_when_the_gpu_is_not_configured(self, monkeypatch):
        monkeypatch.delenv("TRYON_GPU_URL", raising=False)

        async def fail_if_called(config):
            raise AssertionError("no GPU configured, nothing to check")

        monkeypatch.setattr(main, "gpu_health", fail_if_called)
        with TestClient(main.app) as client:
            assert client.get("/health").status_code == 200


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
            return _encode(np.full((1024, 768, 3), 200, np.uint8), ".jpg")

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
