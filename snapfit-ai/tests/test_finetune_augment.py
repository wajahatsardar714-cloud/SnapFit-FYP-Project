"""Training augmentation and report pictures for the SegFormer fine-tuning
notebook (snapfit-ai/gpu/finetune/augment.py and viz.py)."""

import importlib.util
import os

import numpy as np
import pytest

FINETUNE_DIR = os.path.join(os.path.dirname(__file__), os.pardir, "gpu", "finetune")


def _load(name):
    spec = importlib.util.spec_from_file_location(f"finetune_{name}", os.path.join(FINETUNE_DIR, name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


augment = _load("augment")
viz = _load("viz")


def test_flip_swaps_left_and_right_labels():
    labels = np.array([[14, 4, 15], [12, 0, 13], [9, 255, 10]], np.uint8)
    flipped = augment.flip_labels(labels)
    assert flipped.tolist() == [[14, 4, 15], [12, 0, 13], [9, 255, 10]]
    labels = np.array([[14, 4, 4]], np.uint8)
    assert augment.flip_labels(labels).tolist() == [[4, 4, 15]]


def test_train_transform_shapes_and_label_values():
    rng = np.random.default_rng(0)
    image = rng.integers(0, 256, (768, 512, 3), dtype=np.uint8)
    labels = rng.choice(np.array([0, 4, 6, 11, 14, 15, 255], np.uint8), size=(768, 512))
    for _ in range(20):
        out_image, out_labels = augment.train_transform(image, labels, rng)
        assert out_image.shape == (512, 512, 3) and out_image.dtype == np.uint8
        assert out_labels.shape == (512, 512) and out_labels.dtype == np.uint8
        assert set(np.unique(out_labels)) <= {0, 4, 6, 11, 14, 15, 255}


def test_train_transform_rejects_mismatched_sizes():
    with pytest.raises(ValueError):
        augment.train_transform(np.zeros((10, 10, 3), np.uint8), np.zeros((10, 11), np.uint8), np.random.default_rng(0))


def test_crop_box_is_inside_the_photo():
    rng = np.random.default_rng(1)
    for _ in range(200):
        y0, x0, h, w = augment.random_crop_box(768, 512, rng)
        assert 0 <= y0 and 0 <= x0 and y0 + h <= 768 and x0 + w <= 512 and h > 0 and w > 0


def test_color_jitter_keeps_shape():
    image = np.full((8, 8, 3), 128, np.uint8)
    out = augment.color_jitter(image, np.random.default_rng(2))
    assert out.shape == image.shape and out.dtype == np.uint8


def test_normalize():
    image = np.full((2, 2, 3), 255, np.uint8)
    out = augment.normalize(image, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5])
    assert out.shape == (3, 2, 2)
    assert np.allclose(out, 1.0)


def test_colorize_and_grid():
    labels = np.array([[0, 4], [17, 255]], np.uint8)
    colours = viz.colorize(labels)
    assert colours[0, 1].tolist() == viz.PALETTE[4].tolist()
    assert colours[1, 1].tolist() == [255, 255, 255]
    photo = np.zeros((60, 40, 3), np.uint8)
    rows = [(photo, np.full((60, 40), 4, np.uint8), np.full((60, 40), 7, np.uint8))] * 2
    grid = viz.comparison_grid(rows, captions=["a", "b"], row_height=50)
    assert grid.ndim == 3 and grid.shape[2] == 3 and grid.dtype == np.uint8
    assert len(viz.PALETTE) == len(viz.LABEL_NAMES) == 18
