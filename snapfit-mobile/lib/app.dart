import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'core/app_settings.dart';
import 'core/auth_state.dart';
import 'core/toast.dart';
import 'router.dart';
import 'theme/app_theme.dart';

class SnapFitApp extends StatefulWidget {
  const SnapFitApp({super.key, required this.auth, this.initialLocation});

  final AuthState auth;
  final String? initialLocation;

  @override
  State<SnapFitApp> createState() => _SnapFitAppState();
}

class _SnapFitAppState extends State<SnapFitApp> {
  late final GoRouter _router = buildRouter(widget.auth, initialLocation: widget.initialLocation);

  @override
  void dispose() {
    _router.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final settings = context.watch<AppSettings>();
    return MaterialApp.router(
      title: 'SnapFit',
      debugShowCheckedModeBanner: false,
      scaffoldMessengerKey: messengerKey,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      themeMode: settings.themeMode,
      routerConfig: _router,
    );
  }
}
