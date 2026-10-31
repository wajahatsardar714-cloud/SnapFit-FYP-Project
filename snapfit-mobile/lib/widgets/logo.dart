import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';

/// The SnapFit mark (blue rounded square, scan corners and a person) and name.
class Logo extends StatelessWidget {
  const Logo({super.key, this.inverse = false, this.size = 32, this.showName = true});

  final bool inverse;
  final double size;
  final bool showName;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        CustomPaint(size: Size.square(size), painter: _LogoPainter(c.primary, c.inverse)),
        if (showName) ...[
          const SizedBox(width: 10),
          Text(
            'SnapFit',
            style: snapText(
              size: 20,
              weight: FontWeight.w700,
              color: inverse ? c.inverse : c.navy,
              letterSpacing: -0.4,
            ),
          ),
        ],
      ],
    );
  }
}

class _LogoPainter extends CustomPainter {
  _LogoPainter(this.fill, this.ink);

  final Color fill;
  final Color ink;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 32);
    canvas.drawRRect(RRect.fromLTRBR(0, 0, 32, 32, const Radius.circular(8)), Paint()..color = fill);
    final stroke = Paint()
      ..color = ink
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final corners = Path()
      ..moveTo(9, 12)
      ..lineTo(9, 9)
      ..lineTo(12, 9)
      ..moveTo(20, 9)
      ..lineTo(23, 9)
      ..lineTo(23, 12)
      ..moveTo(23, 20)
      ..lineTo(23, 23)
      ..lineTo(20, 23)
      ..moveTo(12, 23)
      ..lineTo(9, 23)
      ..lineTo(9, 20);
    canvas.drawPath(corners, stroke);
    final shoulders = Path()
      ..moveTo(12.5, 21.5)
      ..cubicTo(13.3, 19.1, 14.5, 18, 16, 18)
      ..cubicTo(17.5, 18, 18.7, 19.1, 19.5, 21.5);
    canvas.drawPath(shoulders, stroke);
    canvas.drawCircle(const Offset(16, 13.5), 2.5, Paint()..color = ink);
  }

  @override
  bool shouldRepaint(_LogoPainter old) => old.fill != fill || old.ink != ink;
}
