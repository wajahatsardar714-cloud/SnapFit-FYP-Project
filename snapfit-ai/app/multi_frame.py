"""Combining the poses of several frames of the same shot into one.

A single camera frame gives jittery landmarks: a few pixels of noise move the
shoulder and hip spans, and so the size. The live camera sends the main photo
plus a few frames taken moments apart; their landmarks are combined here.
"""

from statistics import median


def combine_landmarks(landmark_sets):
    """Per-landmark, per-field median of several landmark dicts
    ({name: {"x", "y", "z", "visibility"}}, as extract_landmarks returns them).

    Median rather than mean because it is robust to one bad frame (a blink of
    motion blur, a mis-detected wrist): with three or more frames a single
    outlier can only move the result to a neighbouring good value, whereas it
    would shift a mean by its full error / n. Every landmark and field of the first set is combined over the
    sets that carry it, so the result has the first set's shape.
    """
    first = landmark_sets[0]
    return {
        name: {
            field: median(points[name][field] for points in landmark_sets if field in points.get(name, {}))
            for field in landmark
        }
        for name, landmark in first.items()
    }
