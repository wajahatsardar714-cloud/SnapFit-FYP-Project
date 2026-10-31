import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';

/// The app-wide messenger, so state classes (not only widgets) can show a toast.
final messengerKey = GlobalKey<ScaffoldMessengerState>();

enum ToastKind { info, success, error }

/// A short message at the bottom of the screen, styled like the web app's
/// toasts (surface card, coloured icon).
void showToast(String message, {ToastKind kind = ToastKind.info}) {
  final messenger = messengerKey.currentState;
  if (messenger == null) return;
  final context = messenger.context;
  final c = context.colors;
  final (icon, color) = switch (kind) {
    ToastKind.success => (LucideIcons.circleCheck, c.success),
    ToastKind.error => (LucideIcons.circleAlert, c.danger),
    ToastKind.info => (LucideIcons.info, c.primary),
  };
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        duration: const Duration(seconds: 4),
        backgroundColor: c.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
          side: BorderSide(color: kind == ToastKind.info ? c.border : color.withValues(alpha: 0.3)),
        ),
        content: Row(
          children: [
            Icon(icon, size: 18, color: color),
            const SizedBox(width: 10),
            Expanded(
              child: Text(message, style: snapText(size: 14, color: c.foreground)),
            ),
          ],
        ),
      ),
    );
}
