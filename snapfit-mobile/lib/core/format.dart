import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../theme/snap_colors.dart';

DateTime? _parse(Object? value) => value == null ? null : DateTime.tryParse('$value')?.toLocal();

/// "Mar 4, 3:05 PM"
String formatDateTime(Object? value) {
  final date = _parse(value);
  return date == null ? '—' : DateFormat('MMM d, h:mm a').format(date);
}

/// "March 4, 2026"
String formatLongDate(Object? value) {
  final date = _parse(value);
  return date == null ? '—' : DateFormat('MMMM d, y').format(date);
}

/// "Mar 4, 2026"
String formatShortDate(Object? value) {
  final date = _parse(value);
  return date == null ? '—' : DateFormat('MMM d, y').format(date);
}

String capitalize(String? value) => value == null || value.isEmpty ? '' : value[0].toUpperCase() + value.substring(1);

/// A number as JavaScript prints it: 50 not "50.0", 12.5 stays "12.5".
String formatDecimal(num value) => value == value.roundToDouble() ? '${value.round()}' : '$value';

/// "82%" for 0.82, "—" when missing.
String formatPercent(num? fraction) => fraction == null ? '—' : '${(fraction * 100).round()}%';

/// Text colour for a recommendation's confidence: green above 75%, amber from
/// 50%, red below.
Color confidenceColor(BuildContext context, num? confidence) {
  final c = context.colors;
  if (confidence == null) return c.mutedForeground;
  final pct = confidence * 100;
  if (pct > 75) return c.success;
  if (pct >= 50) return c.warning;
  return c.danger;
}

/// Badge variant for a subscription status (expired stays distinct from never
/// subscribed).
String subscriptionStatusVariant(String? status) =>
    const {'active': 'success', 'expired': 'danger', 'inactive': 'neutral'}[status] ?? 'neutral';
