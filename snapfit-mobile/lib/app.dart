import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'core/app_settings.dart';
import 'core/auth_state.dart';
import 'core/notifications_state.dart';
import 'core/push.dart';
import 'core/toast.dart';
import 'router.dart';
import 'theme/app_theme.dart';

class SnapFitApp extends StatefulWidget {
  const SnapFitApp({
    super.key,
    required this.auth,
    this.initialLocation,
    this.push,
    this.pollInterval = const Duration(seconds: 30),
  });

  final AuthState auth;
  final String? initialLocation;

  /// Push notifications; null (or one without Firebase) leaves them off.
  final PushService? push;

  /// How often the unread notification count is refreshed while signed in.
  final Duration pollInterval;

  @override
  State<SnapFitApp> createState() => _SnapFitAppState();
}

class _SnapFitAppState extends State<SnapFitApp> {
  late final GoRouter _router = buildRouter(widget.auth, initialLocation: widget.initialLocation);
  late final NotificationsState _notifications = NotificationsState(
    widget.auth.api,
    widget.auth,
    interval: widget.pollInterval,
  );

  @override
  void initState() {
    super.initState();
    final push = widget.push;
    if (push != null && push.enabled) {
      // Taps on a notification navigate, so wait until the router is up.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        push.start(auth: widget.auth, open: _openLink, onForegroundMessage: _notifications.bump);
      });
    }
  }

  /// Opens a tapped notification's link (or the Notifications screen).
  void _openLink(String? link) {
    if (!mounted) return;
    _router.go(notificationTarget(_router, widget.auth, link));
  }

  @override
  void dispose() {
    widget.push?.dispose();
    _notifications.dispose();
    _router.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final settings = context.watch<AppSettings>();
    return ChangeNotifierProvider<NotificationsState?>.value(
      value: _notifications,
      child: MaterialApp.router(
        title: 'SnapFit',
        debugShowCheckedModeBanner: false,
        scaffoldMessengerKey: messengerKey,
        theme: buildTheme(Brightness.light),
        darkTheme: buildTheme(Brightness.dark),
        themeMode: settings.themeMode,
        routerConfig: _router,
      ),
    );
  }
}
