import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'core/api_client.dart';
import 'core/app_settings.dart';
import 'core/auth_state.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final settings = await AppSettings.load();
  final api = ApiClient(settings);
  final auth = AuthState(api);
  await auth.restore();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: settings),
        Provider.value(value: api),
        ChangeNotifierProvider.value(value: auth),
      ],
      child: SnapFitApp(auth: auth),
    ),
  );
}
