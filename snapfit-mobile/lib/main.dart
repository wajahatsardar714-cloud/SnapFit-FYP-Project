import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'core/api_client.dart';
import 'core/app_settings.dart';
import 'core/auth_state.dart';
import 'core/push_firebase.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final settings = await AppSettings.load();
  final api = ApiClient(settings);
  final auth = AuthState(api);
  await auth.restore();
  // Push is on only when the build carries the Firebase --dart-define values.
  final push = pushServiceFromEnvironment();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: settings),
        Provider.value(value: api),
        ChangeNotifierProvider.value(value: auth),
      ],
      child: SnapFitApp(auth: auth, push: push),
    ),
  );
}
