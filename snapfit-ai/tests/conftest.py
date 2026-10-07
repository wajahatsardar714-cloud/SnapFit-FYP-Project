import copy
import json
import os

import pytest

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


def _load(name):
    with open(os.path.join(FIXTURES_DIR, name), encoding="utf-8") as fixture_file:
        return json.load(fixture_file)


_A_POSE = _load("a_pose.json")


@pytest.fixture
def a_pose():
    """A correct, centred A-pose in a 768x1024 portrait frame (synthetic
    landmarks, so no model is needed). Fresh deep copy per test."""
    return copy.deepcopy(_A_POSE)
