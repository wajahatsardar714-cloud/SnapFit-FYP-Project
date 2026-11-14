"""mIoU, kameez consistency, the gate and best-epoch choice for the
SegFormer fine-tuning notebook (snapfit-ai/gpu/finetune/metrics.py)."""

import importlib.util
import math
import os

import numpy as np
import pytest

FINETUNE_DIR = os.path.join(os.path.dirname(__file__), os.pardir, "gpu", "finetune")


def _load(name):
    spec = importlib.util.spec_from_file_location(f"finetune_{name}", os.path.join(FINETUNE_DIR, name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


metrics = _load("metrics")


def test_perfect_prediction():
    truth = np.array([[0, 4], [6, 4]])
    cm = metrics.confusion_matrix(truth, truth)
    assert metrics.mean_iou(cm) == pytest.approx(100.0)
    assert metrics.pixel_accuracy(cm) == pytest.approx(100.0)


def test_hand_made_miou():
    truth = np.array([[0, 0, 4, 4]])
    pred = np.array([[0, 4, 4, 4]])
    cm = metrics.confusion_matrix(pred, truth, num_classes=5)
    iou = metrics.per_class_iou(cm)
    assert iou[0] == pytest.approx(0.5)  # 1 / (2 + 1 - 1)
    assert iou[4] == pytest.approx(2 / 3)  # 2 / (2 + 3 - 2)
    assert all(math.isnan(iou[c]) for c in (1, 2, 3))
    assert metrics.mean_iou(cm) == pytest.approx((0.5 + 2 / 3) / 2 * 100)


def test_ignore_index_is_skipped():
    truth = np.array([[4, 255, 255]])
    pred = np.array([[4, 5, 7]])
    cm = metrics.confusion_matrix(pred, truth)
    assert cm.sum() == 1
    assert metrics.mean_iou(cm) == pytest.approx(100.0)


def test_false_positive_label_counts_as_zero():
    truth = np.array([[4, 4]])
    pred = np.array([[4, 5]])
    iou = metrics.per_class_iou(metrics.confusion_matrix(pred, truth))
    assert iou[5] == 0.0
    assert iou[4] == pytest.approx(0.5)


def test_confusion_rows_are_truth():
    cm = metrics.confusion_matrix(np.array([5]), np.array([4]))
    assert cm[4, 5] == 1 and cm.sum() == 1


def test_shape_mismatch_raises():
    with pytest.raises(ValueError):
        metrics.confusion_matrix(np.zeros((2, 2)), np.zeros((2, 3)))


def test_empty_matrix_is_nan():
    assert math.isnan(metrics.mean_iou(np.zeros((18, 18))))
    assert math.isnan(metrics.pixel_accuracy(np.zeros((18, 18))))


def test_confusion_adds_up_over_images():
    a = metrics.confusion_matrix(np.array([4, 6]), np.array([4, 6]))
    b = metrics.confusion_matrix(np.array([4]), np.array([6]))
    total = a + b
    assert total[6, 6] == 1 and total[6, 4] == 1 and total[4, 4] == 1


def test_kameez_consistency():
    garment = np.ones((10, 10), bool)
    pred = np.full((10, 10), 4)
    assert metrics.kameez_consistent(pred, garment)
    pred[0, :] = 5  # 10% skirt
    assert not metrics.kameez_consistent(pred, garment)
    pred[0, :] = 4
    pred[0, :4] = 7  # 4% dress, 96% top
    assert metrics.kameez_consistent(pred, garment)
    pred[0, :] = 6  # 10% pants: top share only 90%
    assert metrics.kameez_consistent(pred, garment)
    pred[1, 0] = 6  # 89%
    assert not metrics.kameez_consistent(pred, garment)
    assert not metrics.kameez_consistent(pred, np.zeros((10, 10), bool))


def test_rate():
    assert metrics.rate([True, False, True, True]) == pytest.approx(75.0)
    assert math.isnan(metrics.rate([]))


def test_gate_passes():
    result = metrics.gate(70.0, 69.2, 20.0, 80.0)
    assert result["recommended"]
    assert result["western_drop"] == pytest.approx(0.8)
    assert result["reasons"] == []


def test_gate_drop_exactly_one_point_passes():
    assert metrics.gate(70.0, 69.0, 20.0, 21.0)["recommended"]


def test_gate_fails_on_western_drop():
    result = metrics.gate(70.0, 68.5, 20.0, 90.0)
    assert not result["recommended"]
    assert "Western" in result["reasons"][0]


def test_gate_fails_without_kameez_gain():
    assert not metrics.gate(70.0, 71.0, 50.0, 50.0)["recommended"]
    assert not metrics.gate(70.0, 71.0, 50.0, 40.0)["recommended"]


def test_gate_fails_on_missing_scores():
    assert not metrics.gate(70.0, float("nan"), 20.0, 80.0)["recommended"]
    assert not metrics.gate(70.0, None, 20.0, 80.0)["recommended"]
    assert metrics.gate(np.float32(70.0), np.float32(69.5), 1, 2)["recommended"]


def test_choose_best_prefers_kameez_within_the_western_limit():
    history = [
        {"western_miou": 69.9, "kameez": 40.0, "synthetic_miou": 50},
        {"western_miou": 69.2, "kameez": 70.0, "synthetic_miou": 55},
        {"western_miou": 67.0, "kameez": 95.0, "synthetic_miou": 60},  # too much forgetting
    ]
    assert metrics.choose_best(history, base_western=70.0) == 1


def test_choose_best_falls_back_to_best_western():
    history = [
        {"western_miou": 66.0, "kameez": 90.0},
        {"western_miou": 67.5, "kameez": 80.0},
    ]
    assert metrics.choose_best(history, base_western=70.0) == 1


def test_choose_best_handles_nan_and_empty():
    assert metrics.choose_best([], 70.0) is None
    history = [{"western_miou": 69.5, "kameez": float("nan")}, {"western_miou": 69.4, "kameez": 10.0}]
    assert metrics.choose_best(history, 70.0) == 1


def test_choose_best_ties_keep_the_earlier_epoch():
    history = [{"western_miou": 69.5, "kameez": 50.0, "synthetic_miou": 1.0}] * 3
    assert metrics.choose_best(history, 70.0) == 0


def test_iou_table():
    table = metrics.iou_table(["A", "B", "C"], [0.5, None, float("nan")], [0.6, 0.2, None])
    lines = table.split("\n")
    assert lines[2] == "| A | 50.0 | 60.0 | +10.0 |"
    assert lines[3] == "| B | – | 20.0 | – |"
    assert len(lines) == 4  # C has no value on either side
