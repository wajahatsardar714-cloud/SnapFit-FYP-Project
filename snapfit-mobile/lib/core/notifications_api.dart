// The notifications, devices, receipts and announcements endpoints (the
// shared contract with the backend and the web app), as calls on [ApiClient].
import 'api_client.dart';
import 'json.dart';

String _id(Object id) => Uri.encodeComponent('$id');

Map<String, dynamic> _map(Object? value) => value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

List<Map<String, dynamic>> _maps(Object? value) => [for (final item in asList(value)) _map(item)];

/// One page of the signed-in account's notifications, newest first.
class NotificationPage {
  const NotificationPage({
    required this.notifications,
    required this.unreadCount,
    required this.page,
    required this.limit,
    required this.total,
  });

  factory NotificationPage.fromJson(Map<String, dynamic> json) => NotificationPage(
    notifications: _maps(json['notifications']),
    unreadCount: (json['unreadCount'] as num?)?.toInt() ?? 0,
    page: (json['page'] as num?)?.toInt() ?? 1,
    limit: (json['limit'] as num?)?.toInt() ?? 20,
    total: (json['total'] as num?)?.toInt() ?? 0,
  );

  final List<Map<String, dynamic>> notifications;
  final int unreadCount;
  final int page;
  final int limit;
  final int total;
}

/// The notification types the account can receive, with its on/off choices.
class NotificationPreferences {
  const NotificationPreferences({required this.preferences, required this.types});

  factory NotificationPreferences.fromJson(Map<String, dynamic> json) => NotificationPreferences(
    preferences: {for (final e in _map(json['preferences']).entries) e.key: e.value == true},
    types: _maps(json['types']),
  );

  final Map<String, bool> preferences;

  /// `{ type, label, group, important }`, in the server's order.
  final List<Map<String, dynamic>> types;
}

extension NotificationsApi on ApiClient {
  // Notifications (merchant and super admin).

  Future<NotificationPage> fetchNotifications({int page = 1, int limit = 20, bool unreadOnly = false}) async =>
      NotificationPage.fromJson(
        await get('/notifications', query: {'page': page, 'limit': limit, if (unreadOnly) 'unread': 'true'}),
      );

  Future<int> fetchUnreadCount() async =>
      ((await get('/notifications/unread-count'))['unreadCount'] as num?)?.toInt() ?? 0;

  Future<Map<String, dynamic>> markNotificationRead(Object id) async =>
      _map((await patch('/notifications/${_id(id)}/read'))['notification']);

  Future<int> markAllNotificationsRead() async =>
      ((await post('/notifications/read-all'))['updated'] as num?)?.toInt() ?? 0;

  Future<void> deleteNotification(Object id) => delete('/notifications/${_id(id)}');

  Future<NotificationPreferences> fetchNotificationPreferences() async =>
      NotificationPreferences.fromJson(await get('/notifications/preferences'));

  Future<NotificationPreferences> saveNotificationPreferences(Map<String, bool> preferences) async =>
      NotificationPreferences.fromJson(await put('/notifications/preferences', {'preferences': preferences}));

  // Push devices.

  Future<void> registerDevice(String token) => post('/devices', {'token': token, 'platform': 'android'});

  Future<void> unregisterDevice(String token) => delete('/devices/${_id(token)}');

  // Receipts (merchant).

  Future<List<Map<String, dynamic>>> fetchReceipts() async => _maps((await get('/receipts'))['receipts']);

  Future<Map<String, dynamic>> fetchReceipt(Object id) async => _map((await get('/receipts/${_id(id)}'))['receipt']);

  Future<List<int>> downloadReceiptPdf(Object id) => download('/receipts/${_id(id)}/pdf');

  // Super admin.

  Future<Map<String, dynamic>> createAnnouncement(Map<String, dynamic> payload) async =>
      _map((await post('/admin/announcements', payload))['announcement']);

  Future<List<Map<String, dynamic>>> fetchAnnouncements() async =>
      _maps((await get('/admin/announcements'))['announcements']);

  Future<Map<String, dynamic>> cancelAnnouncement(Object id) async =>
      _map((await post('/admin/announcements/${_id(id)}/cancel'))['announcement']);

  Future<List<Map<String, dynamic>>> fetchMerchantReceipts(Object merchantId) async =>
      _maps((await get('/admin/receipts', query: {'merchantId': '$merchantId'}))['receipts']);

  Future<List<int>> downloadAdminReceiptPdf(Object id) => download('/admin/receipts/${_id(id)}/pdf');

  Future<Map<String, dynamic>> voidReceipt(Object id) async =>
      _map((await post('/admin/receipts/${_id(id)}/void'))['receipt']);
}
