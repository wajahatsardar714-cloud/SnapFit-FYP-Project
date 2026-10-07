import io

import pytest
from PIL import Image

from app.utils import calculate_confidence, decode_image, mean_brightness

EXIF_ORIENTATION = 0x0112
ROTATE_90_CW = 6


def _rotated_photo(fmt, mode="RGB"):
    """A 300x200 image whose EXIF says "display rotated 90 degrees", as phone
    cameras save portrait shots -- upright it is 200 wide, 300 tall."""
    image = Image.new(mode, (300, 200), (200, 50, 50, 255)[: len(mode)])
    exif = image.getexif()
    exif[EXIF_ORIENTATION] = ROTATE_90_CW
    buffer = io.BytesIO()
    image.save(buffer, fmt, exif=exif.tobytes())
    return buffer.getvalue()


@pytest.mark.parametrize("keep_alpha", [False, True])
def test_decode_image_applies_exif_orientation(keep_alpha):
    decoded = decode_image(_rotated_photo("JPEG"), keep_alpha=keep_alpha)
    assert decoded.shape[:2] == (300, 200)
    assert decoded.shape[2] == 3


def test_decode_image_keeps_alpha_channel_when_asked():
    decoded = decode_image(_rotated_photo("PNG", mode="RGBA"), keep_alpha=True)
    assert decoded.shape == (300, 200, 4)


def test_decode_image_returns_none_for_garbage():
    assert decode_image(b"not an image") is None
    assert decode_image(b"not an image", keep_alpha=True) is None


def test_mean_brightness_reads_luma():
    dark = decode_image(_rotated_photo("JPEG"))
    dark[:] = 10
    assert mean_brightness(dark) == pytest.approx(10, abs=1)


def test_confidence_gives_full_facing_score_to_front_facing_unmirrored_photo(a_pose):
    # LEFT_SHOULDER is on screen-right in an un-mirrored front-facing photo; the
    # facing score used to treat that as "not facing", capping confidence at 0.85.
    landmarks = a_pose["landmarks"]
    assert landmarks["LEFT_SHOULDER"]["x"] > landmarks["RIGHT_SHOULDER"]["x"]
    assert calculate_confidence(landmarks) > 0.95
