// The live camera's fitted guide: a body outline drawn on the shopper's own
// detected pose, so it follows them -- arms open, it opens; they step closer,
// it grows -- and is as broad or slim as they are. A port of the web app's
// src/utils/fittedGuide.js.
import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'pose_rules.dart';

// Landmark indices (BlazePose / ML Kit order).
const _nose = 0, _leftEar = 7, _rightEar = 8, _leftShoulder = 11, _rightShoulder = 12;
const _leftElbow = 13, _rightElbow = 14, _leftWrist = 15, _rightWrist = 16;
const _leftHip = 23, _rightHip = 24, _leftKnee = 25, _rightKnee = 26, _leftAnkle = 27, _rightAnkle = 28;
const _leftFootIndex = 31, _rightFootIndex = 32;

/// A point counts for drawing a little below the gate's visibility threshold,
/// so a limb that flickers in and out stays drawn.
const drawVisibility = 0.35;

// Thicknesses as fractions of the shoulder width; _loose puts the outline a
// little outside the body.
const _loose = 1.12;
const _neck = 0.3, _upperArm = 0.34, _forearm = 0.27, _hand = 0.22, _thigh = 0.44, _shin = 0.31, _foot = 0.22;

enum BodyRegion { head, torso, arms, legs }

sealed class GuideShape {
  const GuideShape(this.region);
  final BodyRegion region;
}

class LineShape extends GuideShape {
  const LineShape(super.region, this.a, this.b, this.width);
  final Offset a;
  final Offset b;
  final double width;
}

class EllipseShape extends GuideShape {
  const EllipseShape(super.region, this.center, this.rx, this.ry);
  final Offset center;
  final double rx;
  final double ry;
}

class PolygonShape extends GuideShape {
  const PolygonShape(super.region, this.points);
  final List<Offset> points;
}

Offset _unit(Offset v) => v.distance == 0 ? const Offset(0, 1) : v / v.distance;
Offset _lerp(Offset a, Offset b, double t) => Offset.lerp(a, b, t)!;

/// The outline's shapes in pixels of [size], or null without a torso.
List<GuideShape>? fitBodyShapes(List<Lm?>? landmarks, Size size) {
  if (landmarks == null || landmarks.length < 33) return null;
  Offset? pt(int i) {
    final lm = landmarks[i];
    return lm != null && lm.visibility >= drawVisibility ? Offset(lm.x * size.width, lm.y * size.height) : null;
  }

  final ls = pt(_leftShoulder), rs = pt(_rightShoulder), lh = pt(_leftHip), rh = pt(_rightHip);
  if (ls == null || rs == null || lh == null || rh == null) return null;

  final shoulderMid = _lerp(ls, rs, 0.5);
  final hipMid = _lerp(lh, rh, 0.5);
  final torsoLength = (hipMid - shoulderMid).distance;
  final s = math.max((ls - rs).distance, torsoLength * 0.55);
  final across = _unit(ls - rs);
  final down = _unit(hipMid - shoulderMid);
  final shapes = <GuideShape>[];

  // Torso: shoulders, a waist and hips, wider than the joints themselves.
  final shoulderHalf = s / 2 * _loose + s * 0.06;
  final hipHalf = math.max((lh - rh).distance / 2 * 1.4, s * 0.4) * _loose;
  final waistHalf = (shoulderHalf + hipHalf) / 2 * 0.86;
  final waistMid = _lerp(shoulderMid, hipMid, 0.6);
  final crotch = hipMid + down * (s * 0.16);
  Offset side(Offset mid, double half, double sign) => mid + across * (half * sign);
  Offset top(Offset p) => p - down * (s * 0.04);
  shapes.add(
    PolygonShape(BodyRegion.torso, [
      top(side(shoulderMid, shoulderHalf, 1)),
      side(waistMid, waistHalf, 1),
      side(hipMid, hipHalf, 1),
      side(crotch, hipHalf * 0.35, 1),
      side(crotch, hipHalf * 0.35, -1),
      side(hipMid, hipHalf, -1),
      side(waistMid, waistHalf, -1),
      top(side(shoulderMid, shoulderHalf, -1)),
    ]),
  );

  // Head and neck, from the ears (or the nose) above the shoulders.
  final nose = pt(_nose), le = pt(_leftEar), re = pt(_rightEar);
  final headX = le != null && re != null ? (le.dx + re.dx) / 2 : (nose?.dx ?? shoulderMid.dx);
  final headBase = nose ?? shoulderMid - down * (s * 0.55);
  final rx = s * 0.3 * _loose;
  final ry = rx * 1.28;
  final headCenter = Offset(headX, headBase.dy - ry * 0.18);
  shapes.add(LineShape(BodyRegion.head, headCenter + down * (ry * 0.6), shoulderMid, s * _neck));
  shapes.add(EllipseShape(BodyRegion.head, headCenter, rx, ry));

  void limb(BodyRegion region, Offset? from, Offset? to, double w) {
    if (from != null && to != null) shapes.add(LineShape(region, from, to, s * w * _loose));
  }

  for (final (shoulder, elbow, wrist) in [
    (ls, pt(_leftElbow), pt(_leftWrist)),
    (rs, pt(_rightElbow), pt(_rightWrist)),
  ]) {
    limb(BodyRegion.arms, _lerp(shoulder, shoulderMid, 0.12), elbow, _upperArm);
    limb(BodyRegion.arms, elbow, wrist, _forearm);
    if (elbow != null && wrist != null) limb(BodyRegion.arms, wrist, wrist + _unit(wrist - elbow) * (s * 0.16), _hand);
  }
  for (final (hip, knee, ankle, toe) in [
    (lh, pt(_leftKnee), pt(_leftAnkle), pt(_leftFootIndex)),
    (rh, pt(_rightKnee), pt(_rightAnkle), pt(_rightFootIndex)),
  ]) {
    limb(BodyRegion.legs, hip, knee, _thigh);
    limb(BodyRegion.legs, knee, ankle, _shin);
    limb(BodyRegion.legs, ankle, toe ?? (ankle == null ? null : ankle + down * (s * 0.12)), _foot);
  }
  return shapes;
}

/// Eases the drawn pose toward the newest detection so the outline glides
/// between detections. [alpha] 0..1 is how far to move this frame.
List<Lm?>? smoothLandmarks(List<Lm?>? previous, List<Lm?>? target, double alpha) {
  if (target == null) return previous;
  if (previous == null || previous.length != target.length) return List.of(target);
  return [
    for (var i = 0; i < target.length; i++)
      if (target[i] == null || previous[i] == null)
        target[i]
      else
        target[i]!.copyWith(
          x: previous[i]!.x + (target[i]!.x - previous[i]!.x) * alpha,
          y: previous[i]!.y + (target[i]!.y - previous[i]!.y) * alpha,
          visibility: previous[i]!.visibility + (target[i]!.visibility - previous[i]!.visibility) * alpha,
        ),
  ];
}

const _armFixes = ['Straighten your arms', 'Move your arms slightly away from your body', 'Lower your arms a little'];
const _legFixes = [
  'Straighten your legs',
  'Stand with your feet hip-width apart',
  'Bring your feet a little closer together',
];

enum GuideTone { foreground, warning, success }

/// The outline's colour per region: all success once the pose passes; the
/// part the current instruction is about in warning; the rest foreground.
Map<BodyRegion, GuideTone> regionTones(PoseResult? result) {
  final tones = {for (final r in BodyRegion.values) r: GuideTone.foreground};
  if (result == null) return tones;
  if (result.ok) return {for (final r in BodyRegion.values) r: GuideTone.success};
  final instruction = result.instruction;
  if (_armFixes.contains(instruction)) {
    tones[BodyRegion.arms] = GuideTone.warning;
  } else if (_legFixes.contains(instruction)) {
    tones[BodyRegion.legs] = GuideTone.warning;
  } else if (result.failingId == 'level' || result.failingId == 'facing') {
    tones[BodyRegion.torso] = GuideTone.warning;
    tones[BodyRegion.head] = GuideTone.warning;
  }
  return tones;
}

typedef HintArrow = ({Offset at, Offset direction});

/// Arrows showing which way to move, for instructions a body part can act out.
List<HintArrow> hintArrows(PoseResult? result, List<Lm?>? landmarks, Size size) {
  if (result == null || result.ok || landmarks == null || landmarks.length < 33) return const [];
  Offset? pt(int i) =>
      landmarks[i] == null ? null : Offset(landmarks[i]!.x * size.width, landmarks[i]!.y * size.height);
  final ls = pt(_leftShoulder), rs = pt(_rightShoulder);
  if (ls == null || rs == null) return const [];
  final midX = (ls.dx + rs.dx) / 2;
  Offset outward(Offset p) => Offset(p.dx >= midX ? 1 : -1, 0);
  List<HintArrow> at(List<int> indices, Offset Function(Offset) direction) => [
    for (final i in indices)
      if (pt(i) case final p?) (at: p, direction: direction(p)),
  ];
  return switch (result.instruction) {
    'Move your arms slightly away from your body' => at([_leftWrist, _rightWrist], outward),
    'Lower your arms a little' => at([_leftWrist, _rightWrist], (_) => const Offset(0, 1)),
    'Stand with your feet hip-width apart' => at([_leftAnkle, _rightAnkle], outward),
    'Bring your feet a little closer together' => at([_leftAnkle, _rightAnkle], (p) => -outward(p)),
    _ => const [],
  };
}

/// Paints the fitted outline: a faint fill of the body, a bright outline
/// around the union of its parts (each in its region's colour) and any hint
/// arrows. [landmarks] are normalised to the painted area.
class FittedGuidePainter extends CustomPainter {
  FittedGuidePainter({required this.landmarks, required this.result, required this.colors});

  final List<Lm?>? landmarks;
  final PoseResult? result;
  final Map<GuideTone, Color> colors;

  void _trace(Canvas canvas, GuideShape shape, double extra, Paint paint) {
    switch (shape) {
      case LineShape(:final a, :final b, :final width):
        canvas.drawLine(
          a,
          b,
          Paint()
            ..color = paint.color
            ..blendMode = paint.blendMode
            ..strokeWidth = width + extra * 2
            ..strokeCap = StrokeCap.round,
        );
      case EllipseShape(:final center, :final rx, :final ry):
        canvas.drawOval(Rect.fromCenter(center: center, width: (rx + extra) * 2, height: (ry + extra) * 2), paint);
      case PolygonShape(:final points):
        final path = Path()..addPolygon(points, true);
        canvas.drawPath(path, paint);
        if (extra > 0) {
          canvas.drawPath(
            path,
            Paint()
              ..color = paint.color
              ..blendMode = paint.blendMode
              ..style = PaintingStyle.stroke
              ..strokeWidth = extra * 2
              ..strokeJoin = StrokeJoin.round,
          );
        }
    }
  }

  @override
  void paint(Canvas canvas, Size size) {
    final shapes = fitBodyShapes(landmarks, size);
    if (shapes == null) return;
    final tones = regionTones(result);
    final outline = math.max(size.width, size.height) / 160;
    final bounds = Offset.zero & size;
    Paint fill(GuideShape s) => Paint()..color = colors[tones[s.region]]!;

    // Faint body fill, painted solid as one layer then laid down faintly so
    // overlapping parts don't stack into darker spots.
    canvas.saveLayer(bounds, Paint()..color = const Color.fromRGBO(0, 0, 0, 0.14));
    for (final s in shapes) {
      _trace(canvas, s, 0, fill(s));
    }
    canvas.restore();

    // Outline of the union: each part grown in its colour, the plain parts
    // cut out of it.
    canvas.saveLayer(bounds, Paint()..color = const Color.fromRGBO(0, 0, 0, 0.95));
    for (final s in shapes) {
      _trace(canvas, s, outline, fill(s));
    }
    final clear = Paint()..blendMode = BlendMode.clear;
    for (final s in shapes) {
      _trace(canvas, s, 0, clear);
    }
    canvas.restore();

    final arrowPaint = Paint()
      ..color = colors[GuideTone.warning]!
      ..strokeWidth = outline * 1.4
      ..strokeCap = StrokeCap.round;
    for (final arrow in hintArrows(result, landmarks, size)) {
      final unitSize = outline * 5;
      final start = arrow.at + arrow.direction * (unitSize * 0.6);
      final end = start + arrow.direction * (unitSize * 1.4);
      final normal = Offset(-arrow.direction.dy, arrow.direction.dx);
      canvas.drawLine(start, end, arrowPaint);
      canvas.drawPath(
        Path()
          ..moveTo(end.dx + arrow.direction.dx * unitSize * 0.3, end.dy + arrow.direction.dy * unitSize * 0.3)
          ..lineTo(
            end.dx - arrow.direction.dx * unitSize * 0.4 + normal.dx * unitSize * 0.5,
            end.dy - arrow.direction.dy * unitSize * 0.4 + normal.dy * unitSize * 0.5,
          )
          ..lineTo(
            end.dx - arrow.direction.dx * unitSize * 0.4 - normal.dx * unitSize * 0.5,
            end.dy - arrow.direction.dy * unitSize * 0.4 - normal.dy * unitSize * 0.5,
          )
          ..close(),
        Paint()..color = colors[GuideTone.warning]!,
      );
    }
  }

  @override
  bool shouldRepaint(FittedGuidePainter old) =>
      old.landmarks != landmarks || old.result != result || old.colors != colors;
}
