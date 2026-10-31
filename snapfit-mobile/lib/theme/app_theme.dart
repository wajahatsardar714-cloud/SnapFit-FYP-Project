import 'package:flutter/material.dart';

import 'snap_colors.dart';

const fontFamily = 'Manrope';

/// A Manrope text style. Manrope ships as one variable font, so the weight is
/// set on the wght axis as well as on [TextStyle.fontWeight].
TextStyle snapText({
  double size = 14,
  FontWeight weight = FontWeight.w400,
  Color? color,
  double? height,
  double? letterSpacing,
  TextDecoration? decoration,
  List<FontFeature>? fontFeatures,
}) {
  return TextStyle(
    fontFamily: fontFamily,
    fontSize: size,
    fontWeight: weight,
    fontVariations: [FontVariation('wght', weight.value.toDouble())],
    color: color,
    height: height,
    letterSpacing: letterSpacing,
    decoration: decoration,
    decorationColor: color,
    fontFeatures: fontFeatures,
  );
}

/// The web app's type scale (src/index.css, mobile sizes).
class TypeScale {
  static TextStyle h1(Color c) =>
      snapText(size: 32, weight: FontWeight.w700, color: c, height: 1.12, letterSpacing: -0.6);
  static TextStyle h2(Color c) =>
      snapText(size: 26, weight: FontWeight.w700, color: c, height: 1.2, letterSpacing: -0.3);
  static TextStyle h3(Color c) => snapText(size: 21, weight: FontWeight.w600, color: c, height: 1.4);
  static TextStyle h4(Color c) => snapText(size: 18, weight: FontWeight.w600, color: c, height: 1.45);
  static TextStyle body(Color c) => snapText(size: 16, color: c, height: 1.7);
  static TextStyle label(Color c) => snapText(size: 13, weight: FontWeight.w600, color: c, height: 1.5);
  static TextStyle eyebrow(Color c) =>
      snapText(size: 12, weight: FontWeight.w700, color: c, letterSpacing: 1.2, height: 1.5);
}

ThemeData buildTheme(Brightness brightness) {
  final c = brightness == Brightness.dark ? SnapColors.dark : SnapColors.light;
  final scheme = ColorScheme.fromSeed(seedColor: c.primary, brightness: brightness).copyWith(
    primary: c.primary,
    onPrimary: c.primaryForeground,
    surface: c.surface,
    onSurface: c.foreground,
    error: c.danger,
    outline: c.border,
    outlineVariant: c.border,
  );

  TextTheme textTheme() {
    final base = brightness == Brightness.dark ? Typography.whiteMountainView : Typography.blackMountainView;
    return base.apply(fontFamily: fontFamily, bodyColor: c.foreground, displayColor: c.foreground);
  }

  final fieldBorder = OutlineInputBorder(
    borderRadius: BorderRadius.circular(8),
    borderSide: BorderSide(color: c.border),
  );

  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    fontFamily: fontFamily,
    textTheme: textTheme(),
    scaffoldBackgroundColor: c.background,
    extensions: [c],
    dividerTheme: DividerThemeData(color: c.border, thickness: 1, space: 1),
    appBarTheme: AppBarTheme(
      backgroundColor: c.background,
      foregroundColor: c.foreground,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: snapText(size: 16, weight: FontWeight.w600, color: c.foreground),
      shape: Border(bottom: BorderSide(color: c.border)),
    ),
    drawerTheme: DrawerThemeData(backgroundColor: c.surface, surfaceTintColor: Colors.transparent),
    cardTheme: CardThemeData(
      color: c.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: c.border),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.surface,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      hintStyle: snapText(size: 14, color: c.muted),
      border: fieldBorder,
      enabledBorder: fieldBorder,
      disabledBorder: fieldBorder.copyWith(borderSide: BorderSide(color: c.border)),
      focusedBorder: fieldBorder.copyWith(borderSide: BorderSide(color: c.primary, width: 2)),
      errorBorder: fieldBorder.copyWith(borderSide: BorderSide(color: c.danger)),
      focusedErrorBorder: fieldBorder.copyWith(borderSide: BorderSide(color: c.danger, width: 2)),
      errorStyle: snapText(size: 13, weight: FontWeight.w500, color: c.danger),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: c.surface,
      contentTextStyle: snapText(size: 14, color: c.foreground),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(color: c.border),
      ),
      elevation: 2,
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: c.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      titleTextStyle: snapText(size: 18, weight: FontWeight.w600, color: c.foreground),
      contentTextStyle: snapText(size: 14, color: c.body, height: 1.5),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: c.background,
      surfaceTintColor: Colors.transparent,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? c.primary : null),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: c.primary),
  );
}
