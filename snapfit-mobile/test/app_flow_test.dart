import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapfit_mobile/widgets/ui.dart';

import 'support/harness.dart';

void main() {
  testWidgets('opens on Log In when signed out, and links to Sign Up', (tester) async {
    final app = await TestApp.create();
    await app.pump(tester);

    expect(find.text('Log In'), findsWidgets);
    expect(find.byType(TextFormField).at(0), findsOneWidget);
    await tester.tap(find.text('Forgot password?'));
    await tester.pumpAndSettle();
    expect(find.textContaining("we'll help you reset your password"), findsOneWidget);

    await tester.tap(find.text("Don't have an account? Sign Up"));
    await tester.pumpAndSettle();
    expect(find.text('Sign Up'), findsOneWidget);
    expect(find.text('Store name'), findsOneWidget);
  });

  testWidgets('a signed-in merchant opens straight on the dashboard', (tester) async {
    final app = await TestApp.create(account: merchant);
    app.backend
      ..on('GET /analytics/dashboard', {
        'usage': {'requestsUsed': 0, 'requestsLimit': 5000},
        'recommendationsThisMonth': 0,
        'recommendationsLastMonth': 0,
        'averageConfidence': null,
        'totalRecommendations': 0,
      })
      ..on('GET /analytics/usage', {'data': []})
      ..on('GET /analytics/recent', {'recommendations': []})
      ..on('GET /charts', {
        'charts': [],
        'pagination': {'total': 0},
      })
      ..on('GET /products/mappings', {'mappings': []});
    await app.pump(tester);

    expect(find.text('Welcome back, Shop'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Create your first size chart'), 400);
    expect(find.text('Create your first size chart'), findsOneWidget);
  });

  testWidgets('a merchant signs in and lands on the dashboard', (tester) async {
    final app = await TestApp.create(location: '/signin');
    app.backend
      ..on('POST /auth/login', {'token': 'jwt', 'merchant': merchant})
      ..on('GET /analytics/dashboard', {
        'usage': {'requestsUsed': 120, 'requestsLimit': 5000},
        'recommendationsThisMonth': 30,
        'recommendationsLastMonth': 20,
        'averageConfidence': 0.82,
        'totalRecommendations': 120,
      })
      ..on('GET /analytics/usage', {
        'data': [
          {'date': '2026-10-31', 'count': 4},
        ],
      })
      ..on('GET /analytics/recent', {'recommendations': []})
      ..on('GET /charts', {
        'charts': [],
        'pagination': {'total': 1},
      })
      ..on('GET /products/mappings', {'mappings': []})
      ..on('GET /merchant/api-key', {'apiKey': 'sk_live_ab...cdef'});
    await app.pump(tester);

    await tester.enterText(find.byType(TextFormField).at(0), 'shop@test.com');
    await tester.enterText(find.byType(TextFormField).at(1), 'Secret123');
    await tester.tap(find.widgetWithText(SnapButton, 'Log In'));
    await tester.pumpAndSettle();

    expect(find.text('Welcome back, Shop'), findsOneWidget);
    expect(find.text('↑ 50%'), findsOneWidget);
    expect(find.text('82%'), findsOneWidget);
    final login = app.backend.requests.firstWhere((r) => r.path == '/auth/login');
    expect(login.data, {'email': 'shop@test.com', 'password': 'Secret123'});
  });

  testWidgets('a failed login shows the server message', (tester) async {
    final app = await TestApp.create(location: '/signin');
    app.backend.on('POST /auth/login', {'message': 'Invalid email or password'}, status: 401);
    await app.pump(tester);

    await tester.enterText(find.byType(TextFormField).at(0), 'shop@test.com');
    await tester.enterText(find.byType(TextFormField).at(1), 'wrong-pass');
    await tester.tap(find.widgetWithText(SnapButton, 'Log In'));
    await tester.pumpAndSettle();

    expect(find.text('Invalid email or password'), findsOneWidget);
    expect(find.widgetWithText(SnapButton, 'Log In'), findsOneWidget);
  });

  testWidgets('the super admin signs in to the admin console', (tester) async {
    final app = await TestApp.create(location: '/signin');
    app.backend
      ..on('POST /auth/login', {'token': 'jwt', 'merchant': superAdmin})
      ..on('GET /admin/overview', {
        'totals': {
          'merchants': 3,
          'activeMerchants': 2,
          'suspendedMerchants': 1,
          'recommendations': 40,
          'recommendationsLast30Days': 12,
          'successRate': 0.9,
        },
        'byPlan': {'small': 1, 'medium': 2},
        'daily': [],
        'recentMerchants': [merchant],
      });
    await app.pump(tester);

    await tester.enterText(find.byType(TextFormField).at(0), 'admin@test.com');
    await tester.enterText(find.byType(TextFormField).at(1), 'Secret123');
    await tester.tap(find.widgetWithText(SnapButton, 'Log In'));
    await tester.pumpAndSettle();

    expect(find.text('Platform overview'), findsOneWidget);
    expect(find.text('Super Admin'), findsOneWidget);
    expect(find.text('2 active · 1 suspended'), findsOneWidget);
    expect(find.text('90%'), findsOneWidget);
  });

  testWidgets('an unsubscribed merchant is sent to plan selection, with locked pages', (tester) async {
    final app = await TestApp.create(account: unsubscribedMerchant, location: '/dashboard/api-key');
    app.backend.on('GET /subscription/plans', publishedPlans);
    await app.pump(tester);

    expect(find.text('Choose a plan'), findsOneWidget);
    expect(find.text('An active subscription is required'), findsOneWidget);
    expect(find.text('Select Medium'), findsOneWidget);

    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pumpAndSettle();
    expect(find.text('Inactive'), findsOneWidget);
    await tester.tap(find.text('API Key'));
    await tester.pumpAndSettle();
    expect(find.text('Subscribe to unlock API Key.'), findsOneWidget);
  });

  testWidgets('the size chart editor checks names, categories and ranges', (tester) async {
    final app = await TestApp.create(account: merchant, location: '/dashboard/size-charts/new');
    await app.pump(tester);

    await tester.tap(find.text('Create chart'));
    await tester.pumpAndSettle();

    expect(find.text('Please fix the highlighted errors below.'), findsOneWidget);
    expect(find.text('Chart name is required'), findsOneWidget);
    expect(find.text('Category is required'), findsOneWidget);
    expect(find.text('Label is required'), findsNWidgets(2));
    expect(app.backend.called('POST /charts'), isFalse);
  });
}
