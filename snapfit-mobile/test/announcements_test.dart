import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapfit_mobile/widgets/ui.dart';

import 'support/harness.dart';

Map<String, dynamic> announcement(String id, String status, {String title = 'Maintenance'}) => {
  '_id': id,
  'title': title,
  'body': 'The service is down for an hour.',
  'link': null,
  'audience': {'type': 'all'},
  'status': status,
  'scheduledAt': status == 'scheduled' ? '2099-01-01T09:00:00.000Z' : null,
  'sentAt': status == 'sent' ? '2026-11-12T09:00:00.000Z' : null,
  'recipientCount': status == 'sent' ? 42 : 0,
  'readCount': status == 'sent' ? 17 : 0,
  'createdAt': '2026-11-12T08:00:00.000Z',
  'createdBy': {'email': 'admin@test.com'},
};

Future<TestApp> announcementsApp({List<Map<String, dynamic>> history = const []}) async {
  final app = await TestApp.create(account: superAdmin, location: '/admin/announcements');
  app.backend
    ..on('GET /admin/announcements', {'announcements': history})
    ..onRequest(
      'POST /admin/announcements',
      (r) => FakeResponse({
        'announcement': {...announcement('new', 'sent'), ...Map<String, dynamic>.from(r.data as Map)},
      }, status: 201),
    );
  return app;
}

Future<void> fillIn(
  WidgetTester tester, {
  String title = 'New feature',
  String body = 'Try-on is live.',
  String link = '',
}) async {
  await tester.enterText(find.widgetWithText(TextFormField, 'e.g. Scheduled maintenance on Sunday'), title);
  await tester.enterText(find.widgetWithText(TextFormField, 'What merchants need to know'), body);
  if (link.isNotEmpty) await tester.enterText(find.widgetWithText(TextFormField, '/dashboard/subscription'), link);
  // Let the focused field finish scrolling itself into view.
  await tester.pumpAndSettle();
}

Future<RequestOptions?> sendAndConfirm(
  WidgetTester tester,
  TestApp app, {
  String button = 'Send announcement',
  String confirm = 'Send now',
}) async {
  await tester.ensureVisible(find.widgetWithText(SnapButton, button));
  await tester.pumpAndSettle();
  await tester.tap(find.widgetWithText(SnapButton, button));
  await tester.pumpAndSettle();
  final confirmButton = find.widgetWithText(SnapButton, confirm);
  if (confirmButton.evaluate().isEmpty) return null;
  await tester.tap(confirmButton);
  await settle(tester);
  final posts = app.backend.sent('POST /admin/announcements');
  return posts.isEmpty ? null : posts.last;
}

void main() {
  testWidgets('sends to all merchants, with a live preview', (tester) async {
    final app = await announcementsApp();
    await app.pump(tester);

    final preview = find.byKey(const ValueKey('preview-title'));
    await tester.scrollUntilVisible(preview, 300, scrollable: find.byType(Scrollable).first);
    expect(tester.widget<Text>(preview).data, 'Your title');
    await fillIn(tester, link: '/dashboard/size-charts');
    await tester.scrollUntilVisible(preview, 300, scrollable: find.byType(Scrollable).first);
    expect(tester.widget<Text>(preview).data, 'New feature');

    final post = await sendAndConfirm(tester, app);
    expect(post!.data, {
      'title': 'New feature',
      'body': 'Try-on is live.',
      'link': '/dashboard/size-charts',
      'audience': {'type': 'all'},
    });
    expect(find.text('Announcement sent'), findsOneWidget);
  });

  testWidgets('checks the title, message, link and audience before sending', (tester) async {
    final app = await announcementsApp();
    await app.pump(tester);

    await sendAndConfirm(tester, app);
    expect(find.text('Title is required'), findsOneWidget);
    expect(find.text('Message is required'), findsOneWidget);

    await fillIn(tester, title: 'x' * 121, link: 'https://example.com');
    await sendAndConfirm(tester, app);
    expect(find.text('Title must be 120 characters or fewer'), findsOneWidget);
    expect(find.textContaining('Use an in-app path'), findsOneWidget);

    await fillIn(tester, link: '/dashboard');
    await tester.tap(find.text('By plan'));
    await tester.pumpAndSettle();
    await sendAndConfirm(tester, app);
    expect(find.text('Choose at least one plan'), findsOneWidget);

    await tester.tap(find.text('Specific merchants'));
    await tester.pumpAndSettle();
    await sendAndConfirm(tester, app);
    expect(find.text('Choose at least one merchant'), findsOneWidget);

    expect(app.backend.called('POST /admin/announcements'), isFalse);
  });

  testWidgets('sends to chosen plans', (tester) async {
    final app = await announcementsApp();
    await app.pump(tester);
    await fillIn(tester);

    await tester.tap(find.text('By plan'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilterChip, 'Enterprise'));
    await tester.tap(find.widgetWithText(FilterChip, 'Small'));
    await tester.pumpAndSettle();

    final post = await sendAndConfirm(tester, app);
    expect(post!.data['audience'], {
      'type': 'plan',
      'plans': ['small', 'enterprise'],
    });
    expect(post.data.containsKey('link'), isFalse);
  });

  testWidgets('sends to merchants picked from a search', (tester) async {
    final app = await announcementsApp();
    app.backend.onRequest('GET /admin/merchants', (r) {
      final search = '${r.queryParameters['search'] ?? ''}';
      final all = [
        merchant,
        {...unsubscribedMerchant, 'businessName': 'Other Store'},
      ];
      return FakeResponse({
        'merchants': [
          for (final m in all)
            if ('${m['businessName']}'.toLowerCase().contains(search.toLowerCase())) m,
        ],
        'page': 1,
        'pages': 1,
        'total': all.length,
      });
    });
    await app.pump(tester);
    await fillIn(tester);

    await tester.tap(find.text('Specific merchants'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.widgetWithText(SnapButton, 'Choose merchants'));
    await tester.tap(find.widgetWithText(SnapButton, 'Choose merchants'));
    await settle(tester);
    expect(find.text('Other Store'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextFormField, 'Search business, name or email'), 'other');
    await tester.pump(const Duration(milliseconds: 400));
    await settle(tester);
    expect(find.text('Shop'), findsNothing);
    expect(app.backend.sent('GET /admin/merchants').last.queryParameters['search'], 'other');

    await tester.tap(find.text('Other Store'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(SnapButton, 'Use 1 merchant'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(InputChip, 'Other Store'), findsOneWidget);

    final post = await sendAndConfirm(tester, app);
    expect(post!.data['audience'], {
      'type': 'merchants',
      'merchantIds': ['m2'],
    });
  });

  testWidgets('schedules for later', (tester) async {
    final app = await announcementsApp();
    await app.pump(tester);
    await fillIn(tester);

    final toggle = find.descendant(of: find.bySemanticsLabel('Schedule for later'), matching: find.byType(Switch));
    await tester.ensureVisible(toggle);
    await tester.tap(toggle);
    await tester.pumpAndSettle();
    expect(find.textContaining('Sends '), findsOneWidget);

    final before = DateTime.now();
    final post = await sendAndConfirm(tester, app, button: 'Schedule announcement', confirm: 'Schedule');
    final scheduledAt = DateTime.parse(post!.data['scheduledAt'] as String);
    expect(scheduledAt.isUtc, isTrue);
    expect(scheduledAt.isAfter(before), isTrue);
    expect(post.data['audience'], {'type': 'all'});
    expect(find.text('Announcement scheduled'), findsOneWidget);
  });

  testWidgets('history shows status, recipients and reads, and cancels a scheduled one', (tester) async {
    final app = await announcementsApp(
      history: [
        announcement('a2', 'scheduled', title: 'Upcoming'),
        announcement('a1', 'sent', title: 'Sent one'),
      ],
    );
    app.backend.on('POST /admin/announcements/a2/cancel', {
      'announcement': announcement('a2', 'cancelled', title: 'Upcoming'),
    });
    await app.pump(tester);

    final cancel = find.widgetWithText(SnapButton, 'Cancel');
    await tester.scrollUntilVisible(cancel, 300, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    expect(find.text('Scheduled'), findsOneWidget);
    expect(find.text('Sent'), findsOneWidget);
    expect(find.text('42 recipients · 17 read'), findsOneWidget);

    await tester.tap(cancel);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(SnapButton, 'Cancel announcement'));
    await settle(tester);

    expect(app.backend.called('POST /admin/announcements/a2/cancel'), isTrue);
    expect(find.text('Cancelled'), findsOneWidget);
    expect(find.text('Scheduled'), findsNothing);
  });
}
