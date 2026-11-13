import 'dart:async';

import 'package:flutter/widgets.dart';

import 'api_client.dart';
import 'auth_state.dart';
import 'notifications_api.dart';

/// The signed-in account's unread notification count, for the badges on the
/// menu button and the Notifications drawer item. It is fetched on sign-in,
/// every [interval] while signed in and whenever the app comes back to the
/// foreground, and cleared on sign-out.
class NotificationsState extends ChangeNotifier with WidgetsBindingObserver {
  NotificationsState(this.api, this.auth, {this.interval = const Duration(seconds: 30)}) {
    WidgetsBinding.instance.addObserver(this);
    auth.addListener(_authChanged);
    _authChanged();
  }

  final ApiClient api;
  final AuthState auth;
  final Duration interval;

  Timer? _timer;
  bool _signedIn = false;
  bool _disposed = false;
  int _unreadCount = 0;
  int _revision = 0;

  int get unreadCount => _unreadCount;

  /// Goes up whenever something new may have arrived (a push while the app is
  /// open), so an open Notifications screen knows to reload.
  int get revision => _revision;

  void _authChanged() {
    final signedIn = auth.isAuthenticated;
    if (signedIn == _signedIn) return;
    _signedIn = signedIn;
    if (signedIn) {
      _startPolling();
      refresh();
    } else {
      _stopPolling();
      _set(0);
    }
  }

  void _startPolling() {
    _timer?.cancel();
    _timer = Timer.periodic(interval, (_) => refresh());
  }

  void _stopPolling() {
    _timer?.cancel();
    _timer = null;
  }

  /// Re-reads the count from the server. Failures keep the last count.
  Future<void> refresh() async {
    if (!auth.isAuthenticated) return;
    try {
      final count = await api.fetchUnreadCount();
      if (auth.isAuthenticated) _set(count);
    } catch (_) {
      // Offline or the server is down: try again on the next tick.
    }
  }

  /// A screen that just learned the count (a list response, a read-all).
  void setUnreadCount(int count) => _set(count < 0 ? 0 : count);

  /// One notification was read (or an unread one deleted).
  void markOneRead() => _set(_unreadCount > 0 ? _unreadCount - 1 : 0);

  /// A new notification arrived (a push while the app is open): count it at
  /// once, then confirm with the server.
  void bump() {
    _revision++;
    _set(_unreadCount + 1, force: true);
    refresh();
  }

  void _set(int count, {bool force = false}) {
    if (_disposed || (count == _unreadCount && !force)) return;
    _unreadCount = count;
    notifyListeners();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.resumed:
        // Back in front: check at once, then poll again.
        if (_signedIn) {
          _startPolling();
          refresh();
        }
      case AppLifecycleState.paused:
      case AppLifecycleState.hidden:
      case AppLifecycleState.detached:
        // No polling while nobody can see the badge.
        _stopPolling();
      case AppLifecycleState.inactive:
        break;
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    auth.removeListener(_authChanged);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }
}
