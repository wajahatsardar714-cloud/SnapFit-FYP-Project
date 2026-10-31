import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Where the backend lives. Android's emulator reaches the PC's localhost at
/// 10.0.2.2; a real phone needs the PC's Wi-Fi address instead, set on the
/// sign-in screen (Server settings) or at build time:
///   flutter run --dart-define=API_URL=http://192.168.1.10:5000/api
const defaultApiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:5000/api');

/// App-wide preferences kept on the device: the server address, the theme and
/// the size-check demo's API key and product ID.
class AppSettings extends ChangeNotifier {
  AppSettings(this._prefs);

  static const _apiUrlKey = 'api_url';
  static const _themeKey = 'snapfit-theme';
  static const _demoApiKeyKey = 'demo_api_key';
  static const _demoProductIdKey = 'demo_product_id';
  static const _adminDemoApiKeyKey = 'snapfit_admin_demo_api_key';

  final SharedPreferences _prefs;

  static Future<AppSettings> load() async => AppSettings(await SharedPreferences.getInstance());

  String get apiUrl => _prefs.getString(_apiUrlKey) ?? defaultApiUrl;

  Future<void> setApiUrl(String value) async {
    final trimmed = value.trim().replaceAll(RegExp(r'/+$'), '');
    if (trimmed.isEmpty || trimmed == defaultApiUrl) {
      await _prefs.remove(_apiUrlKey);
    } else {
      await _prefs.setString(_apiUrlKey, trimmed);
    }
    notifyListeners();
  }

  /// The server's origin (no /api), for uploaded files such as product photos.
  String get serverOrigin => apiUrl.replaceFirst(RegExp(r'/api/?$'), '');

  ThemeMode get themeMode => _prefs.getString(_themeKey) == 'dark' ? ThemeMode.dark : ThemeMode.light;

  bool get isDark => themeMode == ThemeMode.dark;

  Future<void> toggleTheme() async {
    await _prefs.setString(_themeKey, isDark ? 'light' : 'dark');
    notifyListeners();
  }

  String get demoApiKey => _prefs.getString(_demoApiKeyKey) ?? '';
  String get demoProductId => _prefs.getString(_demoProductIdKey) ?? 'demo-product-1';

  Future<void> setDemoConfig({required String apiKey, required String productId}) async {
    await _prefs.setString(_demoApiKeyKey, apiKey);
    await _prefs.setString(_demoProductIdKey, productId);
  }

  /// The admin demo studio's "use an API key instead" key.
  String get adminDemoApiKey => _prefs.getString(_adminDemoApiKeyKey) ?? '';

  Future<void> setAdminDemoApiKey(String value) =>
      value.isEmpty ? _prefs.remove(_adminDemoApiKeyKey) : _prefs.setString(_adminDemoApiKeyKey, value);
}
