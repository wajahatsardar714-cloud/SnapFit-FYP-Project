import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:snapfit_mobile/app.dart';
import 'package:snapfit_mobile/core/api_client.dart';
import 'package:snapfit_mobile/core/app_settings.dart';
import 'package:snapfit_mobile/core/auth_state.dart';
import 'package:snapfit_mobile/core/notifications_state.dart';
import 'package:snapfit_mobile/core/push.dart';

/// A canned backend response.
class FakeResponse {
  const FakeResponse(this.body, {this.status = 200});

  final Object? body;
  final int status;
}

typedef FakeHandler = FakeResponse Function(RequestOptions request);

/// Answers the app's requests from a table of "METHOD /path" handlers, and
/// records every request so tests can check what was sent.
class FakeBackend implements HttpClientAdapter {
  final handlers = <String, FakeHandler>{};
  final requests = <RequestOptions>[];

  void on(String route, Object? body, {int status = 200}) =>
      handlers[route] = (_) => FakeResponse(body, status: status);

  /// Answers [route] with [handler], which can look at the request.
  void onRequest(String route, FakeHandler handler) => handlers[route] = handler;

  bool called(String route) => requests.any((r) => '${r.method} ${r.uri.path.replaceFirst('/api', '')}' == route);

  /// Every request sent to [route], oldest first.
  List<RequestOptions> sent(String route) => [
    for (final r in requests)
      if ('${r.method} ${r.uri.path.replaceFirst('/api', '')}' == route) r,
  ];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final route = '${options.method} ${options.uri.path.replaceFirst('/api', '')}';
    final handler = handlers[route];
    final response = handler == null ? const FakeResponse({'message': 'Not found'}, status: 404) : handler(options);
    return ResponseBody.fromString(
      jsonEncode(response.body),
      response.status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

const merchant = {
  '_id': 'm1',
  'email': 'shop@test.com',
  'name': 'Sam Shop',
  'businessName': 'Shop',
  'role': 'merchant',
  'status': 'active',
  'subscription': {
    'plan': 'medium',
    'status': 'active',
    'startDate': '2026-10-01T00:00:00.000Z',
    'endDate': '2099-01-01T00:00:00.000Z',
  },
};

const unsubscribedMerchant = {
  '_id': 'm2',
  'email': 'new@test.com',
  'businessName': 'New Shop',
  'role': 'merchant',
  'status': 'active',
  'subscription': {'plan': null, 'status': 'inactive'},
};

const superAdmin = {
  '_id': 'a1',
  'email': 'admin@test.com',
  'businessName': 'SnapFit',
  'role': 'superadmin',
  'status': 'active',
};

const publishedPlans = {
  'plans': [
    {'plan': 'small', 'name': 'Small', 'price': 29, 'requestsLimit': 500, 'chartsLimit': 5},
    {'plan': 'medium', 'name': 'Medium', 'price': 99, 'requestsLimit': 5000, 'chartsLimit': 50},
    {'plan': 'enterprise', 'name': 'Enterprise', 'price': null, 'requestsLimit': null, 'chartsLimit': null},
  ],
};

/// The running app with a fake backend, optionally signed in as [account].
class TestApp {
  TestApp._(this.backend, this.auth, this.widget, {required this.restore});

  /// Whether to restore the remembered session before showing the app.
  final bool restore;

  final FakeBackend backend;
  final AuthState auth;
  final Widget widget;

  static Future<TestApp> create({
    Map<String, dynamic>? account,
    String? location,
    Map<String, Object> prefs = const {},
    PushService? push,
    Duration pollInterval = const Duration(seconds: 30),
  }) async {
    SharedPreferences.setMockInitialValues(prefs);
    final settings = await AppSettings.load();
    final api = ApiClient(settings);
    final backend = FakeBackend();
    api.dio.httpClientAdapter = backend;
    final store = MemoryTokenStore();
    final auth = AuthState(api, store: store);
    if (account != null) {
      store.token = 'jwt';
      backend.on('GET /auth/me', {'merchant': account});
    }
    final widget = MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: settings),
        Provider.value(value: api),
        ChangeNotifierProvider.value(value: auth),
      ],
      child: SnapFitApp(auth: auth, initialLocation: location, push: push, pollInterval: pollInterval),
    );
    return TestApp._(backend, auth, widget, restore: account != null);
  }

  Future<void> pump(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 2.6;
    addTearDown(tester.view.reset);
    // Restoring the session awaits the (fake) network, which needs real time
    // rather than the test's fake clock.
    if (restore) await tester.runAsync(auth.restore);
    await tester.pumpWidget(widget);
    await tester.pumpAndSettle();
  }
}

/// The app's unread-count state, from anywhere under the app.
NotificationsState notificationsOf(WidgetTester tester) =>
    Provider.of<NotificationsState?>(tester.element(find.byType(Navigator).first), listen: false)!;

/// The path the router is showing.
String currentPath(WidgetTester tester) =>
    GoRouter.of(tester.element(find.byType(Navigator).last)).routerDelegate.currentConfiguration.uri.path;

/// Lets every pending request finish (dio starts each one on a zero-length
/// timer, which pumpAndSettle alone may leave waiting) and the UI settle.
Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 3; i++) {
    await tester.pump(const Duration(milliseconds: 1));
    await tester.pumpAndSettle();
  }
}
