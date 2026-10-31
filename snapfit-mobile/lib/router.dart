import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'admin/admin_screens.dart';
import 'admin/admin_shell.dart';
import 'admin/demo_studio_screen.dart';
import 'admin/merchant_detail_screen.dart';
import 'auth/auth_screens.dart';
import 'core/auth_state.dart';
import 'core/plans.dart';
import 'dashboard/analytics_screen.dart';
import 'dashboard/api_key_screen.dart';
import 'dashboard/dashboard_home_screen.dart';
import 'dashboard/dashboard_shell.dart';
import 'dashboard/docs_screen.dart';
import 'dashboard/product_mapping_screens.dart';
import 'dashboard/settings_screen.dart';
import 'dashboard/size_chart_screens.dart';
import 'dashboard/size_check_screen.dart';
import 'dashboard/subscription_screens.dart';

/// The app's routes: sign-in and sign-up, the merchant dashboard and the
/// admin console, on the same paths as the web app (src/App.jsx). The public
/// marketing pages stay on the website only. Same guards as the web:
/// the dashboard is for merchants, /admin for the super
/// admin, and a merchant without a subscription only reaches the
/// subscription pages and settings.
GoRouter buildRouter(AuthState auth, {String? initialLocation}) {
  return GoRouter(
    initialLocation: initialLocation ?? startPath(auth),
    refreshListenable: auth,
    redirect: (context, state) => guard(auth, state.uri),
    errorBuilder: (context, state) => const _NotFoundScreen(),
    routes: [
      GoRoute(path: '/signin', builder: (context, state) => const SignInScreen()),
      GoRoute(
        path: '/signup',
        builder: (context, state) => SignUpScreen(plan: state.uri.queryParameters['plan']),
      ),
      ShellRoute(
        builder: (context, state, child) => DashboardShell(location: state.uri.path, child: child),
        routes: [
          GoRoute(path: '/dashboard', builder: (context, state) => const DashboardHomeScreen()),
          GoRoute(path: '/dashboard/subscription', builder: (context, state) => const SubscriptionStatusScreen()),
          GoRoute(
            path: '/dashboard/subscription/plans',
            builder: (context, state) => PlanSelectionScreen(requestedPlan: state.uri.queryParameters['plan']),
          ),
          GoRoute(path: '/dashboard/api-key', builder: (context, state) => const ApiKeyScreen()),
          GoRoute(path: '/dashboard/size-charts', builder: (context, state) => const SizeChartsScreen()),
          GoRoute(path: '/dashboard/size-charts/new', builder: (context, state) => const SizeChartEditorScreen()),
          GoRoute(
            path: '/dashboard/size-charts/:id/edit',
            builder: (context, state) => SizeChartEditorScreen(chartId: state.pathParameters['id']),
          ),
          GoRoute(path: '/dashboard/product-mapping', builder: (context, state) => const ProductMappingScreen()),
          GoRoute(
            path: '/dashboard/product-mapping/:id/anchor-points',
            builder: (context, state) => AnchorPointsScreen(mappingId: state.pathParameters['id']!),
          ),
          GoRoute(path: '/dashboard/analytics', builder: (context, state) => const AnalyticsScreen()),
          GoRoute(path: '/dashboard/size-check', builder: (context, state) => const SizeCheckScreen()),
          GoRoute(path: '/dashboard/docs', builder: (context, state) => const DocsScreen()),
          GoRoute(path: '/dashboard/settings', builder: (context, state) => const SettingsScreen()),
        ],
      ),
      ShellRoute(
        builder: (context, state, child) => AdminShell(location: state.uri.path, child: child),
        routes: [
          GoRoute(path: '/admin', builder: (context, state) => const AdminOverviewScreen()),
          GoRoute(path: '/admin/merchants', builder: (context, state) => const AdminMerchantsScreen()),
          GoRoute(
            path: '/admin/merchants/:id',
            builder: (context, state) => AdminMerchantDetailScreen(
              key: ValueKey(state.pathParameters['id']),
              merchantId: state.pathParameters['id']!,
            ),
          ),
          GoRoute(path: '/admin/analytics', builder: (context, state) => const AdminAnalyticsScreen()),
          GoRoute(
            path: '/admin/demo',
            builder: (context, state) => DemoStudioScreen(merchantId: state.uri.queryParameters['merchantId']),
          ),
          GoRoute(path: '/admin/audit-log', builder: (context, state) => const AdminAuditLogScreen()),
          GoRoute(path: '/admin/settings', builder: (context, state) => const AdminSettingsScreen()),
        ],
      ),
    ],
  );
}

/// Where the app opens: sign-in when signed out, else the account's home.
String startPath(AuthState auth) => auth.isAuthenticated ? homePathFor(auth.merchant) : '/signin';

/// Where a request for [uri] should go instead, or null to allow it.
String? guard(AuthState auth, Uri uri) {
  final path = uri.path;
  if (path == '/' || path.isEmpty) return startPath(auth);
  final account = auth.merchant;
  final inDashboard = path == '/dashboard' || path.startsWith('/dashboard/');
  final inAdmin = path == '/admin' || path.startsWith('/admin/');

  if (inDashboard || inAdmin) {
    if (account == null) return '/signin';
    final role = roleOf(account);
    if (inDashboard && role != roleMerchant) return homePathFor(account);
    if (inAdmin && role != roleSuperAdmin) return homePathFor(account);
    if (inDashboard && isPathLockedFor(account, path)) return planSelectionPath;
    return null;
  }
  // A signed-in account skips the bare login and sign-up forms.
  if (account != null && (path == '/signin' || path == '/signup')) return homePathFor(account);
  return null;
}

class _NotFoundScreen extends StatelessWidget {
  const _NotFoundScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Page not found'),
            const SizedBox(height: 12),
            TextButton(onPressed: () => context.go('/'), child: const Text('Back to the app')),
          ],
        ),
      ),
    );
  }
}
