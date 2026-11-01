import 'package:flutter/material.dart';

import '../theme/snap_colors.dart';

const _logoAsset = 'assets/images/snapfit-logo.png';

/// The SnapFit logo (shirt mark and wordmark), the same image as the website.
/// [height] sets its size. In dark mode it sits on a light chip so the navy
/// wordmark stays readable.
class Logo extends StatelessWidget {
  const Logo({super.key, this.height = 36});

  final double height;

  @override
  Widget build(BuildContext context) {
    final image = Image.asset(
      _logoAsset,
      height: height,
      filterQuality: FilterQuality.medium,
      semanticLabel: 'SnapFit',
    );
    if (Theme.of(context).brightness == Brightness.light) return image;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(color: context.colors.inverse, borderRadius: BorderRadius.circular(8)),
      child: image,
    );
  }
}
