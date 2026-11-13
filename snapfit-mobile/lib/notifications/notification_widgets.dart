// Small pieces shared by the shells and the notification screens: the unread
// count badge, the menu button that carries it and the icon for each type.
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/notifications_state.dart';
import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';

/// "9+" above nine, so the badge stays small.
String unreadLabel(int count) => count > 9 ? '9+' : '$count';

/// Text that reads on the danger fill in both themes (white on the light
/// theme's deep red, near-black on the dark theme's light red).
Color onDanger(SnapColors c) => c.danger.computeLuminance() > 0.179 ? c.background : c.primaryForeground;

/// The unread count as a small red badge over [child] (hidden at zero).
class UnreadBadge extends StatelessWidget {
  const UnreadBadge({super.key, required this.count, required this.child});

  final int count;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Badge(
      isLabelVisible: count > 0,
      backgroundColor: c.danger,
      textColor: onDanger(c),
      label: Text(
        unreadLabel(count),
        style: snapText(size: 10, weight: FontWeight.w700, color: onDanger(c)),
      ),
      child: child,
    );
  }
}

/// The unread count as a pill at the end of a drawer item.
class UnreadPill extends StatelessWidget {
  const UnreadPill({super.key, required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    if (count <= 0) return const SizedBox.shrink();
    final c = context.colors;
    return Semantics(
      label: '$count unread',
      child: ExcludeSemantics(
        child: Container(
          constraints: const BoxConstraints(minWidth: 22),
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
          decoration: BoxDecoration(color: c.danger, borderRadius: BorderRadius.circular(99)),
          child: Text(
            unreadLabel(count),
            textAlign: TextAlign.center,
            style: snapText(size: 11, weight: FontWeight.w700, color: onDanger(c)),
          ),
        ),
      ),
    );
  }
}

/// The app bar's menu button with the unread badge (same tooltip and icon as
/// the default drawer button).
class MenuButtonWithBadge extends StatelessWidget {
  const MenuButtonWithBadge({super.key});

  @override
  Widget build(BuildContext context) {
    final count = context.watch<NotificationsState?>()?.unreadCount ?? 0;
    return IconButton(
      tooltip: MaterialLocalizations.of(context).openAppDrawerTooltip,
      icon: UnreadBadge(count: count, child: const DrawerButtonIcon()),
      onPressed: () => Scaffold.of(context).openDrawer(),
    );
  }
}

/// The bell in the app bar: opens the notifications, with the unread badge.
class NotificationsBell extends StatelessWidget {
  const NotificationsBell({super.key, required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final count = context.watch<NotificationsState?>()?.unreadCount ?? 0;
    return IconButton(
      tooltip: count > 0 ? 'Notifications ($count unread)' : 'Notifications',
      icon: UnreadBadge(
        count: count,
        child: Icon(LucideIcons.bell, size: 20, color: c.mutedForeground),
      ),
      onPressed: onPressed,
    );
  }
}

/// The icon for a notification type ("subscription.activated" -> card).
IconData notificationIcon(String? type) {
  final value = type ?? '';
  if (value == 'announcement') return LucideIcons.megaphone;
  if (value == 'account.welcome') return LucideIcons.partyPopper;
  if (value.startsWith('security.') ||
      value == 'account.password_changed' ||
      value == 'account.password_reset_by_admin') {
    return LucideIcons.shieldAlert;
  }
  if (value.startsWith('account.')) return LucideIcons.user;
  if (value.startsWith('subscription.')) return LucideIcons.creditCard;
  if (value.startsWith('usage.')) return LucideIcons.gauge;
  if (value.startsWith('product.')) return LucideIcons.shirt;
  if (value == 'admin.merchant_signed_up') return LucideIcons.userPlus;
  if (value.startsWith('admin.')) return LucideIcons.store;
  return LucideIcons.bell;
}
