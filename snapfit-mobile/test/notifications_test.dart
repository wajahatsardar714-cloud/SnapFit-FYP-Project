import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapfit_mobile/widgets/ui.dart';

import 'support/harness.dart';

Map<String, dynamic> note(String id, {bool read = false, String? link, String type = 'usage.80', String? title}) => {
  '_id': id,
  'type': type,
  'title': title ?? 'Notification $id',
  'body': 'Body of $id',
  'link': link,
  'important': false,
  'read': read,
  'readAt': null,
  'createdAt': DateTime.now().toUtc().subtract(const Duration(hours: 2)).toIso8601String(),
};

const receipt = {
  '_id': 'r1',
  'number': 'SF-2026-000012',
  'status': 'issued',
  'reason': 'plan_selected',
  'issuedAt': '2026-11-13T10:00:00.000Z',
  'merchant': {'businessName': 'Shop', 'name': 'Sam Shop', 'email': 'shop@test.com', 'phone': '123'},
  'plan': 'medium',
  'planName': 'Medium',
  'periodStart': '2026-11-13T10:00:00.000Z',
  'periodEnd': '2026-12-13T10:00:00.000Z',
  'currency': 'USD',
  'amount': 99,
  'taxRate': 0,
  'taxAmount': 0,
  'total': 99,
  'priceNote': null,
  'paymentMethod': 'Demo (no charge)',
  'voidedAt': null,
};

/// A merchant on the notifications screen with [items] (page 1 of [total]).
Future<TestApp> notificationsApp(
  List<Map<String, dynamic>> items, {
  int? total,
  String location = '/dashboard/notifications',
}) async {
  final app = await TestApp.create(account: merchant, location: location);
  final unread = items.where((n) => n['read'] != true).length;
  app.backend
    ..on('GET /notifications/unread-count', {'unreadCount': unread})
    ..onRequest('GET /notifications', (r) {
      final unreadOnly = r.queryParameters['unread'] == 'true';
      final list = unreadOnly ? items.where((n) => n['read'] != true).toList() : items;
      return FakeResponse({
        'notifications': list,
        'unreadCount': unread,
        'page': int.parse('${r.queryParameters['page'] ?? 1}'),
        'limit': 20,
        'total': total ?? list.length,
      });
    });
  return app;
}

void main() {
  testWidgets('lists notifications with unread dots, and filters to unread', (tester) async {
    final app = await notificationsApp([note('n1'), note('n2', read: true), note('n3')]);
    await app.pump(tester);

    expect(find.text('Notification n1'), findsOneWidget);
    expect(find.text('Notification n2'), findsOneWidget);
    expect(find.byKey(const ValueKey('unread-dot')), findsNWidgets(2));
    expect(find.text('2 unread'), findsOneWidget);
    expect(find.text('2 h ago'), findsNWidgets(3));

    await tester.tap(find.text('Unread'));
    await tester.pumpAndSettle();
    final last = app.backend.sent('GET /notifications').last;
    expect(last.queryParameters['unread'], 'true');
    expect(find.text('Notification n2'), findsNothing);
    expect(find.text('Notification n1'), findsOneWidget);
  });

  testWidgets('tapping a notification marks it read and opens its link', (tester) async {
    final app = await notificationsApp([
      note('n1', link: '/dashboard/receipts/r1', title: 'Your Medium plan is active'),
    ]);
    app.backend
      ..on('PATCH /notifications/n1/read', {
        'notification': {...note('n1', link: '/dashboard/receipts/r1'), 'read': true},
      })
      ..on('GET /receipts/r1', {'receipt': receipt});
    await app.pump(tester);
    expect(notificationsOf(tester).unreadCount, 1);

    await tester.tap(find.text('Your Medium plan is active'));
    await tester.pumpAndSettle();

    expect(app.backend.called('PATCH /notifications/n1/read'), isTrue);
    expect(currentPath(tester), '/dashboard/receipts/r1');
    expect(find.text('SF-2026-000012'), findsOneWidget);
    expect(notificationsOf(tester).unreadCount, 0);
  });

  testWidgets('a link the app does not know stays on the notifications screen', (tester) async {
    final app = await notificationsApp([note('n1', link: '/dashboard/not-a-page', title: 'Odd link')]);
    app.backend.on('PATCH /notifications/n1/read', {'notification': note('n1', read: true)});
    await app.pump(tester);

    await tester.tap(find.text('Odd link'));
    await tester.pumpAndSettle();

    expect(currentPath(tester), '/dashboard/notifications');
    expect(find.text('Page not found'), findsNothing);
    expect(find.byKey(const ValueKey('unread-dot')), findsNothing);
  });

  testWidgets('deletes from the menu and by swiping', (tester) async {
    final app = await notificationsApp([note('n1'), note('n2', read: true)]);
    app.backend
      ..on('DELETE /notifications/n1', {'success': true})
      ..on('DELETE /notifications/n2', {'success': true});
    await app.pump(tester);

    await tester.tap(find.byTooltip('More actions').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete').last);
    await tester.pumpAndSettle();
    expect(app.backend.called('DELETE /notifications/n1'), isTrue);
    expect(find.text('Notification n1'), findsNothing);
    expect(notificationsOf(tester).unreadCount, 0);

    await tester.drag(find.text('Notification n2'), const Offset(-600, 0));
    await settle(tester);
    expect(app.backend.called('DELETE /notifications/n2'), isTrue);
    expect(find.text('No notifications yet'), findsOneWidget);
  });

  testWidgets('mark all read clears the dots and the badge', (tester) async {
    final app = await notificationsApp([note('n1'), note('n2')]);
    app.backend.on('POST /notifications/read-all', {'updated': 2});
    await app.pump(tester);
    expect(notificationsOf(tester).unreadCount, 2);

    await tester.tap(find.widgetWithText(SnapButton, 'Mark all read'));
    await tester.pumpAndSettle();

    expect(app.backend.called('POST /notifications/read-all'), isTrue);
    expect(find.byKey(const ValueKey('unread-dot')), findsNothing);
    expect(notificationsOf(tester).unreadCount, 0);
    expect(find.text('All notifications marked as read'), findsOneWidget);
  });

  testWidgets('loads the next page with Load more', (tester) async {
    final app = await notificationsApp([note('n1', read: true)], total: 2);
    await app.pump(tester);
    app.backend.onRequest(
      'GET /notifications',
      (r) => FakeResponse({
        'notifications': [note('n2', read: true)],
        'unreadCount': 0,
        'page': 2,
        'limit': 20,
        'total': 2,
      }),
    );

    await tester.tap(find.widgetWithText(SnapButton, 'Load more'));
    await tester.pumpAndSettle();

    expect(app.backend.sent('GET /notifications').last.queryParameters['page'], 2);
    expect(find.text('Notification n1'), findsOneWidget);
    expect(find.text('Notification n2'), findsOneWidget);
    expect(find.widgetWithText(SnapButton, 'Load more'), findsNothing);
  });

  group('unread badge', () {
    testWidgets('counts on the menu button and drawer, polls every 30 s, refreshes on resume', (tester) async {
      final app = await TestApp.create(account: merchant, location: '/dashboard/receipts');
      var count = 3;
      app.backend
        ..onRequest('GET /notifications/unread-count', (_) => FakeResponse({'unreadCount': count}))
        ..on('GET /receipts', {'receipts': []});
      await app.pump(tester);

      final polls = app.backend.sent('GET /notifications/unread-count').length;
      expect(polls, 1);
      expect(notificationsOf(tester).unreadCount, 3);
      final menu = find.byTooltip('Open navigation menu');
      expect(find.descendant(of: menu, matching: find.text('3')), findsOneWidget);
      expect(find.byTooltip('Notifications (3 unread)'), findsOneWidget);

      // Nothing new before the 30 s tick.
      count = 5;
      await tester.pump(const Duration(seconds: 29));
      expect(app.backend.sent('GET /notifications/unread-count').length, 1);
      await tester.pump(const Duration(seconds: 1));
      await tester.pump();
      expect(app.backend.sent('GET /notifications/unread-count').length, 2);
      expect(find.descendant(of: menu, matching: find.text('5')), findsOneWidget);

      // Coming back to the app checks again at once.
      count = 12;
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump(const Duration(milliseconds: 10));
      await tester.pump();
      expect(app.backend.sent('GET /notifications/unread-count').length, 3);
      expect(find.descendant(of: menu, matching: find.text('9+')), findsOneWidget);

      await tester.tap(menu);
      await tester.pumpAndSettle();
      final drawer = find.byType(Drawer);
      expect(find.descendant(of: drawer, matching: find.text('Notifications')), findsOneWidget);
      expect(find.descendant(of: drawer, matching: find.text('Receipts')), findsOneWidget);
      expect(find.descendant(of: drawer, matching: find.text('9+')), findsOneWidget);
    });

    testWidgets('is cleared on sign-out and stops polling', (tester) async {
      final app = await TestApp.create(account: merchant, location: '/dashboard/receipts');
      app.backend
        ..on('GET /notifications/unread-count', {'unreadCount': 4})
        ..on('GET /receipts', {'receipts': []});
      await app.pump(tester);
      expect(notificationsOf(tester).unreadCount, 4);

      await app.auth.logout();
      await tester.pumpAndSettle();
      expect(find.text('Log In'), findsWidgets);
      expect(notificationsOf(tester).unreadCount, 0);

      final polls = app.backend.sent('GET /notifications/unread-count').length;
      await tester.pump(const Duration(seconds: 90));
      expect(app.backend.sent('GET /notifications/unread-count').length, polls);
    });

    testWidgets('the admin console has the badge and its Notifications screen', (tester) async {
      final app = await TestApp.create(account: superAdmin, location: '/admin/notifications');
      app.backend
        ..on('GET /notifications/unread-count', {'unreadCount': 1})
        ..on('GET /notifications', {
          'notifications': [
            note('a1', type: 'admin.merchant_signed_up', title: 'New merchant: Shop', link: '/admin/merchants/m1'),
          ],
          'unreadCount': 1,
          'page': 1,
          'limit': 20,
          'total': 1,
        });
      await app.pump(tester);

      expect(find.text('New merchant: Shop'), findsOneWidget);
      expect(find.descendant(of: find.byTooltip('Open navigation menu'), matching: find.text('1')), findsOneWidget);
      await tester.tap(find.byTooltip('Open navigation menu'));
      await tester.pumpAndSettle();
      final drawer = find.byType(Drawer);
      expect(find.descendant(of: drawer, matching: find.text('Announcements')), findsOneWidget);
      expect(find.descendant(of: drawer, matching: find.text('1')), findsOneWidget);
    });
  });

  group('preferences', () {
    const prefs = {
      'preferences': {
        'account.welcome': true,
        'account.password_changed': true,
        'usage.80': true,
        'usage.reset': false,
        'product.tryon_ready': true,
      },
      'types': [
        {'type': 'account.welcome', 'label': 'Welcome message', 'group': 'Account', 'important': false},
        {'type': 'account.password_changed', 'label': 'Password changed', 'group': 'Account', 'important': true},
        {'type': 'usage.80', 'label': 'Usage reached 80%', 'group': 'Usage', 'important': false},
        {'type': 'usage.reset', 'label': 'Monthly usage reset', 'group': 'Usage', 'important': false},
        {'type': 'product.tryon_ready', 'label': 'Try-on ready', 'group': 'Products', 'important': false},
      ],
    };

    testWidgets('toggles by group, keeps important ones locked, and saves the choices', (tester) async {
      final app = await TestApp.create(account: merchant, location: '/dashboard/settings');
      app.backend
        ..on('GET /notifications/preferences', prefs)
        ..onRequest('PUT /notifications/preferences', (r) {
          final sent = Map<String, dynamic>.from((r.data as Map)['preferences'] as Map);
          return FakeResponse({
            'preferences': {...(prefs['preferences']! as Map), ...sent},
            'types': prefs['types'],
          });
        });
      await app.pump(tester);

      await tester.ensureVisible(find.text('Notifications'));
      await tester.tap(find.text('Notifications'));
      await tester.pumpAndSettle();

      expect(find.text('ACCOUNT'), findsOneWidget);
      expect(find.text('USAGE'), findsOneWidget);
      expect(find.text('PRODUCTS'), findsOneWidget);
      expect(find.text('Always on'), findsOneWidget);
      // Four switches: the important "Password changed" has none.
      expect(find.byType(Switch), findsNWidgets(4));
      final reset = find.descendant(of: find.bySemanticsLabel('Monthly usage reset'), matching: find.byType(Switch));
      expect(tester.widget<Switch>(reset).value, isFalse);

      await tester.tap(reset);
      await tester.pumpAndSettle();

      final put = app.backend.sent('PUT /notifications/preferences').single;
      expect(put.data, {
        'preferences': {'account.welcome': true, 'usage.80': true, 'usage.reset': true, 'product.tryon_ready': true},
      });
      expect(tester.widget<Switch>(reset).value, isTrue);
      expect(find.text('Notification settings saved'), findsOneWidget);
    });

    testWidgets('a failed save puts the switch back', (tester) async {
      final app = await TestApp.create(account: merchant, location: '/dashboard/settings');
      app.backend
        ..on('GET /notifications/preferences', prefs)
        ..on('PUT /notifications/preferences', {
          'message': 'Important notifications cannot be turned off',
        }, status: 400);
      await app.pump(tester);
      await tester.ensureVisible(find.text('Notifications'));
      await tester.tap(find.text('Notifications'));
      await tester.pumpAndSettle();

      final welcome = find.descendant(of: find.bySemanticsLabel('Welcome message'), matching: find.byType(Switch));
      await tester.tap(welcome);
      await tester.pumpAndSettle();

      expect(tester.widget<Switch>(welcome).value, isTrue);
      expect(find.text('Important notifications cannot be turned off'), findsOneWidget);
    });
  });
}
