// The real [PushMessaging]: Firebase Cloud Messaging plus
// flutter_local_notifications for popups while the app is open.
//
// Firebase is configured from --dart-define values, not google-services.json:
//   flutter build apk --dart-define=FIREBASE_API_KEY=... \
//     --dart-define=FIREBASE_APP_ID=... \
//     --dart-define=FIREBASE_MESSAGING_SENDER_ID=... \
//     --dart-define=FIREBASE_PROJECT_ID=...
// When any of them is missing, push is off and the app works as before.
import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'push.dart';

const _apiKey = String.fromEnvironment('FIREBASE_API_KEY');
const _appId = String.fromEnvironment('FIREBASE_APP_ID');
const _senderId = String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');
const _projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');

/// The Android notification channel every SnapFit notification uses (the
/// backend's pushes name it too, through the manifest's default channel).
const pushChannelId = 'snapfit_default';
const _channelName = 'SnapFit notifications';
const _channelDescription = 'Account, subscription, usage and announcement notifications.';

/// Firebase options from the build's --dart-define values, or null when any
/// is missing.
FirebaseOptions? firebaseOptionsFromEnvironment() {
  if ([_apiKey, _appId, _senderId, _projectId].any((v) => v.trim().isEmpty)) return null;
  return const FirebaseOptions(apiKey: _apiKey, appId: _appId, messagingSenderId: _senderId, projectId: _projectId);
}

/// The push service for this build: Firebase when it is configured, else off.
PushService pushServiceFromEnvironment() {
  final options = firebaseOptionsFromEnvironment();
  return PushService(options == null ? null : FirebasePushMessaging(options));
}

/// Pushes that arrive while the app is in the background or closed. Their
/// notification part is shown by the system, so there is nothing to do but
/// start Firebase in this background isolate.
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  final options = firebaseOptionsFromEnvironment();
  if (options != null && Firebase.apps.isEmpty) await Firebase.initializeApp(options: options);
}

PushMessage _fromRemote(RemoteMessage message) => PushMessage(
  title: message.notification?.title,
  body: message.notification?.body,
  data: {for (final e in message.data.entries) e.key: '${e.value}'},
);

class FirebasePushMessaging implements PushMessaging {
  FirebasePushMessaging(this.options);

  final FirebaseOptions options;
  final _local = FlutterLocalNotificationsPlugin();

  FirebaseMessaging get _messaging => FirebaseMessaging.instance;

  AndroidFlutterLocalNotificationsPlugin? get _android =>
      _local.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();

  @override
  Future<void> init({required void Function(String? link) onLocalTap}) async {
    if (Firebase.apps.isEmpty) await Firebase.initializeApp(options: options);
    FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);
    await _local.initialize(
      settings: const InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher')),
      onDidReceiveNotificationResponse: (response) => onLocalTap(response.payload),
    );
    await _android?.createNotificationChannel(
      const AndroidNotificationChannel(
        pushChannelId,
        _channelName,
        description: _channelDescription,
        importance: Importance.high,
      ),
    );
  }

  @override
  Future<bool> requestPermission() async {
    // Android 13+ asks the user; older versions allow notifications already.
    final android = _android;
    if (android != null) return await android.requestNotificationsPermission() ?? false;
    final settings = await _messaging.requestPermission();
    return settings.authorizationStatus == AuthorizationStatus.authorized;
  }

  // The classic FCM registration token, which the backend's firebase-admin
  // sends to. (firebase_messaging 17 steers towards register()/onRegistered,
  // which yield a Firebase Installation ID for the newer direct-send API that
  // the backend does not use.)
  @override
  // ignore: deprecated_member_use
  Future<String?> getToken() => _messaging.getToken();

  @override
  // ignore: deprecated_member_use
  Stream<String> get onTokenRefresh => _messaging.onTokenRefresh;

  @override
  Stream<PushMessage> get onForegroundMessage => FirebaseMessaging.onMessage.map(_fromRemote);

  @override
  Stream<PushMessage> get onMessageOpenedApp => FirebaseMessaging.onMessageOpenedApp.map(_fromRemote);

  @override
  Future<String?> getLaunchLink() async {
    final initial = await _messaging.getInitialMessage();
    if (initial != null) return _fromRemote(initial).link;
    final details = await _local.getNotificationAppLaunchDetails();
    if (details?.didNotificationLaunchApp ?? false) return details?.notificationResponse?.payload;
    return null;
  }

  @override
  Future<void> showLocal(PushMessage message) async {
    if (message.title == null && message.body == null) return;
    final key = message.data['notificationId'] ?? '${DateTime.now().microsecondsSinceEpoch}';
    await _local.show(
      id: key.hashCode & 0x7fffffff,
      title: message.title,
      body: message.body,
      payload: message.link,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          pushChannelId,
          _channelName,
          channelDescription: _channelDescription,
          importance: Importance.high,
          priority: Priority.high,
          styleInformation: message.body == null ? null : BigTextStyleInformation(message.body!),
        ),
      ),
    );
  }
}
