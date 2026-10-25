import cv2
import numpy as np
import pytest

from app.gpu_try_on import clothing_mask
from app.try_on_compositing import (
    FEATHER,
    MODEL_SIZE,
    composite_garment,
    fit_within,
    from_model_frame,
    to_model_frame,
)

W, H = 768, 1024
RED = (30, 30, 210)


class TestModelFrame:
    def test_padding_round_trip_is_exact(self):
        # 700x1024 pads straight to 768x1024: no resampling either way.
        photo = np.random.default_rng(0).integers(0, 256, (1024, 700, 3), dtype=np.uint8)
        frame = to_model_frame(photo, cv2.BORDER_REPLICATE)
        assert frame.shape == (1024, 768, 3)
        assert np.array_equal(frame[:, 34:734], photo)
        assert np.array_equal(frame[:, 0], photo[:, 0])
        assert np.array_equal(frame[:, -1], photo[:, -1])
        assert np.array_equal(from_model_frame(frame, 700, 1024), photo)

    def test_masks_are_padded_with_zeros(self):
        frame = to_model_frame(np.full((1024, 700), 255, np.uint8), cv2.BORDER_CONSTANT)
        assert frame[:, :34].max() == 0
        assert frame[:, 734:].max() == 0
        assert frame[:, 34:734].min() == 255

    @pytest.mark.parametrize("width, height", [(1200, 900), (900, 1000), (1536, 2048)])
    def test_points_map_back_through_the_model_resolution(self, width, height):
        # A marker in the top-right corner, which the server's centre crop
        # would cut from an unpadded landscape photo.
        photo = np.zeros((height, width), np.uint8)
        x, y = width - 30, 30
        photo[y - 20 : y + 21, x - 20 : x + 21] = 255

        frame = to_model_frame(photo, cv2.BORDER_CONSTANT)
        assert frame.shape == (MODEL_SIZE[1], MODEL_SIZE[0])
        assert frame.max() == 255

        back = from_model_frame(frame, width, height)
        assert back.shape == (height, width)
        moments = cv2.moments(back)
        assert moments["m10"] / moments["m00"] == pytest.approx(x, abs=0.5)
        assert moments["m01"] / moments["m00"] == pytest.approx(y, abs=0.5)


class TestFitWithin:
    def test_caps_the_longest_side(self):
        assert fit_within(np.zeros((3200, 2400, 3), np.uint8)).shape == (1600, 1200, 3)

    def test_leaves_smaller_photos_alone(self):
        photo = np.zeros((H, W, 3), np.uint8)
        assert fit_within(photo) is photo


class TestCompositeGarment:
    def test_pixels_outside_the_mask_are_the_original(self, a_pose):
        photo = np.random.default_rng(1).integers(0, 256, (H, W, 3), dtype=np.uint8)
        generated = np.full((H, W, 3), RED, np.uint8)
        mask = clothing_mask(a_pose["landmarks"], W, H)

        result = composite_garment(photo, generated, mask)

        assert result.shape == photo.shape
        assert np.array_equal(result[mask <= 127], photo[mask <= 127])
        deep_inside = cv2.erode(mask, np.ones((61, 61), np.uint8)) > 0
        assert np.array_equal(result[deep_inside], generated[deep_inside])

    def test_sharpens_the_garment(self, a_pose):
        photo = np.full((H, W, 3), 128, np.uint8)
        stripes = np.full((H, W, 3), 100, np.uint8)
        stripes[:, ::8] = 160
        generated = cv2.GaussianBlur(stripes, (0, 0), 1.5)
        mask = clothing_mask(a_pose["landmarks"], W, H)

        result = composite_garment(photo, generated, mask)

        deep_inside = cv2.erode(mask, np.ones((61, 61), np.uint8)) > 0
        assert result[deep_inside].std() > 1.1 * generated[deep_inside].std()

    def test_the_seam_is_feathered_inside_the_mask(self, a_pose):
        photo = np.full((H, W, 3), 100, np.uint8)
        generated = np.full((H, W, 3), 200, np.uint8)
        mask = clothing_mask(a_pose["landmarks"], W, H)

        result = composite_garment(photo, generated, mask)

        distance = cv2.distanceTransform((mask > 127).astype(np.uint8), cv2.DIST_L2, 5)
        halfway = np.abs(distance - FEATHER / 2) < 0.5
        assert result[halfway].mean() == pytest.approx(150, abs=10)
