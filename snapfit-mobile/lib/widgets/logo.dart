import 'package:flutter/material.dart';

const _logoAsset = 'assets/images/snapfit-logo.webp';

/// The SnapFit logo: the round navy badge with the shirt, the tape measure
/// and the wordmark. [height] sets its size. The badge carries its own navy
/// background, so it reads the same in light and dark mode.
class Logo extends StatelessWidget {
  const Logo({super.key, this.height = 56});

  final double height;

  @override
  Widget build(BuildContext context) {
    return Image.asset(_logoAsset, height: height, filterQuality: FilterQuality.medium, semanticLabel: 'SnapFit');
  }
}
