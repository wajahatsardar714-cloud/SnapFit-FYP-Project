import 'dart:convert';
import 'dart:io';
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:snapfit_mobile/sizecheck/fitted_guide.dart';
import 'package:snapfit_mobile/sizecheck/pose_rules.dart';

// The same synthetic A-pose (768x1024 portrait) the web and AI service tests use.
final _fixture = jsonDecode(File('test/fixtures/aPose.json').readAsStringSync()) as Map<String, dynamic>;
final _aspect = (_fixture['image_width'] as num) / (_fixture['image_height'] as num);
final _size = Size((_fixture['image_width'] as num).toDouble(), (_fixture['image_height'] as num).toDouble());

typedef Named = Map<String, Map<String, double>>;

/// The A-pose's 33 landmarks, with [mutate] applied to a name -> {x, y, z, visibility} map.
List<Lm?> landmarks([void Function(Named)? mutate]) {
  final Named named = {
    for (final e in (_fixture['landmarks'] as Map<String, dynamic>).entries)
      e.key: {for (final f in (e.value as Map<String, dynamic>).entries) f.key: (f.value as num).toDouble()},
  };
  mutate?.call(named);
  return [
    for (final name in landmarkNames)
      if (named[name] case final lm?)
        Lm(lm['x']!, lm['y']!, z: lm['z'] ?? 0, visibility: lm['visibility'] ?? 1)
      else
        null,
  ];
}

PoseResult validate(List<Lm?>? lms) => validatePose(lms, aspectRatio: _aspect, brightness: 120);
List<String> failedIds(PoseResult r) => [
  for (final c in r.checks)
    if (!c.passed && !c.skipped) c.id,
];

void armsDown(Named n) {
  for (final side in ['LEFT', 'RIGHT']) {
    n['${side}_ELBOW']!['x'] = n['${side}_SHOULDER']!['x']!;
    n['${side}_WRIST']!['x'] = n['${side}_SHOULDER']!['x']!;
  }
}

void main() {
  group('validatePose (the same verdicts as the web)', () {
    test('passes a correct A-pose', () {
      final result = validate(landmarks());
      expect(result.ok, isTrue);
      expect(result.alignment, 'aligned');
      expect(result.instruction, isNull);
    });

    test('reports no body as searching, every check failing', () {
      final result = validate(null);
      expect(result.ok, isFalse);
      expect(result.alignment, 'searching');
      expect(result.instruction, 'Step back so your feet are visible');
    });

    test('fails cropped feet on visibility and skips the geometric checks', () {
      final result = validate(landmarks((n) => n['LEFT_ANKLE']!['visibility'] = 0.1));
      expect(failedIds(result), ['visibility']);
      expect(result.instruction, 'Step back so your feet are visible');
      expect(result.checks.where((c) => c.skipped), isNotEmpty);
    });

    test('fails arms down by the sides on pose', () {
      final result = validate(landmarks(armsDown));
      expect(failedIds(result), ['pose']);
      expect(result.instruction, 'Move your arms slightly away from your body');
      expect(result.alignment, 'partial');
    });

    test('fails tilted shoulders on level', () {
      final result = validate(landmarks((n) => n['LEFT_SHOULDER']!['y'] = n['LEFT_SHOULDER']!['y']! + 0.06));
      expect(failedIds(result), contains('level'));
    });

    test('fails dark frames on lighting', () {
      final result = validatePose(landmarks(), aspectRatio: _aspect, brightness: 10);
      expect(result.instruction, "It's too dark — move somewhere brighter");
    });

    test('needs the body held still across the window', () {
      final still = [for (var i = 0; i <= 6; i++) (timeMs: i * 150, landmarks: landmarks())];
      expect(validatePose(still.last.landmarks, aspectRatio: _aspect, history: still).ok, isTrue);
      final moving = [
        for (var i = 0; i <= 6; i++) (timeMs: i * 150, landmarks: landmarks((n) => n['NOSE']!['x'] = 0.5 + i * 0.02)),
      ];
      expect(failedIds(validatePose(moving.last.landmarks, aspectRatio: _aspect, history: moving)), ['stillness']);
    });
  });

  group('fitted guide', () {
    List<GuideShape> region(List<GuideShape> shapes, BodyRegion r) => shapes.where((s) => s.region == r).toList();
    double torsoWidth(List<GuideShape> shapes) {
      final xs = (region(shapes, BodyRegion.torso).single as PolygonShape).points.map((p) => p.dx);
      return xs.reduce((a, b) => a > b ? a : b) - xs.reduce((a, b) => a < b ? a : b);
    }

    test('builds a torso, head, arms and legs on the pose', () {
      final shapes = fitBodyShapes(landmarks(), _size)!;
      expect(region(shapes, BodyRegion.torso), hasLength(1));
      expect(region(shapes, BodyRegion.head), hasLength(2));
      expect(region(shapes, BodyRegion.arms), hasLength(6));
      expect(region(shapes, BodyRegion.legs), hasLength(6));
    });

    test('follows the arms as they open', () {
      double spread(List<GuideShape> shapes) {
        final arms = region(shapes, BodyRegion.arms).cast<LineShape>().toList();
        return (arms[1].b.dx - arms[4].b.dx).abs();
      }

      final open = fitBodyShapes(
        landmarks((n) {
          n['LEFT_WRIST']!['x'] = n['LEFT_WRIST']!['x']! + 0.08;
          n['RIGHT_WRIST']!['x'] = n['RIGHT_WRIST']!['x']! - 0.08;
        }),
        _size,
      )!;
      expect(spread(open), greaterThan(spread(fitBodyShapes(landmarks(), _size)!) + 0.15 * _size.width));
    });

    test('is as broad as the person', () {
      final broad = fitBodyShapes(
        landmarks((n) {
          for (final pair in [
            ['LEFT_SHOULDER', 'RIGHT_SHOULDER'],
            ['LEFT_HIP', 'RIGHT_HIP'],
          ]) {
            final mid = (n[pair[0]]!['x']! + n[pair[1]]!['x']!) / 2;
            for (final name in pair) {
              n[name]!['x'] = mid + (n[name]!['x']! - mid) * 1.3;
            }
          }
        }),
        _size,
      )!;
      expect(torsoWidth(broad), greaterThan(torsoWidth(fitBodyShapes(landmarks(), _size)!) * 1.2));
    });

    test('needs shoulders and hips to draw', () {
      expect(fitBodyShapes(landmarks((n) => n['LEFT_HIP']!['visibility'] = 0), _size), isNull);
      expect(fitBodyShapes(null, _size), isNull);
    });

    test('smooths toward the newest detection', () {
      final eased = smoothLandmarks([const Lm(0, 0)], [const Lm(1, 0.5)], 0.5)!;
      expect(eased.single!.x, 0.5);
      expect(eased.single!.y, 0.25);
    });

    test('colours the arms amber with outward arrows when they are too close', () {
      final lms = landmarks(armsDown);
      final result = validate(lms);
      expect(regionTones(result)[BodyRegion.arms], GuideTone.warning);
      expect(regionTones(result)[BodyRegion.legs], GuideTone.foreground);
      final directions = hintArrows(result, lms, _size).map((a) => a.direction.dx).toList()..sort();
      expect(directions, [-1, 1]);
      expect(regionTones(validate(landmarks())).values.toSet(), {GuideTone.success});
    });
  });
}
