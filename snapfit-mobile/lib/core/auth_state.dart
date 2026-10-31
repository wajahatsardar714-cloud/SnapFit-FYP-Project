import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api_client.dart';
import 'plans.dart';
import 'toast.dart';

/// Abstracts where the session token lives, so tests can use memory.
abstract class TokenStore {
  Future<String?> read();
  Future<void> write(String token);
  Future<void> clear();
}

class SecureTokenStore implements TokenStore {
  static const _key = 'token';
  final _storage = const FlutterSecureStorage();

  @override
  Future<String?> read() => _storage.read(key: _key);
  @override
  Future<void> write(String token) => _storage.write(key: _key, value: token);
  @override
  Future<void> clear() => _storage.delete(key: _key);
}

class MemoryTokenStore implements TokenStore {
  String? token;
  @override
  Future<String?> read() async => token;
  @override
  Future<void> write(String value) async => token = value;
  @override
  Future<void> clear() async => token = null;
}

/// The signed-in account (merchant or super admin), like the web app's
/// AuthContext. "Remember me" keeps the token on the device; otherwise it
/// lives only until the app is closed.
class AuthState extends ChangeNotifier {
  AuthState(this.api, {TokenStore? store}) : _store = store ?? SecureTokenStore() {
    api.tokenReader = () => _token;
    api.onAccountSuspended = (message) {
      showToast(message, kind: ToastKind.error);
      logout();
    };
    api.onSubscriptionRequired = (message) {
      showToast(message, kind: ToastKind.error);
      // Syncing the account closes the gate; the router then sends the
      // merchant to plan selection.
      refresh().catchError((_) => merchant);
    };
  }

  final ApiClient api;
  final TokenStore _store;

  String? _token;
  Map<String, dynamic>? merchant;

  bool get isAuthenticated => merchant != null;
  String? get role => merchant == null ? null : roleOf(merchant);
  bool get isSuperAdmin => role == roleSuperAdmin;

  /// Restores a remembered session (called once at start-up).
  Future<void> restore() async {
    _token = await _store.read();
    if (_token == null) return;
    try {
      merchant = _account(await api.get('/auth/me'));
    } catch (_) {
      await _store.clear();
      _token = null;
      merchant = null;
    }
    notifyListeners();
  }

  Future<Map<String, dynamic>> login(String email, String password, {bool remember = true}) async {
    final res = await api.post('/auth/login', {'email': email, 'password': password});
    await _start(res, remember: remember);
    return merchant!;
  }

  Future<Map<String, dynamic>> register(Map<String, dynamic> payload) async {
    final res = await api.post('/auth/register', payload);
    await _start(res, remember: true);
    return merchant!;
  }

  Future<void> _start(Map<String, dynamic> res, {required bool remember}) async {
    _token = res['token'] as String?;
    await _store.clear();
    if (remember && _token != null) await _store.write(_token!);
    merchant = _account(res);
    notifyListeners();
  }

  Future<void> logout() async {
    _token = null;
    merchant = null;
    await _store.clear();
    notifyListeners();
  }

  /// Re-reads the account, e.g. after a plan change, so the subscription gate
  /// opens (or closes) straight away.
  Future<Map<String, dynamic>?> refresh() async {
    merchant = _account(await api.get('/auth/me'));
    notifyListeners();
    return merchant;
  }

  void updateMerchant(Map<String, dynamic> patch) {
    if (merchant == null) return;
    merchant = {...merchant!, ...patch};
    notifyListeners();
  }

  static Map<String, dynamic>? _account(Map<String, dynamic> res) {
    final account = res['merchant'];
    return account is Map ? Map<String, dynamic>.from(account) : null;
  }
}
