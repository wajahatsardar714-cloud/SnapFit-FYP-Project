import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/auth_state.dart';
import '../core/format.dart';
import '../core/notifications_api.dart';
import '../core/notifications_state.dart';
import '../core/toast.dart';
import '../router.dart' show notificationTarget;
import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import '../widgets/ui.dart';
import 'notification_widgets.dart';

const notificationsPageSize = 20;

/// The account's notifications, newest first: All/Unread filter, pull to
/// refresh, Load more, tap to read and open, swipe (or the ⋮ menu) to delete,
/// and Mark all read. The same screen serves the merchant dashboard and the
/// admin console ([admin]).
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key, this.admin = false});

  final bool admin;

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final _items = <Map<String, dynamic>>[];
  bool _unreadOnly = false;
  bool _loading = true;
  bool _loadingMore = false;
  bool _markingAll = false;
  String? _error;
  int _page = 1;
  int _total = 0;
  int _unreadCount = 0;
  late final NotificationsState? _state = context.read<NotificationsState?>();
  int _seenRevision = 0;

  @override
  void initState() {
    super.initState();
    _seenRevision = _state?.revision ?? 0;
    _state?.addListener(_stateChanged);
    _load();
  }

  @override
  void dispose() {
    _state?.removeListener(_stateChanged);
    super.dispose();
  }

  /// A push arrived while this screen is open: show it.
  void _stateChanged() {
    final revision = _state?.revision ?? 0;
    if (revision == _seenRevision) return;
    _seenRevision = revision;
    _load(quiet: true);
  }

  Future<void> _load({bool quiet = false}) async {
    if (!quiet) {
      setState(() {
        _loading = _items.isEmpty;
        _error = null;
      });
    }
    try {
      final page = await context.read<ApiClient>().fetchNotifications(
        limit: notificationsPageSize,
        unreadOnly: _unreadOnly,
      );
      if (!mounted) return;
      setState(() {
        _items
          ..clear()
          ..addAll(page.notifications);
        _page = 1;
        _total = page.total;
        _unreadCount = page.unreadCount;
        _loading = false;
        _error = null;
      });
      _state?.setUnreadCount(page.unreadCount);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        if (!quiet) _error = errorMessage(e, "Couldn't load your notifications.");
      });
    }
  }

  Future<void> _loadMore() async {
    setState(() => _loadingMore = true);
    try {
      final page = await context.read<ApiClient>().fetchNotifications(
        page: _page + 1,
        limit: notificationsPageSize,
        unreadOnly: _unreadOnly,
      );
      if (!mounted) return;
      final known = {for (final n in _items) n['_id']};
      setState(() {
        _items.addAll(page.notifications.where((n) => !known.contains(n['_id'])));
        _page = page.page;
        _total = page.total;
        _unreadCount = page.unreadCount;
      });
      _state?.setUnreadCount(page.unreadCount);
    } catch (e) {
      showToast(errorMessage(e, "Couldn't load more notifications."), kind: ToastKind.error);
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  void _setFilter(bool unreadOnly) {
    if (unreadOnly == _unreadOnly) return;
    setState(() {
      _unreadOnly = unreadOnly;
      _items.clear();
    });
    _load();
  }

  Future<void> _markRead(Map<String, dynamic> item) async {
    if (item['read'] == true) return;
    final api = context.read<ApiClient>();
    setState(() {
      item['read'] = true;
      _unreadCount = _unreadCount > 0 ? _unreadCount - 1 : 0;
    });
    _state?.markOneRead();
    try {
      final updated = await api.markNotificationRead(item['_id'] as Object);
      if (updated.isNotEmpty && mounted) setState(() => item.addAll(updated));
    } catch (_) {
      // Shown as read anyway; the next load brings the server's view back.
    }
  }

  Future<void> _open(Map<String, dynamic> item) async {
    final router = GoRouter.of(context);
    final auth = context.read<AuthState>();
    final current = GoRouterState.of(context).uri.path;
    await _markRead(item);
    final target = notificationTarget(router, auth, item['link'] as String?);
    if (target != current) router.go(target);
  }

  Future<void> _delete(Map<String, dynamic> item) async {
    final api = context.read<ApiClient>();
    final index = _items.indexOf(item);
    if (index < 0) return;
    final wasUnread = item['read'] != true;
    setState(() {
      _items.removeAt(index);
      _total = _total > 0 ? _total - 1 : 0;
      if (wasUnread) _unreadCount = _unreadCount > 0 ? _unreadCount - 1 : 0;
    });
    if (wasUnread) _state?.markOneRead();
    try {
      await api.deleteNotification(item['_id'] as Object);
      showToast('Notification deleted', kind: ToastKind.success);
    } catch (e) {
      showToast(errorMessage(e, "Couldn't delete the notification."), kind: ToastKind.error);
      if (!mounted) return;
      setState(() {
        _items.insert(index.clamp(0, _items.length), item);
        _total++;
        if (wasUnread) _unreadCount++;
      });
      _state?.refresh();
    }
  }

  Future<void> _markAllRead() async {
    setState(() => _markingAll = true);
    try {
      await context.read<ApiClient>().markAllNotificationsRead();
      if (!mounted) return;
      setState(() {
        for (final n in _items) {
          n['read'] = true;
        }
        _unreadCount = 0;
        if (_unreadOnly) {
          _items.clear();
          _total = 0;
        }
      });
      _state?.setUnreadCount(0);
      showToast('All notifications marked as read', kind: ToastKind.success);
    } catch (e) {
      showToast(errorMessage(e, "Couldn't mark the notifications as read."), kind: ToastKind.error);
    } finally {
      if (mounted) setState(() => _markingAll = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final header = PageIntro(
      title: 'Notifications',
      description: widget.admin
          ? 'New merchants, plan choices and limits reached across SnapFit.'
          : 'Updates about your account, subscription, usage and products.',
      actions: [
        Segmented<bool>(value: _unreadOnly, options: const {false: 'All', true: 'Unread'}, onChanged: _setFilter),
        SnapButton(
          label: 'Mark all read',
          icon: LucideIcons.checkCheck,
          variant: ButtonVariant.secondary,
          size: ButtonSize.sm,
          loading: _markingAll,
          onPressed: _unreadCount > 0 ? _markAllRead : null,
        ),
      ],
    );

    final List<Widget> body;
    if (_error != null) {
      body = [LoadError(message: _error!, onRetry: _load)];
    } else if (_loading) {
      body = [const PageLoader(compact: true)];
    } else if (_items.isEmpty) {
      body = [
        EmptyState(
          icon: _unreadOnly ? LucideIcons.checkCheck : LucideIcons.bellOff,
          title: _unreadOnly ? "You're all caught up" : 'No notifications yet',
          description: _unreadOnly
              ? 'There are no unread notifications.'
              : 'Account, subscription and usage updates will appear here.',
        ),
      ];
    } else {
      body = [
        if (_unreadCount > 0) ...[
          Text(
            '$_unreadCount unread',
            style: snapText(size: 13, weight: FontWeight.w500, color: c.mutedForeground),
          ),
          gap8,
        ],
        for (final item in _items) ...[
          _NotificationTile(
            key: ValueKey(item['_id']),
            item: item,
            onTap: () => _open(item),
            onMarkRead: () => _markRead(item),
            onDelete: () => _delete(item),
          ),
          gap8,
        ],
        if (_items.length < _total)
          Center(
            child: SnapButton(
              label: 'Load more',
              variant: ButtonVariant.secondary,
              size: ButtonSize.sm,
              loading: _loadingMore,
              onPressed: _loadMore,
            ),
          ),
      ];
    }

    return PageBody(onRefresh: _load, children: [header, gap16, ...body]);
  }
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({
    super.key,
    required this.item,
    required this.onTap,
    required this.onMarkRead,
    required this.onDelete,
  });

  final Map<String, dynamic> item;
  final VoidCallback onTap;
  final VoidCallback onMarkRead;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final unread = item['read'] != true;
    final title = '${item['title'] ?? ''}';
    return Dismissible(
      key: ValueKey('dismiss-${item['_id']}'),
      direction: DismissDirection.endToStart,
      onDismissed: (_) => onDelete(),
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        decoration: BoxDecoration(color: c.dangerSoft, borderRadius: BorderRadius.circular(14)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(LucideIcons.trash2, size: 18, color: c.danger),
            const SizedBox(width: 8),
            Text(
              'Delete',
              style: snapText(size: 14, weight: FontWeight.w600, color: c.danger),
            ),
          ],
        ),
      ),
      child: Semantics(
        label: unread ? 'Unread' : null,
        child: SnapCard(
          padding: const EdgeInsets.fromLTRB(14, 12, 4, 12),
          color: unread ? c.solid(c.primarySoft) : null,
          borderColor: unread ? c.primary.withValues(alpha: 0.3) : null,
          onTap: onTap,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: unread ? c.surface : c.surface2,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: c.border),
                ),
                child: Icon(notificationIcon(item['type'] as String?), size: 18, color: c.primary),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            style: snapText(
                              size: 14,
                              weight: unread ? FontWeight.w700 : FontWeight.w500,
                              color: c.foreground,
                              height: 1.35,
                            ),
                          ),
                        ),
                        if (unread)
                          Padding(
                            padding: const EdgeInsets.only(left: 8, top: 5),
                            child: Container(
                              key: const ValueKey('unread-dot'),
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(color: c.primary, shape: BoxShape.circle),
                            ),
                          ),
                      ],
                    ),
                    if ('${item['body'] ?? ''}'.isNotEmpty) ...[
                      gap4,
                      Text('${item['body']}', style: snapText(size: 13, color: c.body, height: 1.45)),
                    ],
                    gap4,
                    Row(
                      children: [
                        Text(formatRelative(item['createdAt']), style: snapText(size: 12, color: c.mutedForeground)),
                        if (item['important'] == true) ...[
                          const SizedBox(width: 8),
                          Icon(LucideIcons.lock, size: 11, color: c.mutedForeground),
                          const SizedBox(width: 3),
                          Text('Important', style: snapText(size: 12, color: c.mutedForeground)),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              PopupMenuButton<String>(
                tooltip: 'More actions',
                color: c.surface,
                surfaceTintColor: Colors.transparent,
                icon: Icon(LucideIcons.ellipsisVertical, size: 18, color: c.mutedForeground),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                  side: BorderSide(color: c.border),
                ),
                onSelected: (value) {
                  if (value == 'read') onMarkRead();
                  if (value == 'delete') onDelete();
                },
                itemBuilder: (context) => [
                  if (unread)
                    PopupMenuItem(
                      value: 'read',
                      child: Row(
                        children: [
                          Icon(LucideIcons.check, size: 16, color: c.foreground),
                          const SizedBox(width: 8),
                          Text('Mark as read', style: snapText(size: 14, color: c.foreground)),
                        ],
                      ),
                    ),
                  PopupMenuItem(
                    value: 'delete',
                    child: Row(
                      children: [
                        Icon(LucideIcons.trash2, size: 16, color: c.danger),
                        const SizedBox(width: 8),
                        Text('Delete', style: snapText(size: 14, color: c.danger)),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
