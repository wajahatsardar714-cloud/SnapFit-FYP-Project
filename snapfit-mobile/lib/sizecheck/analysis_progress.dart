import 'dart:async';

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import '../widgets/motion.dart';
import '../widgets/ui.dart';
import 'pose_guide.dart';

/// The checklist under the scan: each step is current from [after] seconds
/// until the next starts; the last stays current until the result arrives.
const _steps = [
  (after: 0, label: 'Finding your pose', tryOnOnly: false),
  (after: 2, label: 'Measuring your body', tryOnOnly: false),
  (after: 4, label: 'Matching the size chart', tryOnOnly: false),
  (after: 5, label: 'Creating your try-on preview', tryOnOnly: true),
];

/// While a photo is analysed: a body outline being scanned, the current
/// stage, a checklist of what's happening, a moving bar and the seconds
/// elapsed. The try-on can take up to a minute on the GPU, so the copy changes
/// as time passes. Mounted only while the request is in flight.
class AnalysisProgress extends StatefulWidget {
  const AnalysisProgress({super.key, required this.includesTryOn});

  final bool includesTryOn;

  @override
  State<AnalysisProgress> createState() => _AnalysisProgressState();
}

class _AnalysisProgressState extends State<AnalysisProgress> {
  late final Timer _timer;
  int _elapsed = 0;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) => setState(() => _elapsed = timer.tick));
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  String get _message {
    if (!widget.includesTryOn || _elapsed < 5) return 'Measuring you…';
    if (_elapsed < 30) return 'Creating your try-on preview — this can take up to a minute.';
    return 'Almost there — your preview is still rendering…';
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final steps = _steps.where((s) => widget.includesTryOn || !s.tryOnOnly).toList();
    final current = steps.where((s) => _elapsed >= s.after).length - 1;
    return FadeSlideIn(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: Column(
          children: [
            const _ScanFigure(),
            gap24,
            Semantics(
              liveRegion: true,
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 300),
                child: Text(
                  _message,
                  key: ValueKey(_message),
                  textAlign: TextAlign.center,
                  style: snapText(size: 14, weight: FontWeight.w500, color: c.foreground),
                ),
              ),
            ),
            gap16,
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 300),
              child: Column(
                children: [
                  for (var i = 0; i < steps.length; i++)
                    _StepRow(label: steps[i].label, done: i < current, active: i == current),
                ],
              ),
            ),
            gap16,
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 300),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(99),
                child: LinearProgressIndicator(minHeight: 4, backgroundColor: c.surface2, color: c.primary),
              ),
            ),
            gap8,
            Text(
              '$_elapsed s elapsed',
              style: snapText(size: 12, color: c.mutedForeground, fontFeatures: const [FontFeature.tabularFigures()]),
            ),
          ],
        ),
      ),
    );
  }
}

class _StepRow extends StatelessWidget {
  const _StepRow({required this.label, required this.done, required this.active});

  final String label;
  final bool done;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 250),
            width: 20,
            height: 20,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: done ? c.success : (active ? c.primarySoft : Colors.transparent),
              border: done || active ? null : Border.all(color: c.border),
            ),
            child: done
                ? Icon(LucideIcons.check, size: 12, color: c.primaryForeground)
                : active
                ? const _PulsingDot()
                : null,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: snapText(
                size: 14,
                weight: active ? FontWeight.w500 : FontWeight.w400,
                color: done ? c.mutedForeground : (active ? c.foreground : c.muted),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PulsingDot extends StatefulWidget {
  const _PulsingDot();

  @override
  State<_PulsingDot> createState() => _PulsingDotState();
}

class _PulsingDotState extends State<_PulsingDot> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    reduceMotion(context) ? _controller.value = 1 : _controller.repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Center(
    child: FadeTransition(
      opacity: Tween<double>(begin: 0.35, end: 1).animate(_controller),
      child: Container(
        width: 8,
        height: 8,
        decoration: BoxDecoration(color: context.colors.primary, shape: BoxShape.circle),
      ),
    ),
  );
}

/// The A-pose outline in a viewfinder, with a scan line sweeping up and down.
class _ScanFigure extends StatefulWidget {
  const _ScanFigure();

  @override
  State<_ScanFigure> createState() => _ScanFigureState();
}

class _ScanFigureState extends State<_ScanFigure> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    reduceMotion(context) ? _controller.value = 0.5 : _controller.repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    const width = 132.0;
    const height = 184.0;
    return ExcludeSemantics(
      child: SizedBox(
        width: width,
        height: height,
        child: Stack(
          children: [
            Positioned.fill(child: CustomPaint(painter: _CornersPainter(c.primary))),
            Positioned.fill(
              child: Padding(
                padding: const EdgeInsets.all(10),
                child: CustomPaint(painter: PoseGuidePainter(color: c.primary)),
              ),
            ),
            AnimatedBuilder(
              animation: CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
              builder: (context, _) {
                final y = 10 + _controller.value * (height - 20);
                return Positioned(
                  left: 6,
                  right: 6,
                  top: y - 18,
                  height: 36,
                  child: Stack(
                    children: [
                      Positioned.fill(
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [
                                c.primary.withValues(alpha: 0),
                                c.primary.withValues(alpha: 0.22),
                                c.primary.withValues(alpha: 0),
                              ],
                            ),
                          ),
                        ),
                      ),
                      Align(
                        child: Container(
                          height: 2,
                          decoration: BoxDecoration(color: c.primary, borderRadius: BorderRadius.circular(2)),
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

/// Four viewfinder corners, like the logo.
class _CornersPainter extends CustomPainter {
  _CornersPainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    const l = 20.0;
    const r = 8.0;
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round;
    final w = size.width;
    final h = size.height;
    final corners = Path()
      ..moveTo(0, l)
      ..lineTo(0, r)
      ..arcToPoint(const Offset(r, 0), radius: const Radius.circular(r))
      ..lineTo(l, 0)
      ..moveTo(w - l, 0)
      ..lineTo(w - r, 0)
      ..arcToPoint(Offset(w, r), radius: const Radius.circular(r))
      ..lineTo(w, l)
      ..moveTo(w, h - l)
      ..lineTo(w, h - r)
      ..arcToPoint(Offset(w - r, h), radius: const Radius.circular(r))
      ..lineTo(w - l, h)
      ..moveTo(l, h)
      ..lineTo(r, h)
      ..arcToPoint(Offset(0, h - r), radius: const Radius.circular(r))
      ..lineTo(0, h - l);
    canvas.drawPath(corners, paint);
  }

  @override
  bool shouldRepaint(_CornersPainter old) => old.color != color;
}
