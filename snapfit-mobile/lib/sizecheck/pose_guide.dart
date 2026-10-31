import 'dart:math' as math;

import 'package:flutter/material.dart';

// The web widget's A-pose guide (src/components/widget/PoseGuideOverlay.jsx
// and the POSE_GUIDE numbers in src/config/poseConfig.js): a classic
// 8-heads-tall figure sized to the middle of the accepted distance range, so
// standing inside it frames the shopper the way the AI service expects.
const _headsTall = 8.0;
const _bodyHeightFraction = (0.55 + 0.93) / 2;
const _headWidth = 0.75;
const _neckLength = 0.3;
const _shoulderY = 1.45;
const _shoulderWidth = 2.0;
const _waistY = 3.1;
const _waistWidth = 1.3;
const _hipY = 4.0;
const _hipWidth = 1.75;
const _crotchY = 4.25;
const _armLength = 3.3;
const _armAngleDeg = (8 + 60) / 2;
const _upperArmWidth = 0.5;
const _forearmWidth = 0.4;
const _legLength = 3.75;
const _thighWidth = 0.8;
const _ankleWidth = 0.4;
const _feetApart = 1.05;
const _outline = 0.07;

/// Draws the guide over the camera preview: a faint fill and a bright outline.
class PoseGuidePainter extends CustomPainter {
  PoseGuidePainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final unit = _bodyHeightFraction * size.height / _headsTall;
    final top = (size.height - _bodyHeightFraction * size.height) / 2;
    Offset px(double x, double y) => Offset(size.width / 2 + x * unit, top + y * unit);

    void drawFigure(Paint fill, double extra) {
      final stroke = Paint()
        ..color = fill.color
        ..blendMode = fill.blendMode
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round;

      // Head.
      canvas.drawOval(
        Rect.fromCenter(center: px(0, 0.5), width: (_headWidth + extra * 2) * unit, height: (1 + extra * 2) * unit),
        fill,
      );
      void line(Offset a, Offset b, double width) =>
          canvas.drawLine(a, b, stroke..strokeWidth = (width + extra) * unit);
      void polygon(List<Offset> points) {
        final path = Path()..addPolygon(points, true);
        canvas.drawPath(path, fill);
        canvas.drawPath(path, stroke..strokeWidth = (0.15 + extra) * unit);
      }

      line(px(0, 0.9), px(0, 1 + _neckLength + 0.2), 0.4);
      const shoulderHalf = _shoulderWidth / 2;
      const hipHalf = _hipWidth / 2;
      polygon([
        px(-shoulderHalf, _shoulderY),
        px(shoulderHalf, _shoulderY),
        px(_waistWidth / 2, _waistY),
        px(hipHalf, _hipY),
        px(hipHalf * 0.85, _crotchY),
        px(-hipHalf * 0.85, _crotchY),
        px(-hipHalf, _hipY),
        px(-_waistWidth / 2, _waistY),
      ]);
      const rad = _armAngleDeg * math.pi / 180;
      for (final side in [-1.0, 1.0]) {
        final sx = side * (shoulderHalf - _upperArmWidth / 2);
        const sy = _shoulderY + _upperArmWidth / 2;
        Offset along(double f) => px(sx + side * math.sin(rad) * _armLength * f, sy + math.cos(rad) * _armLength * f);
        line(along(0), along(0.45), _upperArmWidth);
        line(along(0.45), along(0.82), _forearmWidth);
        line(along(0.84), along(1), 0.32);

        final hipX = side * (hipHalf - _thighWidth / 2);
        const legTop = _crotchY - 0.35;
        final ankleX = side * _feetApart / 2;
        const ankleY = legTop + _legLength;
        polygon([
          px(hipX - _thighWidth / 2, legTop),
          px(hipX + _thighWidth / 2, legTop),
          px(ankleX + _ankleWidth / 2, ankleY),
          px(ankleX - _ankleWidth / 2, ankleY),
        ]);
        line(px(ankleX, ankleY), px(ankleX + side * 0.3, _headsTall - 0.1), 0.28);
      }
    }

    // Faint body fill.
    drawFigure(Paint()..color = color.withValues(alpha: 0.12), 0);
    // Outline of the union: a grown copy with the plain shape cut out of it.
    canvas.saveLayer(Offset.zero & size, Paint());
    drawFigure(Paint()..color = color.withValues(alpha: 0.9), _outline * 2);
    drawFigure(Paint()..blendMode = BlendMode.clear, 0);
    canvas.restore();
  }

  @override
  bool shouldRepaint(PoseGuidePainter old) => old.color != color;
}
