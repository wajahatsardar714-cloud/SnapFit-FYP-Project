import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapfit_mobile/core/push.dart';
import 'package:snapfit_mobile/core/push_firebase.dart';
import 'package:snapfit_mobile/widgets/ui.dart';

import 'support/harness.dart';

/// Stands in for Firebase Messaging and the local notifications plugin.
class FakePushMessaging implements PushMessaging {
  FakePushMessaging({this.token = 'fcm-1', this.launchLink});

  String? token;
  String? launchLink;
  int initCalls = 0;
  int permissionRequests = 0;
  final shown = <PushMessage>[];
  void Function(String? link)? localTap;

  final tokenRefresh = StreamController<String>.broadcast();
  final foreground = StreamController<PushMessage>.broadcast();
  final opened = StreamController<PushMessage>.broadcast();

  @override
  Future<void> init({required void Function(String? link) onLocalTap}) async {
    initCalls++;
    localTap = onLocalTap;
  }

  @override
  Future<bool> requestPermission() async {
    permissionRequests++;
    return true;
  }

  @override
  Future<String?> getToken() async => token;

  @override
  Stream<String> get onTokenRefresh => tokenRefresh.stream;

  @override
  Stream<PushMessage> get onForegroundMessage => foreground.stream;

  @override
  Stream<PushMessage> get onMessageOpenedApp => opened.stream;

  @override
  Future<String?> getLaunchLink() async => launchLink;

  @override
  Future<void> showLocal(PushMessage message) async => shown.add(message);
}

const _receipt = {
  '_id': 'r1',
  'number': 'SF-2026-000012',
  'status': 'issued',
  'merchant': {'businessName': 'Shop'},
  'planName': 'Medium',
  'currency': 'USD',
  'amount': 99,
  'taxRate': 0,
  'taxAmount': 0,
  'total': 99,
  'paymentMethod': 'Demo (no charge)',
};

const _emptyNotifications = {'notifications': [], 'unreadCount': 0, 'page': 1, 'limit': 20, 'total': 0};

void stubDevices(TestApp app) {
  app.backend
    ..on('POST /devices', {'success': true})
    ..on('DELETE /devices/fcm-1', {'success': true})
    ..on('DELETE /devices/fcm-2', {'success': true})
    ..on('GET /notifications/unread-count', {'unreadCount': 0})
    ..on('GET /notifications', _emptyNotifications)
    ..on('GET /receipts', {'receipts': []})
    ..on('GET /receipts/r1', {'receipt': _receipt})
    // The dashboard home, where sign-in lands.
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
}

void main() {
  test('push is off when the Firebase build values are missing', () {
    // The test build has no --dart-define values.
    expect(firebaseOptionsFromEnvironment(), isNull);
    expect(pushServiceFromEnvironment().enabled, isFalse);
  });

  testWidgets('with push off the app signs in without touching devices', (tester) async {
    final app = await TestApp.create(location: '/signin', push: PushService(null));
    stubDevices(app);
    app.backend.on('POST /auth/login', {'token': 'jwt', 'merchant': merchant});
    await app.pump(tester);

    await tester.enterText(find.byType(TextFormField).at(0), 'shop@test.com');
    await tester.enterText(find.byType(TextFormField).at(1), 'Secret123');
    await tester.tap(find.widgetWithText(SnapButton, 'Log In'));
    await settle(tester);

    expect(app.auth.isAuthenticated, isTrue);
    expect(app.backend.called('POST /devices'), isFalse);
  });

  testWidgets('registers the device after sign-in and unregisters it on sign-out', (tester) async {
    final messaging = FakePushMessaging();
    final push = PushService(messaging);
    final app = await TestApp.create(location: '/signin', push: push);
    stubDevices(app);
    app.backend.on('POST /auth/login', {'token': 'jwt', 'merchant': merchant});
    await app.pump(tester);

    expect(messaging.initCalls, 1);
    expect(messaging.permissionRequests, 0, reason: 'no permission prompt before sign-in');
    expect(app.backend.called('POST /devices'), isFalse);

    await tester.enterText(find.byType(TextFormField).at(0), 'shop@test.com');
    await tester.enterText(find.byType(TextFormField).at(1), 'Secret123');
    await tester.tap(find.widgetWithText(SnapButton, 'Log In'));
    await settle(tester);

    expect(messaging.permissionRequests, 1);
    final register = app.backend.sent('POST /devices').single;
    expect(register.data, {'token': 'fcm-1', 'platform': 'android'});
    expect(register.headers['Authorization'], 'Bearer jwt');
    expect(push.registeredToken, 'fcm-1');

    // A new token is registered as it arrives.
    messaging.tokenRefresh.add('fcm-2');
    await settle(tester);
    expect(app.backend.sent('POST /devices').last.data, {'token': 'fcm-2', 'platform': 'android'});

    // Signing out waits for the unregister call, which needs the test clock.
    final signingOut = app.auth.logout();
    await settle(tester);
    await signingOut;
    await settle(tester);
    final unregister = app.backend.sent('DELETE /devices/fcm-2').single;
    // Sent while the session still worked.
    expect(unregister.headers['Authorization'], 'Bearer jwt');
    expect(push.registeredToken, isNull);
    expect(find.text('Log In'), findsWidgets);

    // Signed out: a refreshed token is not registered.
    final registrations = app.backend.sent('POST /devices').length;
    messaging.tokenRefresh.add('fcm-3');
    await settle(tester);
    expect(app.backend.sent('POST /devices').length, registrations);
  });

  testWidgets('a restored session registers straight away', (tester) async {
    final messaging = FakePushMessaging();
    final app = await TestApp.create(account: merchant, location: '/dashboard/receipts', push: PushService(messaging));
    stubDevices(app);
    await app.pump(tester);
    await settle(tester);

    expect(app.backend.sent('POST /devices').single.data, {'token': 'fcm-1', 'platform': 'android'});
  });

  testWidgets('tapping a push opens its link, and an unknown link opens Notifications', (tester) async {
    final messaging = FakePushMessaging();
    final app = await TestApp.create(account: merchant, location: '/dashboard/receipts', push: PushService(messaging));
    stubDevices(app);
    await app.pump(tester);
    await settle(tester);

    messaging.opened.add(const PushMessage(title: 'Plan active', data: {'link': '/dashboard/receipts/r1'}));
    await settle(tester);
    expect(currentPath(tester), '/dashboard/receipts/r1');
    expect(find.text('SF-2026-000012'), findsOneWidget);

    messaging.opened.add(const PushMessage(title: 'Odd', data: {'link': '/dashboard/something-new'}));
    await settle(tester);
    expect(currentPath(tester), '/dashboard/notifications');

    // A tap on the app's own popup (shown while it was open).
    messaging.localTap!('/dashboard/receipts');
    await settle(tester);
    expect(currentPath(tester), '/dashboard/receipts');

    messaging.localTap!(null);
    await settle(tester);
    expect(currentPath(tester), '/dashboard/notifications');
  });

  testWidgets('a push that launched the app opens its link once the router is ready', (tester) async {
    final messaging = FakePushMessaging(launchLink: '/dashboard/receipts/r1');
    final app = await TestApp.create(account: merchant, location: '/dashboard', push: PushService(messaging));
    stubDevices(app);
    await app.pump(tester);
    await settle(tester);

    expect(currentPath(tester), '/dashboard/receipts/r1');
  });

  testWidgets('a push in the foreground pops up and counts on the badge', (tester) async {
    final messaging = FakePushMessaging();
    final app = await TestApp.create(account: merchant, location: '/dashboard/receipts', push: PushService(messaging));
    stubDevices(app);
    var unread = 0;
    app.backend.onRequest('GET /notifications/unread-count', (_) => FakeResponse({'unreadCount': unread}));
    await app.pump(tester);
    await settle(tester);
    expect(notificationsOf(tester).unreadCount, 0);

    unread = 1;
    messaging.foreground.add(
      const PushMessage(
        title: 'Usage at 80%',
        body: 'You have used 80% of this month\'s requests.',
        data: {'notificationId': 'n9', 'type': 'usage.80', 'link': '/dashboard/analytics'},
      ),
    );
    await tester.pump();
    expect(notificationsOf(tester).unreadCount, 1);
    await settle(tester);

    expect(messaging.shown.single.title, 'Usage at 80%');
    expect(messaging.shown.single.link, '/dashboard/analytics');
    expect(notificationsOf(tester).unreadCount, 1);
    expect(find.text('1'), findsWidgets);
  });
}
