import 'package:flutter/material.dart';

/// SnapFit's colour tokens, copied from the web app's src/styles/theme.css so
/// both apps share one palette. Read them with `context.colors`.
@immutable
class SnapColors extends ThemeExtension<SnapColors> {
  const SnapColors({
    required this.primary,
    required this.primaryHover,
    required this.primarySoft,
    required this.primaryForeground,
    required this.link,
    required this.background,
    required this.surface,
    required this.surface2,
    required this.foreground,
    required this.body,
    required this.mutedForeground,
    required this.muted,
    required this.border,
    required this.navy,
    required this.navyRaised,
    required this.deepBlue,
    required this.inverse,
    required this.inverseMuted,
    required this.inverseAccent,
    required this.success,
    required this.successSoft,
    required this.warning,
    required this.warningSoft,
    required this.danger,
    required this.dangerSoft,
    required this.overlay,
    required this.admin,
    required this.adminSoft,
    required this.adminForeground,
  });

  final Color primary;
  final Color primaryHover;
  final Color primarySoft;
  final Color primaryForeground;
  final Color link;
  final Color background;
  final Color surface;
  final Color surface2;
  final Color foreground;
  final Color body;
  final Color mutedForeground;
  final Color muted;
  final Color border;
  final Color navy;
  final Color navyRaised;
  final Color deepBlue;
  final Color inverse;
  final Color inverseMuted;
  final Color inverseAccent;
  final Color success;
  final Color successSoft;
  final Color warning;
  final Color warningSoft;
  final Color danger;
  final Color dangerSoft;
  final Color overlay;
  final Color admin;
  final Color adminSoft;
  final Color adminForeground;

  static const light = SnapColors(
    primary: Color(0xFF377DFF),
    primaryHover: Color(0xFF1A56C7),
    primarySoft: Color(0xFFEAF2FF),
    primaryForeground: Color(0xFFFFFFFF),
    link: Color(0xFF1F64E0),
    background: Color(0xFFF8FAFC),
    surface: Color(0xFFFFFFFF),
    surface2: Color(0xFFF1F5F9),
    foreground: Color(0xFF172033),
    body: Color(0xFF475569),
    mutedForeground: Color(0xFF64748B),
    muted: Color(0xFF94A3B8),
    border: Color(0xFFE2E8F0),
    navy: Color(0xFF101D2C),
    navyRaised: Color(0xFF1D2E44),
    deepBlue: Color(0xFF1D3557),
    inverse: Color(0xFFFFFFFF),
    inverseMuted: Color(0xFFB6C2D1),
    inverseAccent: Color(0xFF9DC2FF),
    success: Color(0xFF0F766E),
    successSoft: Color(0xFFF0FDFA),
    warning: Color(0xFFB45309),
    warningSoft: Color(0xFFFFFBEB),
    danger: Color(0xFFB91C1C),
    dangerSoft: Color(0xFFFEF2F2),
    overlay: Color(0xFF101D2C),
    admin: Color(0xFF6D28D9),
    adminSoft: Color(0xFFF5F3FF),
    adminForeground: Color(0xFFFFFFFF),
  );

  static const dark = SnapColors(
    primary: Color(0xFF377DFF),
    primaryHover: Color(0xFF5A93FF),
    primarySoft: Color(0x29377DFF),
    primaryForeground: Color(0xFFFFFFFF),
    link: Color(0xFF7AA7FF),
    background: Color(0xFF121212),
    surface: Color(0xFF1C1C1C),
    surface2: Color(0xFF242424),
    foreground: Color(0xFFFFFFFF),
    body: Color(0xFFD6D6D6),
    mutedForeground: Color(0xFFADADAD),
    muted: Color(0xFF777777),
    border: Color(0xFF333333),
    navy: Color(0xFF0B1520),
    navyRaised: Color(0xFF16263A),
    deepBlue: Color(0xFF1D3557),
    inverse: Color(0xFFFFFFFF),
    inverseMuted: Color(0xFFB6C2D1),
    inverseAccent: Color(0xFF9DC2FF),
    success: Color(0xFF2DD4BF),
    successSoft: Color(0x242DD4BF),
    warning: Color(0xFFFBBF24),
    warningSoft: Color(0x24FBBF24),
    danger: Color(0xFFF87171),
    dangerSoft: Color(0x24F87171),
    overlay: Color(0xFF000000),
    admin: Color(0xFFA78BFA),
    adminSoft: Color(0x24A78BFA),
    adminForeground: Color(0xFF121212),
  );

  @override
  SnapColors copyWith() => this;

  @override
  SnapColors lerp(ThemeExtension<SnapColors>? other, double t) {
    if (other is! SnapColors) return this;
    Color mix(Color a, Color b) => Color.lerp(a, b, t)!;
    return SnapColors(
      primary: mix(primary, other.primary),
      primaryHover: mix(primaryHover, other.primaryHover),
      primarySoft: mix(primarySoft, other.primarySoft),
      primaryForeground: mix(primaryForeground, other.primaryForeground),
      link: mix(link, other.link),
      background: mix(background, other.background),
      surface: mix(surface, other.surface),
      surface2: mix(surface2, other.surface2),
      foreground: mix(foreground, other.foreground),
      body: mix(body, other.body),
      mutedForeground: mix(mutedForeground, other.mutedForeground),
      muted: mix(muted, other.muted),
      border: mix(border, other.border),
      navy: mix(navy, other.navy),
      navyRaised: mix(navyRaised, other.navyRaised),
      deepBlue: mix(deepBlue, other.deepBlue),
      inverse: mix(inverse, other.inverse),
      inverseMuted: mix(inverseMuted, other.inverseMuted),
      inverseAccent: mix(inverseAccent, other.inverseAccent),
      success: mix(success, other.success),
      successSoft: mix(successSoft, other.successSoft),
      warning: mix(warning, other.warning),
      warningSoft: mix(warningSoft, other.warningSoft),
      danger: mix(danger, other.danger),
      dangerSoft: mix(dangerSoft, other.dangerSoft),
      overlay: mix(overlay, other.overlay),
      admin: mix(admin, other.admin),
      adminSoft: mix(adminSoft, other.adminSoft),
      adminForeground: mix(adminForeground, other.adminForeground),
    );
  }
}

extension SnapColorsContext on BuildContext {
  SnapColors get colors => Theme.of(this).extension<SnapColors>()!;
}
