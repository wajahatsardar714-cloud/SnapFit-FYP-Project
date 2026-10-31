import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/app_settings.dart';
import '../core/auth_state.dart';
import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import 'admin_common.dart';

const _navItems = [
  ('Overview', '/admin', LucideIcons.layoutDashboard, true),
  ('Merchants', '/admin/merchants', LucideIcons.store, false),
  ('Analytics', '/admin/analytics', LucideIcons.chartColumn, false),
  ('Demo Studio', '/admin/demo', LucideIcons.flaskConical, false),
  ('Audit Log', '/admin/audit-log', LucideIcons.scrollText, false),
  ('Settings', '/admin/settings', LucideIcons.settings, false),
];

bool _matches((String, String, IconData, bool) item, String location) =>
    item.$4 ? location == item.$2 : location == item.$2 || location.startsWith('${item.$2}/');

/// Longest prefix first, so /admin/merchants/:id reads "Merchants".
String adminTitle(String location) {
  final items = [..._navItems]..sort((a, b) => b.$2.length - a.$2.length);
  return items.firstWhere((i) => _matches(i, location), orElse: () => _navItems.first).$1;
}

/// The admin console's frame (the web's AdminLayout): a purple accent line,
/// the page title with the Super Admin badge, the theme toggle and a drawer
/// with the admin navigation, the account email and Log out.
class AdminShell extends StatelessWidget {
  const AdminShell({super.key, required this.location, required this.child});

  final String location;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final settings = context.watch<AppSettings>();
    return Scaffold(
      appBar: AppBar(
        shape: Border(
          top: BorderSide(color: c.admin, width: 2),
          bottom: BorderSide(color: c.border),
        ),
        title: Row(
          children: [
            Flexible(child: Text(adminTitle(location), overflow: TextOverflow.ellipsis)),
            const SizedBox(width: 10),
            const SuperAdminBadge(),
          ],
        ),
        actions: [
          IconButton(
            tooltip: settings.isDark ? 'Switch to light mode' : 'Switch to dark mode',
            icon: Icon(settings.isDark ? LucideIcons.sun : LucideIcons.moon, size: 20, color: c.mutedForeground),
            onPressed: settings.toggleTheme,
          ),
          const SizedBox(width: 4),
        ],
      ),
      drawer: _AdminDrawer(location: location),
      body: child,
    );
  }
}

class _AdminDrawer extends StatelessWidget {
  const _AdminDrawer({required this.location});

  final String location;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final email = '${context.watch<AuthState>().merchant?['email'] ?? ''}';
    return Drawer(
      backgroundColor: c.adminSoft,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(color: c.admin, borderRadius: BorderRadius.circular(8)),
                    child: Icon(LucideIcons.shieldCheck, size: 20, color: c.adminForeground),
                  ),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'SnapFit',
                        style: snapText(size: 16, weight: FontWeight.w700, color: c.foreground),
                      ),
                      Text(
                        'ADMIN CONSOLE',
                        style: snapText(size: 11, weight: FontWeight.w500, color: c.admin, letterSpacing: 0.8),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                children: [
                  for (final item in _navItems)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
                      child: Builder(
                        builder: (context) {
                          final active = _matches(item, location) && adminTitle(location) == item.$1;
                          return Material(
                            color: active ? c.admin : Colors.transparent,
                            borderRadius: BorderRadius.circular(8),
                            child: InkWell(
                              borderRadius: BorderRadius.circular(8),
                              onTap: () {
                                Navigator.pop(context);
                                context.go(item.$2);
                              },
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
                                child: Row(
                                  children: [
                                    Icon(item.$3, size: 18, color: active ? c.adminForeground : c.foreground),
                                    const SizedBox(width: 12),
                                    Text(
                                      item.$1,
                                      style: snapText(
                                        size: 14,
                                        weight: active ? FontWeight.w500 : FontWeight.w400,
                                        color: active ? c.adminForeground : c.foreground,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                ],
              ),
            ),
            Divider(color: c.admin.withValues(alpha: 0.2)),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 4, 24, 4),
              child: Text(
                email,
                overflow: TextOverflow.ellipsis,
                style: snapText(size: 12, color: c.mutedForeground),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
              child: InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: () async {
                  await context.read<AuthState>().logout();
                  if (context.mounted) context.go('/signin');
                },
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
                  child: Row(
                    children: [
                      Icon(LucideIcons.logOut, size: 18, color: c.danger),
                      const SizedBox(width: 12),
                      Text('Log out', style: snapText(size: 14, color: c.danger)),
                    ],
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
