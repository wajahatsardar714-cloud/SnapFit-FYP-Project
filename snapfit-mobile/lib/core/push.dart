// Push notifications. The Firebase side sits behind [PushMessaging] (the real
// one is in push_firebase.dart, tests use a fake); [PushService] ties it to
// the session: it registers the device after sign-in, unregisters it on
// sign-out, shows pushes that arrive while the app is open and opens a
// notification's link when it is tapped.
import 'dart:async';

import 'package:flutter/foundation.dart';

import 'auth_state.dart';
import 'notifications_api.dart';

/// A push as the app sees it: the notification text and its data
/// (`notificationId`, `type`, `link`).
class PushMessage {
  const PushMessage({this.title, this.body, this.data = const {}});

  final String? title;
  final String? body;
  final Map<String, String> data;

  String? get link {
    final link = data['link'];
    return link == null || link.isEmpty ? null : link;
  }
}

/// What the app needs from Firebase Messaging and the local notifications
/// plugin.
abstract class PushMessaging {
  /// Starts Firebase and the notification channel. [onLocalTap] gets the
  /// link of a popup (shown by [showLocal]) the user taps.
  Future<void> init({required void Function(String? link) onLocalTap});

  /// Asks for permission to show notifications (Android 13+). True if allowed.
  Future<bool> requestPermission();

  Future<String?> getToken();

  Stream<String> get onTokenRefresh;

  /// Pushes that arrive while the app is in the foreground.
  Stream<PushMessage> get onForegroundMessage;

  /// A push tapped while the app was in the background.
  Stream<PushMessage> get onMessageOpenedApp;

  /// The link of the notification that launched the app from closed, if any
  /// (a system push or one of the app's own popups).
  Future<String?> getLaunchLink();

  /// Shows [message] as a heads-up popup (Android shows nothing by itself
  /// while the app is open).
  Future<void> showLocal(PushMessage message);
}

/// Connects [PushMessaging] to the session. With no messaging (Firebase not
/// configured) every call does nothing and the app works without push.
class PushService {
  PushService(this._messaging);

  final PushMessaging? _messaging;

  AuthState? _auth;
  void Function(String? link)? _open;
  VoidCallback? _onForeground;
  final _subscriptions = <StreamSubscription<Object>>[];
  bool _started = false;
  bool _signedIn = false;
  String? _registeredToken;

  bool get enabled => _messaging != null;

  /// The token this device registered for the signed-in account.
  @visibleForTesting
  String? get registeredToken => _registeredToken;

  /// Called once the router is ready. [open] navigates to a notification's
  /// link; [onForegroundMessage] lets the unread badge count a new push.
  Future<void> start({
    required AuthState auth,
    required void Function(String? link) open,
    required VoidCallback onForegroundMessage,
  }) async {
    final messaging = _messaging;
    if (messaging == null || _started) return;
    _started = true;
    _auth = auth;
    _open = open;
    _onForeground = onForegroundMessage;
    try {
      await messaging.init(onLocalTap: (link) => _open?.call(link));
    } catch (e) {
      debugPrint('Push notifications are off: $e');
      return;
    }
    _subscriptions
      ..add(messaging.onForegroundMessage.listen(_foreground))
      ..add(messaging.onMessageOpenedApp.listen((message) => _open?.call(message.link)))
      ..add(messaging.onTokenRefresh.listen(_tokenRefreshed));
    auth.addListener(_authChanged);
    auth.beforeLogout = _unregister;
    _authChanged();

    try {
      final launch = await messaging.getLaunchLink();
      if (launch != null) _open?.call(launch);
    } catch (_) {}
  }

  void _foreground(PushMessage message) {
    _onForeground?.call();
    _messaging?.showLocal(message).catchError((Object e) => debugPrint('Could not show the notification: $e'));
  }

  void _authChanged() {
    final signedIn = _auth?.isAuthenticated ?? false;
    if (signedIn == _signedIn) return;
    _signedIn = signedIn;
    if (signedIn) {
      _register();
    } else {
      _registeredToken = null;
    }
  }

  Future<void> _register() async {
    final messaging = _messaging;
    final auth = _auth;
    if (messaging == null || auth == null) return;
    try {
      await messaging.requestPermission();
      final token = await messaging.getToken();
      if (token == null || !auth.isAuthenticated) return;
      await auth.api.registerDevice(token);
      _registeredToken = token;
    } catch (e) {
      debugPrint('Could not register for push notifications: $e');
    }
  }

  Future<void> _tokenRefreshed(String token) async {
    final auth = _auth;
    if (auth == null || !auth.isAuthenticated) return;
    try {
      await auth.api.registerDevice(token);
      _registeredToken = token;
    } catch (e) {
      debugPrint('Could not re-register for push notifications: $e');
    }
  }

  /// Runs just before sign-out, while the session can still make the call.
  Future<void> _unregister() async {
    final token = _registeredToken;
    final auth = _auth;
    _registeredToken = null;
    if (token == null || auth == null) return;
    await auth.api.unregisterDevice(token);
  }

  Future<void> dispose() async {
    for (final s in _subscriptions) {
      await s.cancel();
    }
    _subscriptions.clear();
    _auth?.removeListener(_authChanged);
    if (_auth?.beforeLogout == _unregister) _auth?.beforeLogout = null;
  }
}
