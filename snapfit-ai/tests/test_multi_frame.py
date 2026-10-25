import pytest

from app.multi_frame import combine_landmarks


def _frame(x, y=0.5, z=0.0, visibility=0.9):
    return {"LEFT_SHOULDER": {"x": x, "y": y, "z": z, "visibility": visibility}}


def test_takes_the_median_of_every_field():
    combined = combine_landmarks(
        [_frame(0.60, 0.25, -0.1, 0.9), _frame(0.62, 0.26, 0.0, 0.8), _frame(0.61, 0.24, 0.1, 0.95)]
    )
    assert combined == {"LEFT_SHOULDER": {"x": 0.61, "y": 0.25, "z": 0.0, "visibility": 0.9}}


def test_an_even_count_averages_the_middle_two():
    combined = combine_landmarks([_frame(0.60), _frame(0.70), _frame(0.62), _frame(0.64)])
    assert combined["LEFT_SHOULDER"]["x"] == pytest.approx(0.63)


def test_one_set_is_returned_unchanged():
    assert combine_landmarks([_frame(0.6)]) == _frame(0.6)


def test_a_single_outlier_frame_barely_moves_the_result():
    steady = [_frame(0.610), _frame(0.612), _frame(0.608), _frame(0.611)]
    combined = combine_landmarks([*steady, _frame(0.90)])
    assert combined["LEFT_SHOULDER"]["x"] == pytest.approx(0.611)


def test_combines_every_landmark_independently():
    sets = [
        {"NOSE": {"x": 0.5, "y": 0.1}, "LEFT_HIP": {"x": 0.57, "y": 0.53}},
        {"NOSE": {"x": 0.6, "y": 0.2}, "LEFT_HIP": {"x": 0.55, "y": 0.51}},
        {"NOSE": {"x": 0.4, "y": 0.3}, "LEFT_HIP": {"x": 0.56, "y": 0.52}},
    ]
    assert combine_landmarks(sets) == {"NOSE": {"x": 0.5, "y": 0.2}, "LEFT_HIP": {"x": 0.56, "y": 0.52}}


def test_keeps_the_first_sets_fields_when_another_lacks_one():
    combined = combine_landmarks([_frame(0.60), {"LEFT_SHOULDER": {"x": 0.62, "y": 0.5, "visibility": 0.9}}])
    assert combined["LEFT_SHOULDER"]["z"] == 0.0
    assert combined["LEFT_SHOULDER"]["x"] == pytest.approx(0.61)
