import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/app_settings.dart';
import '../core/auth_state.dart';
import '../core/plans.dart';
import '../core/toast.dart';
import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import '../widgets/ui.dart';

class _NavItem {
  const _NavItem(this.label, this.path, this.icon, {this.exact = false});

  final String label;
  final String path;
  final IconData icon;
  final bool exact;

  bool matches(String location) => exact ? location == path : location == path || location.startsWith('$path/');
}

// The web sidebar's items, plus the size check (the web's demo page) so a
// merchant can try their own widget from the phone.
const _navItems = [
  _NavItem('Dashboard', '/dashboard', LucideIcons.layoutDashboard, exact: true),
  _NavItem('Subscription', '/dashboard/subscription', LucideIcons.creditCard),
  _NavItem('API Key', '/dashboard/api-key', LucideIcons.keyRound),
  _NavItem('Size Charts', '/dashboard/size-charts', LucideIcons.package),
  _NavItem('Analytics', '/dashboard/analytics', LucideIcons.chartColumn),
  _NavItem('Size Check', '/dashboard/size-check', LucideIcons.scanLine),
  _NavItem('Docs', '/dashboard/docs', LucideIcons.bookOpen),
];

/// The page title for a dashboard location (longest matching item wins, so
/// /dashboard/subscription/plans reads "Subscription").
String dashboardTitle(String location) {
  if (location.startsWith('/dashboard/settings')) return 'Settings';
  if (location.startsWith('/dashboard/product-mapping')) return 'Size Charts';
  final items = [..._navItems]..sort((a, b) => b.path.length - a.path.length);
  return items.firstWhere((i) => i.matches(location), orElse: () => _navItems.first).label;
}

String initialsOf(String? name) {
  final parts = (name ?? '').trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  final initials = parts.length > 1
      ? parts.first[0] + parts.last[0]
      : parts.first.substring(0, parts.first.length.clamp(0, 2));
  return initials.toUpperCase();
}

/// The merchant dashboard's frame (the web's DashboardLayout): app bar with
/// the page title, theme toggle, notifications and account menu; a drawer
/// with the navigation; and the subscription banner while unsubscribed.
class DashboardShell extends StatelessWidget {
  const DashboardShell({super.key, required this.location, required this.child});

  final String location;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final auth = context.watch<AuthState>();
    final settings = context.watch<AppSettings>();
    final merchant = auth.merchant;
    final showGateBanner = needsSubscription(merchant);

    return Scaffold(
      appBar: AppBar(
        title: Text(dashboardTitle(location)),
        actions: [
          IconButton(
            tooltip: settings.isDark ? 'Switch to light mode' : 'Switch to dark mode',
            icon: Icon(settings.isDark ? LucideIcons.sun : LucideIcons.moon, size: 20, color: c.mutedForeground),
            onPressed: settings.toggleTheme,
          ),
          IconButton(
            tooltip: 'Notifications',
            icon: Icon(LucideIcons.bell, size: 20, color: c.mutedForeground),
            onPressed: () => showToast("You're all caught up — no new notifications."),
          ),
          AccountMenu(
            name: '${merchant?['businessName'] ?? ''}',
            email: '${merchant?['email'] ?? ''}',
            settingsPath: '/dashboard/settings',
          ),
          const SizedBox(width: 4),
        ],
      ),
      drawer: _DashboardDrawer(location: location),
      body: Column(
        children: [
          if (showGateBanner)
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: SnapAlert(
                variant: AlertVariant.warning,
                title: 'An active subscription is required',
                description: 'Choose a plan to unlock size charts, products, your API key and analytics.',
              ),
            ),
          Expanded(child: child),
        ],
      ),
    );
  }
}

/// The avatar button and its menu: account name and email, Settings, Log out.
class AccountMenu extends StatelessWidget {
  const AccountMenu({
    super.key,
    required this.name,
    required this.email,
    required this.settingsPath,
    this.admin = false,
  });

  final String name;
  final String email;
  final String settingsPath;
  final bool admin;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return PopupMenuButton<String>(
      tooltip: 'Account menu',
      color: c.surface,
      surfaceTintColor: Colors.transparent,
      position: PopupMenuPosition.under,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(color: c.border),
      ),
      onSelected: (value) async {
        if (value == 'settings') context.go(settingsPath);
        if (value == 'logout') {
          await context.read<AuthState>().logout();
          if (context.mounted) context.go('/signin');
        }
      },
      itemBuilder: (context) => [
        PopupMenuItem<String>(
          enabled: false,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                overflow: TextOverflow.ellipsis,
                style: snapText(size: 14, weight: FontWeight.w500, color: c.foreground),
              ),
              Text(
                email,
                overflow: TextOverflow.ellipsis,
                style: snapText(size: 12, color: c.mutedForeground),
              ),
            ],
          ),
        ),
        const PopupMenuDivider(),
        PopupMenuItem<String>(
          value: 'settings',
          child: Row(
            children: [
              Icon(LucideIcons.settings, size: 16, color: c.foreground),
              const SizedBox(width: 8),
              Text('Settings', style: snapText(size: 14, color: c.foreground)),
            ],
          ),
        ),
        PopupMenuItem<String>(
          value: 'logout',
          child: Row(
            children: [
              Icon(LucideIcons.logOut, size: 16, color: c.danger),
              const SizedBox(width: 8),
              Text('Log out', style: snapText(size: 14, color: c.danger)),
            ],
          ),
        ),
      ],
      child: Padding(
        padding: const EdgeInsets.all(6),
        child: CircleAvatar(
          radius: 16,
          backgroundColor: admin ? c.admin : c.primarySoft,
          child: admin
              ? Icon(LucideIcons.shieldCheck, size: 16, color: c.adminForeground)
              : Text(
                  initialsOf(name),
                  style: snapText(size: 12, weight: FontWeight.w600, color: c.primary),
                ),
        ),
      ),
    );
  }
}

class _DashboardDrawer extends StatelessWidget {
  const _DashboardDrawer({required this.location});

  final String location;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final merchant = context.watch<AuthState>().merchant;
    final subscribed = isSubscribed(merchant);
    final plan = merchant?['subscription']?['plan'] as String?;

    Widget item(_NavItem nav) {
      final locked = isPathLockedFor(merchant, nav.path);
      final active = nav.matches(location) && dashboardTitle(location) == nav.label;
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
        child: Semantics(
          link: true,
          enabled: !locked,
          hint: locked ? 'Subscribe to unlock' : null,
          child: Material(
            color: active ? c.primarySoft : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
            child: InkWell(
              borderRadius: BorderRadius.circular(8),
              onTap: locked
                  ? () => showToast('Subscribe to unlock ${nav.label}.')
                  : () {
                      Navigator.pop(context);
                      context.go(nav.path);
                    },
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
                child: Row(
                  children: [
                    Icon(nav.icon, size: 18, color: locked ? c.muted : (active ? c.primary : c.mutedForeground)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        nav.label,
                        style: snapText(
                          size: 14,
                          weight: active ? FontWeight.w500 : FontWeight.w400,
                          color: locked ? c.muted : (active ? c.primary : c.foreground),
                        ),
                      ),
                    ),
                    if (locked) Icon(LucideIcons.lock, size: 14, color: c.muted),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    }

    final settingsActive = location.startsWith('/dashboard/settings');
    return Drawer(
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
              child: Text(
                'SnapFit',
                style: snapText(size: 18, weight: FontWeight.w700, color: c.primary),
              ),
            ),
            Expanded(child: ListView(children: [for (final nav in _navItems) item(nav)])),
            Divider(color: c.border),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 4),
              child: Row(
                children: [
                  Text(
                    'Plan',
                    style: snapText(size: 12, weight: FontWeight.w500, color: c.mutedForeground),
                  ),
                  const Spacer(),
                  SnapBadge(
                    subscribed ? formatPlanName(plan) : 'Inactive',
                    variant: subscribed ? badgeVariantFrom(planBadgeVariant[plan]) : BadgeVariant.neutral,
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
              child: Material(
                color: settingsActive ? c.primarySoft : Colors.transparent,
                borderRadius: BorderRadius.circular(8),
                child: InkWell(
                  borderRadius: BorderRadius.circular(8),
                  onTap: () {
                    Navigator.pop(context);
                    context.go('/dashboard/settings');
                  },
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
                    child: Row(
                      children: [
                        Icon(LucideIcons.settings, size: 18, color: settingsActive ? c.primary : c.mutedForeground),
                        const SizedBox(width: 12),
                        Text('Settings', style: snapText(size: 14, color: settingsActive ? c.primary : c.foreground)),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
