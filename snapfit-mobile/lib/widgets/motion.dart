// Light, purposeful motion shared by the app: entrances, shimmering loading
// placeholders. Everything here stands still when the phone asks for less
// motion (Settings > Accessibility > Remove animations).
import 'package:flutter/material.dart';

import '../theme/snap_colors.dart';

/// Whether the phone asks for less motion.
bool reduceMotion(BuildContext context) => MediaQuery.maybeDisableAnimationsOf(context) ?? false;

/// Fades its child in while lifting it a little. [delay] staggers a list of
/// them; it is part of the animation (no timers), so nothing is left pending.
class FadeSlideIn extends StatefulWidget {
  const FadeSlideIn({
    super.key,
    required this.child,
    this.delay = Duration.zero,
    this.duration = const Duration(milliseconds: 380),
    this.offset = 14,
  });

  final Widget child;
  final Duration delay;
  final Duration duration;
  final double offset;

  @override
  State<FadeSlideIn> createState() => _FadeSlideInState();
}

class _FadeSlideInState extends State<FadeSlideIn> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: widget.delay + widget.duration,
  );
  late final Animation<double> _t = CurvedAnimation(
    parent: _controller,
    curve: Interval(
      widget.delay.inMicroseconds / (widget.delay + widget.duration).inMicroseconds,
      1,
      curve: Curves.easeOutCubic,
    ),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_controller.isDismissed) {
      reduceMotion(context) ? _controller.value = 1 : _controller.forward();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _t,
      child: widget.child,
      builder: (context, child) => Opacity(
        opacity: _t.value,
        child: Transform.translate(offset: Offset(0, (1 - _t.value) * widget.offset), child: child),
      ),
    );
  }
}

/// A grey block with a light sweep across it, standing in for content that
/// is loading.
class Shimmer extends StatefulWidget {
  const Shimmer({super.key, this.height = 16, this.width, this.radius = 8});

  final double height;
  final double? width;
  final double radius;

  @override
  State<Shimmer> createState() => _ShimmerState();
}

class _ShimmerState extends State<Shimmer> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1500),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (reduceMotion(context)) {
      _controller.stop();
    } else if (!_controller.isAnimating) {
      _controller.repeat();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final x = _controller.value * 3 - 1.5;
        return Container(
          height: widget.height,
          width: widget.width,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(widget.radius),
            gradient: LinearGradient(
              begin: Alignment(x - 1, 0),
              end: Alignment(x + 1, 0),
              colors: [c.surface2, c.border, c.surface2],
            ),
          ),
        );
      },
    );
  }
}

/// A page loading: title lines, four stat tiles and a card, shaped like the
/// dashboards so nothing jumps when the data arrives. [compact] is a few
/// lines, for a loading area inside a card.
class LoadingSkeleton extends StatelessWidget {
  const LoadingSkeleton({super.key, this.compact = false});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    if (compact) {
      return Semantics(
        label: 'Loading',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Shimmer(height: 14, width: 120),
            SizedBox(height: 10),
            Shimmer(height: 44),
            SizedBox(height: 10),
            Shimmer(height: 32, width: 140),
          ],
        ),
      );
    }
    return Semantics(
      label: 'Loading',
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Shimmer(height: 22, width: 200),
            const SizedBox(height: 8),
            const Shimmer(height: 14, width: 260),
            const SizedBox(height: 20),
            LayoutBuilder(
              builder: (context, box) {
                final width = (box.maxWidth - 12) / 2;
                return Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [for (var i = 0; i < 4; i++) Shimmer(height: 84, width: width, radius: 14)],
                );
              },
            ),
            const SizedBox(height: 16),
            const Shimmer(height: 180, radius: 14),
          ],
        ),
      ),
    );
  }
}
