import asyncio
import base64
import io
import re
import threading
import time

import cv2
import httpx
import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import gpu_try_on, main
from app.gpu_try_on import (
    FITTED_TOP_TIP,
    INPAINT_STEPS,
    MASK_ALLOWANCE_PARSED,
    TROUSERS_NEGATIVE_PROMPT,
    TROUSERS_PROMPT,
    GpuTryOn,
    clothes_aware_masks,
    clothing_mask,
    colour_region,
    garment_on_white,
    generate_gpu_try_on,
    gpu_health,
    leftover_share,
    wears_long_top,
)
from app.try_on import TryOnError
from app.try_on_compositing import FEATHER, on_body

W, H = 768, 1024
CONFIG = ("https://gpu.test", "secret-token")
LENGTHS = ("cropped", "regular", "long")
# BGR: what the fake /inpaint paints, a colour nothing else in these tests has.
TROUSER_GREEN = (40, 220, 40)


@pytest.fixture(autouse=True)
def fresh_feature_cache():
    gpu_try_on.reset_feature_cache()
    yield
    gpu_try_on.reset_feature_cache()


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


def _point(lm, name):
    return np.array(_px(lm[name]), float)


def _no_clothes():
    return np.zeros((H, W), np.uint8)


def _top(bottom_y, label=4, skirt_to=None):
    """ATR labels of a shopper's own top: a body-wide band from the shoulders
    down to bottom_y, and optionally a skirt from there down to skirt_to."""
    labels = _no_clothes()
    cv2.rectangle(labels, (300, 255), (468, bottom_y), label, -1)
    if skirt_to:
        cv2.rectangle(labels, (290, bottom_y), (478, skirt_to), 5, -1)
    return labels


def _kameez():
    """A long flared top to the knees, its lower part parsed as skirt."""
    labels = _no_clothes()
    cv2.fillPoly(labels, [np.int32([(300, 255), (468, 255), (520, 600), (248, 600)])], 4)
    cv2.fillPoly(labels, [np.int32([(248, 600), (520, 600), (540, 760), (228, 760)])], 5)
    return labels


def _wide_left_sleeve(lm):
    """A loose top-half sleeve on the (screen-right) LEFT arm, much wider than
    the landmark arm, plus a point on it well beyond the pose mask's reach:
    60px out from the middle of the forearm."""
    labels = _no_clothes()
    shoulder, elbow, wrist = (_point(lm, f"LEFT_{joint}") for joint in ("SHOULDER", "ELBOW", "WRIST"))
    for a, b in ((shoulder, elbow), (elbow, wrist)):
        cv2.line(labels, tuple(int(v) for v in a), tuple(int(v) for v in b), 4, 140)
    direction = (wrist - elbow) / np.linalg.norm(wrist - elbow)
    outward = np.array([direction[1], -direction[0]])
    if outward[0] < 0:
        outward = -outward
    x, y = ((elbow + wrist) / 2 + outward * 60).astype(int)
    return labels, (x, y)


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

    def test_repaints_the_wrist_so_a_full_sleeves_cuff_goes(self, a_pose):
        lm = a_pose["landmarks"]
        mask = clothing_mask(lm, W, H)
        for side in ("LEFT", "RIGHT"):
            x, y = _px(lm[f"{side}_WRIST"])
            assert mask[y, x] == 255

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


class TestClothesAwareMasks:
    def test_with_no_clothes_parsed_it_is_the_body_hugging_pose_mask(self, a_pose):
        lm = a_pose["landmarks"]
        mask, lower = clothes_aware_masks(lm, W, H, _no_clothes())
        assert np.array_equal(mask, clothing_mask(lm, W, H, allowance=MASK_ALLOWANCE_PARSED))
        assert lower.max() == 0

    def test_the_parsed_mask_hugs_the_body_closer_than_the_pose_only_one(self, a_pose):
        lm = a_pose["landmarks"]
        tight = (clothing_mask(lm, W, H, allowance=MASK_ALLOWANCE_PARSED) > 0).sum()
        assert tight < (clothing_mask(lm, W, H) > 0).sum()

    def test_a_sleeve_wider_than_the_arm_is_repainted_not_given_to_catvton(self, a_pose):
        lm = a_pose["landmarks"]
        labels, (x, y) = _wide_left_sleeve(lm)
        mask, lower = clothes_aware_masks(lm, W, H, labels)
        assert mask[y, x] == 0
        assert lower[y, x] == 255
        # The forearm itself stays CatVTON's, so a half sleeve leaves bare skin.
        elbow, wrist = _point(lm, "LEFT_ELBOW"), _point(lm, "LEFT_WRIST")
        fx, fy = ((elbow + wrist) / 2).astype(int)
        assert mask[fy, fx] == 255
        for finger in ("PINKY", "INDEX", "THUMB"):
            fx, fy = _px(lm[f"LEFT_{finger}"])
            assert mask[fy, fx] == 0
            assert lower[fy, fx] == 0

    def test_a_flared_kameez_beyond_the_body_and_below_the_hem_is_repainted(self, a_pose):
        lm = a_pose["landmarks"]
        labels = _kameez()
        hem_row = gpu_try_on._body(lm, W, H).hem_row
        mask, lower = clothes_aware_masks(lm, W, H, labels)

        # The flare above the hem, wider than the mask: repainted, not stretched into.
        flare = (labels > 0) & (mask == 0)
        flare[hem_row:, :] = False
        assert flare.any()
        assert (lower[flare] == 255).all()
        # Below the hem: none of it for CatVTON, all of it repainted.
        assert mask[700, W // 2] == 0
        assert lower[700, W // 2] == 255
        assert not ((mask > 127) & (lower > 127)).any()

    def test_the_collar_below_the_chin_is_repainted_but_never_the_face(self, a_pose):
        lm = a_pose["landmarks"]
        body = gpu_try_on._body(lm, W, H)
        labels = _top(600)
        labels[body.chin_row - 40 : body.neck_row + 5, 340:430] = 4
        x = W // 2
        # Pose-only, the fixed neck line keeps the collar out.
        assert clothing_mask(lm, W, H)[body.neck_row - 5, x] == 0
        mask, _ = clothes_aware_masks(lm, W, H, labels)
        assert mask[body.neck_row - 5, x] == 255
        assert mask[: body.chin_row].max() == 0

        labels[body.neck_row - 12 : body.neck_row - 2, 340:430] = 11  # a beard parsed as face
        mask, lower = clothes_aware_masks(lm, W, H, labels)
        assert mask[body.neck_row - 7, x] == 0
        assert lower[body.neck_row - 7, x] == 0

    def test_clothes_not_on_the_shopper_are_left_alone(self, a_pose):
        lm = a_pose["landmarks"]
        labels = _top(440)
        cv2.rectangle(labels, (10, 300), (110, 520), 4, -1)  # a jacket hanging on the wall
        mask, lower = clothes_aware_masks(lm, W, H, labels)
        assert mask[300:520, 10:110].max() == 0
        assert lower[300:520, 10:110].max() == 0

    def test_the_face_and_hands_stay_out_whatever_the_parser_says(self, a_pose):
        lm = a_pose["landmarks"]
        mask, lower = clothes_aware_masks(lm, W, H, np.full((H, W), 4, np.uint8))
        for point in ("NOSE", "MOUTH_LEFT", "LEFT_EYE", "LEFT_INDEX", "RIGHT_PINKY"):
            x, y = _px(lm[point])
            assert mask[y, x] == 0
            assert lower[y, x] == 0

    def test_a_skirt_under_a_short_top_is_left_alone(self, a_pose):
        lm = a_pose["landmarks"]
        labels = _top(440, skirt_to=760)
        assert not wears_long_top(lm, W, H, labels)
        mask, lower = clothes_aware_masks(lm, W, H, labels)
        assert lower[600:].max() == 0
        assert mask[700, W // 2] == 0

    def test_the_skirt_part_of_a_long_top_counts_as_the_top(self, a_pose):
        lm = a_pose["landmarks"]
        labels = _top(600, skirt_to=760)
        assert wears_long_top(lm, W, H, labels)
        _, lower = clothes_aware_masks(lm, W, H, labels)
        assert lower[700, W // 2] == 255

    def test_long_sleeves_alone_do_not_make_a_top_long(self, a_pose):
        lm = a_pose["landmarks"]
        for side in ("LEFT", "RIGHT"):
            lm[f"{side}_ELBOW"].update(y=0.55)
            lm[f"{side}_WRIST"].update(y=0.68)
        labels = _top(440)
        for side in ("LEFT", "RIGHT"):
            elbow, wrist = _point(lm, f"{side}_ELBOW"), _point(lm, f"{side}_WRIST")
            cv2.line(labels, tuple(int(v) for v in elbow), tuple(int(v) for v in wrist), 4, 50)
        assert not wears_long_top(lm, W, H, labels)


class TestColourRegion:
    @staticmethod
    def _midpoints(lm, side="LEFT"):
        shoulder, elbow, wrist = (_point(lm, f"{side}_{joint}") for joint in ("SHOULDER", "ELBOW", "WRIST"))
        return tuple(((shoulder + elbow) / 2).astype(int)), tuple(((elbow + wrist) / 2).astype(int))

    def test_short_sleeves_leave_the_forearms_out(self, a_pose):
        lm = a_pose["landmarks"]
        mask = clothing_mask(lm, W, H)
        full = cv2.min(mask, on_body(lm, W, H))
        region = colour_region(mask, lm, W, H)
        (ux, uy), (fx, fy) = self._midpoints(lm)
        assert full[fy, fx] > 127
        assert region[fy, fx] == 0
        assert region[uy, ux] == full[uy, ux] > 127
        chest = gpu_try_on.torso_core(lm, W, H) > 0
        assert np.array_equal(region[chest], full[chest])

    def test_sleeveless_leaves_the_whole_arms_out_but_not_the_torso(self, a_pose):
        lm = a_pose["landmarks"]
        mask = clothing_mask(lm, W, H)
        region = colour_region(mask, lm, W, H, sleeves="none")
        (ux, uy), (fx, fy) = self._midpoints(lm)
        # Near the torso the exclusion's softened edge still reaches a little.
        assert region[uy, ux] < 0.25 * 255
        assert region[fy, fx] == 0
        chest = gpu_try_on.torso_core(lm, W, H) > 0
        assert np.array_equal(region[chest], cv2.min(mask, on_body(lm, W, H))[chest])

    def test_long_sleeves_correct_the_whole_arms(self, a_pose):
        lm = a_pose["landmarks"]
        mask = clothing_mask(lm, W, H)
        assert np.array_equal(colour_region(mask, lm, W, H, sleeves="long"), cv2.min(mask, on_body(lm, W, H)))


class TestLeftoverShare:
    def test_the_new_garment_in_its_own_region_is_no_leftover(self, a_pose):
        lm = a_pose["landmarks"]
        garment = (clothing_mask(lm, W, H) > 127).astype(np.uint8) * 4
        assert leftover_share(lm, W, H, garment, False, sleeves="long") == 0.0
        assert leftover_share(lm, W, H, _no_clothes(), True) == 0.0

    def test_old_sleeves_on_the_forearms_are_leftover_for_short_sleeves_only(self, a_pose):
        lm = a_pose["landmarks"]
        labels, _ = _wide_left_sleeve(lm)
        short = leftover_share(lm, W, H, labels, False, sleeves="short")
        assert short > gpu_try_on.FITTED_TOP_LEFTOVER
        assert leftover_share(lm, W, H, labels, False, sleeves="none") > short
        assert leftover_share(lm, W, H, labels, False, sleeves="long") < gpu_try_on.FITTED_TOP_LEFTOVER

    def test_skirt_counts_only_under_a_long_top(self, a_pose):
        lm = a_pose["landmarks"]
        skirt = _no_clothes()
        skirt[650:760, 290:478] = 5
        assert leftover_share(lm, W, H, skirt, False) == 0.0
        assert leftover_share(lm, W, H, skirt, True) > gpu_try_on.FITTED_TOP_LEFTOVER


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


def _fake_gpu(seen, paint=(240, 220, 200), labels=None, missing=(), broken=None):
    """Stands in for the GPU server. /tryon records the request (top level in
    `seen`), paints the mask region of the person frame it got (pale blue: a
    drifted white garment) and returns that frame as a JPEG. /parse returns
    `labels` (a list: one per call, the last repeating; default no clothes)
    as a PNG of the sent image's size; /inpaint paints its mask region
    TROUSER_GREEN. Every call is recorded in seen["calls"] (path, fields).
    Paths in `missing` answer 404 (an older server); `broken` maps a path to
    a function(request) standing in for its answer."""
    label_maps = list(labels) if labels is not None else [None]
    seen.setdefault("calls", [])

    def handler(request):
        path = request.url.path.strip("/")
        fields = _form_fields(request) if request.method == "POST" else {}
        seen["calls"].append((path, fields))
        if path in missing:
            return httpx.Response(404, json={"detail": "Not Found"})
        if broken and path in broken:
            return broken[path](request)
        if path == "parse":
            parses = sum(1 for called, _ in seen["calls"] if called == "parse")
            chosen = label_maps[min(parses, len(label_maps)) - 1]
            sent = _decode(fields["image"])
            chosen = _no_clothes() if chosen is None else chosen
            chosen = cv2.resize(chosen, (sent.shape[1], sent.shape[0]), interpolation=cv2.INTER_NEAREST)
            return httpx.Response(200, content=_encode(chosen, ".png"))
        if path == "inpaint":
            image = _decode(fields["image"])
            image[_decode(fields["mask"], cv2.IMREAD_GRAYSCALE) > 127] = TROUSER_GREEN
            return httpx.Response(200, content=_encode(image, ".jpg"))
        seen.update(fields, url=str(request.url), token=request.headers.get("x-token"))
        person = _decode(fields["person"])
        person[_decode(fields["mask"], cv2.IMREAD_GRAYSCALE) > 127] = paint
        return httpx.Response(200, content=_encode(person, ".jpg"))

    return handler


def _paths(seen):
    return [path for path, _ in seen["calls"]]


def _fields(seen, path):
    return next(fields for called, fields in seen["calls"] if called == path)


def _run(**kwargs):
    return asyncio.run(generate_gpu_try_on(_photo(), _garment_png(), kwargs.pop("pose"), config=CONFIG, **kwargs))


class TestGenerateGpuTryOn:
    def test_sends_photo_garment_mask_and_token(self, monkeypatch, a_pose):
        seen = {}
        _patch_transport(monkeypatch, _fake_gpu(seen))
        result = asyncio.run(generate_gpu_try_on(_photo(), _garment_png(), _pose(a_pose), config=CONFIG))

        assert isinstance(result, GpuTryOn)
        assert result.image.startswith(b"\xff\xd8")
        assert result.tip is None
        assert seen["url"] == "https://gpu.test/tryon"
        assert seen["token"] == "secret-token"
        assert seen["steps"] == b"30"
        assert seen["guidance"] == b"2.5"
        assert _decode(seen["person"]).shape == (H, W, 3)
        assert _decode(seen["mask"], cv2.IMREAD_GRAYSCALE).shape == (H, W)
        assert _decode(seen["garment"]).shape == (500, 400, 3)

    def test_parses_the_photo_before_and_the_result_after(self, monkeypatch, a_pose):
        seen = {}
        _patch_transport(monkeypatch, _fake_gpu(seen))
        _run(pose=_pose(a_pose))
        assert _paths(seen) == ["parse", "tryon", "parse"]
        assert _fields(seen, "parse")["image"] == seen["person"]

    @pytest.mark.parametrize("size, expected", [((900, 1000), (900, 1000)), ((2400, 3200), (1200, 1600))])
    def test_returns_the_whole_photo_frame_capped_in_size(self, monkeypatch, a_pose, size, expected):
        seen = {}
        _patch_transport(monkeypatch, _fake_gpu(seen))
        result = asyncio.run(generate_gpu_try_on(_photo(*size), _garment_png(), _pose(a_pose), config=CONFIG))

        assert _decode(seen["person"]).shape == (H, W, 3)
        assert _decode(result.image).shape == (expected[1], expected[0], 3)

    def test_blends_a_colour_corrected_garment_into_the_original_photo(self, monkeypatch, a_pose):
        # A smooth, lossless photo, so only the returned JPEG adds error.
        ramp = np.linspace(60, 190, W, dtype=np.float32)
        photo = np.dstack([np.tile(ramp, (H, 1))] * 3).astype(np.uint8)
        white_tee = np.zeros((500, 400, 4), np.uint8)
        white_tee[40:460, 60:340] = (245, 245, 245, 255)
        _patch_transport(monkeypatch, _fake_gpu({}))

        result = _decode(
            asyncio.run(
                generate_gpu_try_on(_encode(photo, ".png"), _encode(white_tee, ".png"), _pose(a_pose), config=CONFIG)
            ).image
        ).astype(int)

        mask = clothing_mask(a_pose["landmarks"], W, H)
        seam = 2 * (int(FEATHER) + 4) + 1
        clear_of_seam = cv2.dilate(mask, np.ones((seam, seam), np.uint8)) == 0
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
        assert _decode(result.image).shape == (H, W, 3)

    def test_the_mask_follows_the_garment_length(self, monkeypatch, a_pose):
        seen = {}
        _patch_transport(monkeypatch, _fake_gpu(seen))
        _run(pose=_pose(a_pose), length="long")

        lm = a_pose["landmarks"]
        sent = _decode(seen["mask"], cv2.IMREAD_GRAYSCALE)
        long_mask = clothing_mask(lm, W, H, length="long", allowance=MASK_ALLOWANCE_PARSED)
        assert np.array_equal(sent, long_mask)
        assert not np.array_equal(sent, clothing_mask(lm, W, H, allowance=MASK_ALLOWANCE_PARSED))

    def test_an_old_server_gets_the_wider_pose_mask(self, monkeypatch, a_pose):
        seen = {}
        _patch_transport(monkeypatch, _fake_gpu(seen, missing=("parse", "inpaint")))
        _run(pose=_pose(a_pose))
        sent = _decode(seen["mask"], cv2.IMREAD_GRAYSCALE)
        assert np.array_equal(sent, clothing_mask(a_pose["landmarks"], W, H))

    def test_the_shoppers_own_wide_sleeves_are_repainted(self, monkeypatch, a_pose):
        lm = a_pose["landmarks"]
        labels, (x, y) = _wide_left_sleeve(lm)
        seen = {}
        _patch_transport(monkeypatch, _fake_gpu(seen, labels=[labels, _no_clothes()]))
        result = _run(pose=_pose(a_pose))

        mask, lower = clothes_aware_masks(lm, W, H, labels)
        assert np.array_equal(_decode(seen["mask"], cv2.IMREAD_GRAYSCALE), mask)
        assert np.array_equal(_decode(_fields(seen, "inpaint")["mask"], cv2.IMREAD_GRAYSCALE), lower)
        assert lower[y, x] == 255
        assert tuple(int(v) for v in _decode(result.image)[y, x]) == pytest.approx(TROUSER_GREEN, abs=30)

    def test_parsed_labels_map_back_to_a_letterboxed_photo_unblended(self, monkeypatch, a_pose):
        # 1200x900 is letterboxed top and bottom into the model's frame; the
        # parser's ids must land back on the photo's own pixels, never mixed.
        seen = {}
        frame = np.zeros((H, W), np.uint8)
        frame[H // 2 :, :] = 7
        _patch_transport(monkeypatch, _fake_gpu(seen, labels=[frame]))
        captured = {}
        real = gpu_try_on.clothes_aware_masks

        def spy(landmarks, width, height, labels, *args):
            captured["labels"] = labels
            return real(landmarks, width, height, labels, *args)

        monkeypatch.setattr(gpu_try_on, "clothes_aware_masks", spy)
        asyncio.run(generate_gpu_try_on(_photo(1200, 900), _garment_png(), _pose(a_pose), config=CONFIG))

        labels = captured["labels"]
        assert labels.shape == (900, 1200)
        assert set(np.unique(labels)) == {0, 7}
        assert labels[0, 0] == 0 and labels[-1, -1] == 7

    def test_a_kameez_below_the_hem_is_repainted_as_trousers_there_only(self, monkeypatch, a_pose):
        lm = a_pose["landmarks"]
        seen = {}
        _patch_transport(monkeypatch, _fake_gpu(seen, labels=[_kameez(), _no_clothes()]))
        result = _decode(_run(pose=_pose(a_pose)).image).astype(int)

        assert _paths(seen) == ["parse", "tryon", "inpaint", "parse"]
        inpaint = _fields(seen, "inpaint")
        assert inpaint["prompt"].decode() == TROUSERS_PROMPT
        assert inpaint["negative_prompt"].decode() == TROUSERS_NEGATIVE_PROMPT
        assert inpaint["steps"] == str(INPAINT_STEPS).encode()
        assert {"guidance", "seed"} <= inpaint.keys()
        _, lower = clothes_aware_masks(lm, W, H, _kameez())
        assert np.array_equal(_decode(inpaint["mask"], cv2.IMREAD_GRAYSCALE), lower)
        # It inpaints the try-on result: the garment CatVTON painted is in it.
        x, y = ((_point(lm, "LEFT_SHOULDER") + _point(lm, "RIGHT_HIP")) / 2).astype(int)
        assert np.abs(result[y, x] - 128).max() > 30
        assert np.abs(_decode(inpaint["image"])[y, x].astype(int) - result[y, x]).max() <= 12

        green = result[..., 1] - (result[..., 0] + result[..., 2]) / 2
        assert green[cv2.erode(lower, np.ones((15, 15), np.uint8)) > 0].min() > 100
        reach = 2 * (int(FEATHER) + 4) + 1
        assert np.abs(green[cv2.dilate(lower, np.ones((reach, reach), np.uint8)) == 0]).max() < 30

    def test_a_skirt_under_a_short_top_is_not_repainted(self, monkeypatch, a_pose):
        seen = {}
        _patch_transport(monkeypatch, _fake_gpu(seen, labels=[_top(440, skirt_to=760)]))
        result = _run(pose=_pose(a_pose))
        assert "inpaint" not in _paths(seen)
        assert result.tip is None

    def test_an_old_server_without_parse_or_inpaint_still_tries_on_and_is_remembered(self, monkeypatch, a_pose):
        seen = {}
        _patch_transport(monkeypatch, _fake_gpu(seen, missing=("parse", "inpaint")))
        first = _run(pose=_pose(a_pose))
        second = _run(pose=_pose(a_pose))

        assert _paths(seen) == ["parse", "tryon", "tryon"]
        for result in (first, second):
            assert _decode(result.image).shape == (H, W, 3)
            assert result.tip is None
        assert np.array_equal(_decode(seen["mask"], cv2.IMREAD_GRAYSCALE), clothing_mask(a_pose["landmarks"], W, H))

        gpu_try_on.reset_feature_cache()
        _run(pose=_pose(a_pose))
        assert _paths(seen)[-2:] == ["parse", "tryon"]

    def test_a_missing_inpaint_alone_is_remembered_too(self, monkeypatch, a_pose):
        seen = {}
        _patch_transport(monkeypatch, _fake_gpu(seen, labels=[_kameez()], missing=("inpaint",)))
        first = _run(pose=_pose(a_pose))
        _run(pose=_pose(a_pose))

        assert _paths(seen) == ["parse", "tryon", "inpaint", "parse", "parse", "tryon", "parse"]
        # The kameez below the hem is still there, and the shopper is told.
        assert first.tip == FITTED_TOP_TIP

    def test_an_old_server_is_asked_again_after_a_while(self, monkeypatch, a_pose):
        seen = {}
        _patch_transport(monkeypatch, _fake_gpu(seen, missing=("parse",)))
        monkeypatch.setattr(gpu_try_on, "FEATURE_RETRY_SECONDS", -1)
        _run(pose=_pose(a_pose))
        _run(pose=_pose(a_pose))
        assert _paths(seen) == ["parse", "tryon", "parse", "tryon"]

    @pytest.mark.parametrize(
        "path, answer",
        [
            ("parse", lambda request: httpx.Response(500, text="CUDA out of memory")),
            ("parse", lambda request: httpx.Response(200, content=b"not a png")),
            ("parse", lambda request: httpx.Response(200, content=_encode(np.zeros((8, 8, 3), np.uint8), ".png"))),
            ("inpaint", lambda request: httpx.Response(500, text="CUDA out of memory")),
            ("inpaint", lambda request: httpx.Response(200, content=b"not a jpeg")),
        ],
        ids=["parse-500", "parse-garbage", "parse-colour-png", "inpaint-500", "inpaint-garbage"],
    )
    def test_parse_or_inpaint_failures_never_fail_the_try_on(self, monkeypatch, a_pose, path, answer):
        seen = {}
        _patch_transport(monkeypatch, _fake_gpu(seen, labels=[_kameez(), _no_clothes()], broken={path: answer}))
        result = _run(pose=_pose(a_pose))
        assert _decode(result.image).shape == (H, W, 3)
        assert "tryon" in _paths(seen)
        assert gpu_try_on._unsupported_features == {}

    @pytest.mark.parametrize("path", ["parse", "inpaint"])
    def test_parse_or_inpaint_timeouts_never_fail_the_try_on(self, monkeypatch, a_pose, path):
        def slow(request):
            raise httpx.ReadTimeout("slow", request=request)

        seen = {}
        _patch_transport(monkeypatch, _fake_gpu(seen, labels=[_kameez(), _no_clothes()], broken={path: slow}))
        result = _run(pose=_pose(a_pose))
        assert _decode(result.image).shape == (H, W, 3)
        assert gpu_try_on._unsupported_features == {}

    def test_a_failed_first_parse_skips_the_leftover_check(self, monkeypatch, a_pose):
        seen = {}
        broken = {"parse": lambda request: httpx.Response(503, text="busy")}
        _patch_transport(monkeypatch, _fake_gpu(seen, broken=broken))
        assert _run(pose=_pose(a_pose)).tip is None
        assert _paths(seen) == ["parse", "tryon"]

    @pytest.mark.parametrize(
        "sleeves, tip", [("short", FITTED_TOP_TIP), ("none", FITTED_TOP_TIP), ("long", None), ("cap", FITTED_TOP_TIP)]
    )
    def test_old_sleeves_left_on_the_forearms_give_the_fitted_top_tip(self, monkeypatch, a_pose, sleeves, tip):
        old_sleeves, _ = _wide_left_sleeve(a_pose["landmarks"])
        _patch_transport(monkeypatch, _fake_gpu({}, labels=[_no_clothes(), old_sleeves]))
        assert _run(pose=_pose(a_pose), sleeves=sleeves).tip == tip

    def test_a_clean_result_has_no_tip(self, monkeypatch, a_pose):
        # A long-sleeved product filling its whole mask, over a long top.
        garment = (clothing_mask(a_pose["landmarks"], W, H) > 127).astype(np.uint8) * 4
        _patch_transport(monkeypatch, _fake_gpu({}, labels=[_top(600), garment]))
        assert _run(pose=_pose(a_pose), sleeves="long").tip is None

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

    def test_steps_get_what_is_left_of_the_budget_up_to_their_own_timeout(self):
        deadline = time.monotonic() + 10
        assert 9 < gpu_try_on._time_left(deadline, 30) <= 10
        assert gpu_try_on._time_left(time.monotonic() + 1000, 30) == 30

    def test_optional_steps_after_a_slow_try_on_are_skipped_not_waited_for(self, monkeypatch, a_pose):
        # The try-on itself used up the budget: no trousers, no leftover check.
        lefts = iter([gpu_try_on.PARSE_TIMEOUT_SECONDS, gpu_try_on.GPU_TIMEOUT_SECONDS])
        monkeypatch.setattr(gpu_try_on, "_time_left", lambda deadline, cap: next(lefts, 1))
        seen = {}
        _patch_transport(monkeypatch, _fake_gpu(seen, labels=[_kameez(), _no_clothes()]))
        result = _run(pose=_pose(a_pose))
        assert _paths(seen) == ["parse", "tryon"]
        assert result.tip is None

    def test_a_try_on_with_no_time_left_is_a_timeout_without_calling_the_gpu(self, monkeypatch, a_pose):
        lefts = iter([gpu_try_on.PARSE_TIMEOUT_SECONDS, 1])
        monkeypatch.setattr(gpu_try_on, "_time_left", lambda deadline, cap: next(lefts))
        seen = {}
        _patch_transport(monkeypatch, _fake_gpu(seen))
        with pytest.raises(TryOnError, match="GPU_TIMEOUT"):
            _run(pose=_pose(a_pose))
        assert _paths(seen) == ["parse"]

    def test_the_whole_try_on_fits_in_what_the_backend_and_phone_wait(self):
        # Both wait 180 s (backend aiService AI_TRY_ON_TIMEOUT_MS, the phone's
        # receiveTimeout); the local warp fallback and the backend's own work
        # need some seconds after.
        assert gpu_try_on.TRY_ON_BUDGET_SECONDS <= 165

    def test_a_deadline_from_the_request_start_is_honoured(self, monkeypatch, a_pose):
        seen = {}
        _patch_transport(monkeypatch, _fake_gpu(seen))
        with pytest.raises(TryOnError, match="GPU_TIMEOUT"):
            _run(pose=_pose(a_pose), deadline=time.monotonic() + 1)
        assert _paths(seen) == []

    def test_a_dropped_first_parse_is_tried_once_more(self, monkeypatch, a_pose):
        drops = []

        def drop_once(request):
            if not drops:
                drops.append(request)
                raise httpx.ReadError("tunnel dropped it", request=request)
            return None

        seen = {}
        fake = _fake_gpu(seen, labels=[_kameez(), _no_clothes()])
        _patch_transport(monkeypatch, lambda request: drop_once(request) or fake(request))
        _run(pose=_pose(a_pose))
        assert _paths(seen) == ["parse", "tryon", "inpaint", "parse"]
        assert len(drops) == 1

    def test_a_parse_timeout_is_not_retried(self, monkeypatch, a_pose):
        def slow(request):
            raise httpx.ReadTimeout("busy", request=request)

        seen = {}
        _patch_transport(monkeypatch, _fake_gpu(seen, broken={"parse": slow}))
        _run(pose=_pose(a_pose))
        assert _paths(seen) == ["parse", "tryon"]

    def test_the_gpu_is_used_by_one_try_on_at_a_time(self, monkeypatch, a_pose):
        held = []
        fake = _fake_gpu({})

        def handler(request):
            held.append(gpu_try_on._gpu_turn.locked())
            return fake(request)

        _patch_transport(monkeypatch, handler)
        _run(pose=_pose(a_pose))
        assert held and all(held)
        assert not gpu_try_on._gpu_turn.locked()

    def test_debug_mode_saves_the_masks_and_results(self, monkeypatch, a_pose, tmp_path):
        monkeypatch.setenv(gpu_try_on.DEBUG_DIR_ENV, str(tmp_path))
        _patch_transport(monkeypatch, _fake_gpu({}, labels=[_kameez(), _no_clothes()]))
        _run(pose=_pose(a_pose))
        names = sorted(path.name.split("-", 2)[2] for path in tmp_path.iterdir())
        assert names == ["1-clothes.png", "2-masks.jpg", "3-catvton.jpg", "4-repainted.jpg"]

    def test_debug_mode_is_off_by_default(self, monkeypatch, a_pose, tmp_path):
        monkeypatch.delenv(gpu_try_on.DEBUG_DIR_ENV, raising=False)
        monkeypatch.chdir(tmp_path)
        _patch_transport(monkeypatch, _fake_gpu({}))
        _run(pose=_pose(a_pose))
        assert list(tmp_path.iterdir()) == []

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
            return self.ANCHORS, "http://backend.test/tee.png", "long", "long"

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

    @staticmethod
    def _result(tip=None):
        return GpuTryOn(_encode(np.full((1024, 768, 3), 200, np.uint8), ".jpg"), tip)

    def test_uses_the_gpu_model_when_it_answers(self, monkeypatch, a_pose):
        async def gpu(*_args, **_kwargs):
            return self._result()

        self._patch(monkeypatch, a_pose, gpu)
        try_on = self._analyze()
        assert try_on["engine"] == "catvton"
        assert "tip" not in try_on
        decoded = Image.open(io.BytesIO(base64.b64decode(try_on["image"].split(",", 1)[1])))
        assert decoded.size == (768, 1024)

    def test_passes_the_products_garment_and_sleeve_length_to_the_gpu_model(self, monkeypatch, a_pose):
        seen = {}

        async def gpu(*_args, **kwargs):
            seen.update(kwargs)
            return self._result()

        self._patch(monkeypatch, a_pose, gpu)
        assert self._analyze()["engine"] == "catvton"
        assert seen["length"] == "long"
        assert seen["sleeves"] == "long"

    def test_reports_the_fitted_top_tip(self, monkeypatch, a_pose):
        async def gpu(*_args, **_kwargs):
            return self._result(FITTED_TOP_TIP)

        self._patch(monkeypatch, a_pose, gpu)
        try_on = self._analyze()
        assert try_on["engine"] == "catvton"
        assert try_on["tip"] == "FITTED_TOP"

    def test_falls_back_to_the_warp_when_the_gpu_fails(self, monkeypatch, a_pose):
        async def gpu(*_args, **_kwargs):
            raise TryOnError("GPU_UNREACHABLE")

        self._patch(monkeypatch, a_pose, gpu)
        try_on = self._analyze()
        assert try_on["engine"] == "warp"
        assert "tip" not in try_on
        assert try_on["image"].startswith("data:image/jpeg;base64,")
