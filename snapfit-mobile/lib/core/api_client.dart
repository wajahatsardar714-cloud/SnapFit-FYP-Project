import 'package:dio/dio.dart';

import 'app_settings.dart';

/// The backend's JSON API (same endpoints as the web app's src/services/api.js).
/// Adds the signed-in bearer token to every request and reports the two
/// account-wide 403s -- a suspended account and a missing subscription -- to
/// the handlers [AuthState] registers.
class ApiClient {
  ApiClient(this._settings) : dio = Dio(BaseOptions(connectTimeout: const Duration(seconds: 15))) {
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          options.baseUrl = _settings.apiUrl;
          final token = tokenReader?.call();
          // API-key calls (the shopper widget, the docs tester) go without the
          // signed-in session, like the web app's plain fetch calls.
          if (token != null && options.extra['noAuth'] != true && !options.headers.containsKey('Authorization')) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (error, handler) {
          if (isSuspendedError(error) && error.requestOptions.path != '/auth/login') {
            onAccountSuspended?.call(_message(error) ?? 'Your account has been suspended.');
          } else if (isSubscriptionRequiredError(error)) {
            onSubscriptionRequired?.call(_message(error) ?? 'An active subscription is required.');
          }
          handler.next(error);
        },
      ),
    );
  }

  final AppSettings _settings;
  final Dio dio;

  String? Function()? tokenReader;
  void Function(String message)? onAccountSuspended;
  void Function(String message)? onSubscriptionRequired;

  String get baseUrl => _settings.apiUrl;
  String get serverOrigin => _settings.serverOrigin;

  Future<Map<String, dynamic>> get(String path, {Map<String, dynamic>? query}) async =>
      _json(await dio.get(path, queryParameters: _clean(query)));

  Future<Map<String, dynamic>> post(String path, [Object? body]) async => _json(await dio.post(path, data: body));

  Future<Map<String, dynamic>> put(String path, [Object? body]) async => _json(await dio.put(path, data: body));

  Future<Map<String, dynamic>> patch(String path, [Object? body]) async => _json(await dio.patch(path, data: body));

  Future<Map<String, dynamic>> delete(String path, [Object? body]) async => _json(await dio.delete(path, data: body));

  /// Raw bytes, for CSV exports.
  Future<List<int>> download(String path) async {
    final res = await dio.get<List<int>>(path, options: Options(responseType: ResponseType.bytes));
    return res.data ?? const [];
  }

  static Map<String, dynamic>? _clean(Map<String, dynamic>? query) {
    if (query == null) return null;
    return {
      for (final e in query.entries)
        if (e.value != null && e.value != '') e.key: e.value,
    };
  }

  static Map<String, dynamic> _json(Response res) {
    final data = res.data;
    if (data is Map<String, dynamic>) return data;
    return {'data': data};
  }
}

String? _message(DioException error) {
  final data = error.response?.data;
  if (data is Map && data['message'] is String) return data['message'] as String;
  return null;
}

bool isSuspendedError(DioException error) =>
    error.response?.statusCode == 403 && RegExp('suspended', caseSensitive: false).hasMatch(_message(error) ?? '');

bool isSubscriptionRequiredError(DioException error) {
  final data = error.response?.data;
  return error.response?.statusCode == 403 && data is Map && data['code'] == 'SUBSCRIPTION_REQUIRED';
}

int? statusOf(Object error) => error is DioException ? error.response?.statusCode : null;

/// The JSON body of a failed request, when it has one.
Map? errorBody(Object error) {
  final data = error is DioException ? error.response?.data : null;
  return data is Map ? data : null;
}

/// The server's message for a failed request, or [fallback]. A request that
/// never reached the server says so, since a wrong server address is the
/// usual cause on a phone.
String errorMessage(Object error, String fallback) {
  if (error is DioException) {
    final message = _message(error);
    if (message != null && message.isNotEmpty) return message;
    switch (error.type) {
      case DioExceptionType.connectionError:
      case DioExceptionType.connectionTimeout:
        return "Can't reach the SnapFit server. Check the server address and that your phone is on the same Wi-Fi.";
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
        return 'The server took too long to answer. Please try again.';
      default:
        break;
    }
  }
  return fallback;
}
