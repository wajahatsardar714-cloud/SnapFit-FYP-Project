import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/format.dart';
import '../core/json.dart';
import '../core/notifications_api.dart';
import '../core/plans.dart';
import '../core/toast.dart';
import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import '../widgets/ui.dart';
import 'admin_common.dart';

const announcementTitleMax = 120;
const announcementBodyMax = 2000;

enum AudienceType { all, plan, merchants }

const _statusBadges = {
  'scheduled': ('Scheduled', BadgeVariant.warning),
  'sent': ('Sent', BadgeVariant.success),
  'cancelled': ('Cancelled', BadgeVariant.neutral),
};

/// "All merchants", "Small and Medium plans", "3 merchants".
String audienceLabel(Object? audience) {
  final a = audience is Map ? audience : const {};
  switch (a['type']) {
    case 'plan':
      final names = [for (final p in asList(a['plans'])) formatPlanName('$p')];
      if (names.isEmpty) return 'By plan';
      final joined = names.length == 1
          ? names.first
          : '${names.sublist(0, names.length - 1).join(', ')} and ${names.last}';
      return '$joined plan${names.length == 1 ? '' : 's'}';
    case 'merchants':
      final count = asList(a['merchantIds']).length;
      return '$count merchant${count == 1 ? '' : 's'}';
    default:
      return 'All merchants';
  }
}

/// The super admin's announcements: write one (to everyone, a plan or chosen
/// merchants, now or later) with a live preview, and the history with
/// recipients, reads and Cancel for scheduled ones.
class AnnouncementsScreen extends StatefulWidget {
  const AnnouncementsScreen({super.key});

  @override
  State<AnnouncementsScreen> createState() => _AnnouncementsScreenState();
}

class _AnnouncementsScreenState extends State<AnnouncementsScreen> {
  final _title = TextEditingController();
  final _body = TextEditingController();
  final _link = TextEditingController();
  AudienceType _audience = AudienceType.all;
  final _plans = <String>{};
  final _merchants = <String, Map<String, dynamic>>{};
  bool _schedule = false;
  DateTime? _scheduledAt;
  Map<String, String> _errors = {};
  bool _sending = false;

  List<Map<String, dynamic>>? _history;
  String? _historyError;
  final _cancelling = <Object?>{};

  @override
  void initState() {
    super.initState();
    for (final controller in [_title, _body, _link]) {
      controller.addListener(_changed);
    }
    _loadHistory();
  }

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    _link.dispose();
    super.dispose();
  }

  void _changed() => setState(() {});

  Future<void> _loadHistory() async {
    setState(() => _historyError = null);
    try {
      final list = await context.read<ApiClient>().fetchAnnouncements();
      if (mounted) setState(() => _history = list);
    } catch (e) {
      if (mounted) setState(() => _historyError = errorMessage(e, "Couldn't load past announcements."));
    }
  }

  /// The next full hour after an hour from now: a sensible first schedule.
  static DateTime _defaultSchedule() {
    final soon = DateTime.now().add(const Duration(hours: 1));
    return DateTime(soon.year, soon.month, soon.day, soon.hour + 1);
  }

  Map<String, String> _validate() {
    final title = _title.text.trim();
    final body = _body.text.trim();
    final link = _link.text.trim();
    return {
      if (title.isEmpty) 'title': 'Title is required',
      if (title.length > announcementTitleMax) 'title': 'Title must be $announcementTitleMax characters or fewer',
      if (body.isEmpty) 'body': 'Message is required',
      if (body.length > announcementBodyMax) 'body': 'Message must be $announcementBodyMax characters or fewer',
      if (link.isNotEmpty && (!link.startsWith('/') || link.startsWith('//') || link.contains(' ')))
        'link': 'Use an in-app path that starts with "/", e.g. /dashboard/subscription',
      if (_audience == AudienceType.plan && _plans.isEmpty) 'audience': 'Choose at least one plan',
      if (_audience == AudienceType.merchants && _merchants.isEmpty) 'audience': 'Choose at least one merchant',
      if (_schedule && (_scheduledAt == null || !_scheduledAt!.isAfter(DateTime.now())))
        'schedule': 'Pick a time in the future',
    };
  }

  Map<String, dynamic> _payload() {
    final link = _link.text.trim();
    return {
      'title': _title.text.trim(),
      'body': _body.text.trim(),
      if (link.isNotEmpty) 'link': link,
      'audience': switch (_audience) {
        AudienceType.all => {'type': 'all'},
        AudienceType.plan => {
          'type': 'plan',
          'plans': [
            for (final p in plans)
              if (_plans.contains(p)) p,
          ],
        },
        AudienceType.merchants => {'type': 'merchants', 'merchantIds': _merchants.keys.toList()},
      },
      if (_schedule && _scheduledAt != null) 'scheduledAt': _scheduledAt!.toUtc().toIso8601String(),
    };
  }

  Future<void> _send() async {
    final errors = _validate();
    setState(() => _errors = errors);
    if (errors.isNotEmpty) return;
    final payload = _payload();
    final who = audienceLabel(payload['audience']);
    final ok = await confirmAction(
      context,
      title: _schedule ? 'Schedule this announcement?' : 'Send this announcement now?',
      message: _schedule
          ? 'It goes to $who on ${DateFormat('MMM d, y · h:mm a').format(_scheduledAt!)}. You can cancel it until then.'
          : 'It goes to $who straight away, in the app and as a push notification. This cannot be undone.',
      confirmLabel: _schedule ? 'Schedule' : 'Send now',
      danger: false,
    );
    if (!ok || !mounted) return;
    setState(() => _sending = true);
    try {
      final created = await context.read<ApiClient>().createAnnouncement(payload);
      if (!mounted) return;
      showToast(_schedule ? 'Announcement scheduled' : 'Announcement sent', kind: ToastKind.success);
      setState(() {
        _title.clear();
        _body.clear();
        _link.clear();
        _audience = AudienceType.all;
        _plans.clear();
        _merchants.clear();
        _schedule = false;
        _scheduledAt = null;
        _errors = {};
        if (created.isNotEmpty && _history != null) _history = [created, ..._history!];
      });
      _loadHistory();
    } catch (e) {
      showToast(errorMessage(e, "Couldn't send the announcement."), kind: ToastKind.error);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _cancel(Map<String, dynamic> announcement) async {
    final ok = await confirmAction(
      context,
      title: 'Cancel this announcement?',
      message: '"${announcement['title']}" will not be sent.',
      confirmLabel: 'Cancel announcement',
    );
    if (!ok || !mounted) return;
    setState(() => _cancelling.add(announcement['_id']));
    try {
      final updated = await context.read<ApiClient>().cancelAnnouncement(announcement['_id'] as Object);
      if (!mounted) return;
      setState(() => announcement.addAll(updated.isEmpty ? {'status': 'cancelled'} : updated));
      showToast('Announcement cancelled', kind: ToastKind.success);
    } catch (e) {
      showToast(errorMessage(e, "Couldn't cancel the announcement."), kind: ToastKind.error);
    } finally {
      if (mounted) setState(() => _cancelling.remove(announcement['_id']));
    }
  }

  Future<void> _pickSchedule() async {
    final now = DateTime.now();
    final initial = _scheduledAt ?? _defaultSchedule();
    final date = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: 365)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(initial));
    if (time == null || !mounted) return;
    setState(() => _scheduledAt = DateTime(date.year, date.month, date.day, time.hour, time.minute));
  }

  Future<void> _pickMerchants() async {
    final picked = await showModalBottomSheet<Map<String, Map<String, dynamic>>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => _MerchantPicker(initial: _merchants),
    );
    if (picked != null && mounted) {
      setState(() {
        _merchants
          ..clear()
          ..addAll(picked);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return PageBody(
      onRefresh: _loadHistory,
      children: [
        const PageIntro(
          title: 'Announcements',
          description: 'Send a notice to merchants, in the app and as a push notification.',
        ),
        gap16,
        _composeCard(c),
        gap16,
        _previewCard(c),
        gap16,
        _historyCard(c),
      ],
    );
  }

  Widget _composeCard(SnapColors c) {
    return SectionCard(
      title: 'New announcement',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SnapField(
            label: 'Title',
            controller: _title,
            hint: 'e.g. Scheduled maintenance on Sunday',
            error: _errors['title'],
            helper: '${_title.text.trim().length}/$announcementTitleMax',
          ),
          gap16,
          SnapField(
            label: 'Message',
            controller: _body,
            maxLines: 5,
            hint: 'What merchants need to know',
            error: _errors['body'],
            helper: '${_body.text.trim().length}/$announcementBodyMax',
          ),
          gap16,
          SnapField(
            label: 'Link (optional)',
            controller: _link,
            hint: '/dashboard/subscription',
            error: _errors['link'],
            helper: 'Where tapping the notification goes. Leave empty for the Notifications page.',
          ),
          gap16,
          const FieldLabel('Audience'),
          Segmented<AudienceType>(
            value: _audience,
            expand: true,
            options: const {
              AudienceType.all: 'All',
              AudienceType.plan: 'By plan',
              AudienceType.merchants: 'Specific merchants',
            },
            onChanged: (v) => setState(() {
              _audience = v;
              _errors = {..._errors}..remove('audience');
            }),
          ),
          if (_audience == AudienceType.plan) ...[
            gap12,
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final p in plans)
                  FilterChip(
                    label: Text(formatPlanName(p)),
                    selected: _plans.contains(p),
                    showCheckmark: true,
                    checkmarkColor: c.admin,
                    selectedColor: c.adminSoft,
                    backgroundColor: c.surface,
                    side: BorderSide(color: _plans.contains(p) ? c.admin.withValues(alpha: 0.4) : c.border),
                    labelStyle: snapText(size: 13, color: _plans.contains(p) ? c.admin : c.foreground),
                    onSelected: (on) => setState(() => on ? _plans.add(p) : _plans.remove(p)),
                  ),
              ],
            ),
          ],
          if (_audience == AudienceType.merchants) ...[
            gap12,
            if (_merchants.isNotEmpty) ...[
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final m in _merchants.values)
                    InputChip(
                      label: Text('${m['businessName'] ?? m['email'] ?? m['_id']}'),
                      labelStyle: snapText(size: 13, color: c.foreground),
                      backgroundColor: c.surface2,
                      side: BorderSide(color: c.border),
                      deleteIcon: Icon(LucideIcons.x, size: 14, color: c.mutedForeground),
                      onDeleted: () => setState(() => _merchants.remove('${m['_id']}')),
                    ),
                ],
              ),
              gap8,
            ],
            Align(
              alignment: Alignment.centerLeft,
              child: SnapButton(
                label: _merchants.isEmpty ? 'Choose merchants' : 'Change merchants (${_merchants.length})',
                icon: LucideIcons.users,
                variant: ButtonVariant.secondary,
                size: ButtonSize.sm,
                onPressed: _pickMerchants,
              ),
            ),
          ],
          if (_errors['audience'] != null) ...[
            gap4,
            Text(
              _errors['audience']!,
              style: snapText(size: 13, weight: FontWeight.w500, color: c.danger),
            ),
          ],
          gap16,
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Schedule for later',
                      style: snapText(size: 14, weight: FontWeight.w600, color: c.foreground),
                    ),
                    Text(
                      _schedule && _scheduledAt != null
                          ? 'Sends ${DateFormat('EEE, MMM d, y · h:mm a').format(_scheduledAt!)}'
                          : 'Off: it is sent as soon as you press Send.',
                      style: snapText(size: 12, color: c.mutedForeground),
                    ),
                  ],
                ),
              ),
              Semantics(
                label: 'Schedule for later',
                child: Switch(
                  value: _schedule,
                  activeTrackColor: c.admin,
                  activeThumbColor: c.adminForeground,
                  onChanged: (on) => setState(() {
                    _schedule = on;
                    _scheduledAt = on ? (_scheduledAt ?? _defaultSchedule()) : null;
                    _errors = {..._errors}..remove('schedule');
                  }),
                ),
              ),
            ],
          ),
          if (_schedule) ...[
            gap8,
            Align(
              alignment: Alignment.centerLeft,
              child: SnapButton(
                label: 'Change date and time',
                icon: LucideIcons.calendarClock,
                variant: ButtonVariant.secondary,
                size: ButtonSize.sm,
                onPressed: _pickSchedule,
              ),
            ),
          ],
          if (_errors['schedule'] != null) ...[
            gap4,
            Text(
              _errors['schedule']!,
              style: snapText(size: 13, weight: FontWeight.w500, color: c.danger),
            ),
          ],
          gap24,
          SnapButton(
            label: _schedule ? 'Schedule announcement' : 'Send announcement',
            icon: _schedule ? LucideIcons.calendarClock : LucideIcons.send,
            variant: ButtonVariant.admin,
            expand: true,
            loading: _sending,
            onPressed: _send,
          ),
        ],
      ),
    );
  }

  /// How the notification will look in a merchant's list.
  Widget _previewCard(SnapColors c) {
    final title = _title.text.trim();
    final body = _body.text.trim();
    return SectionCard(
      title: 'Preview',
      subtitle: 'As merchants will see it in their notifications.',
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: c.solid(c.primarySoft),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: c.primary.withValues(alpha: 0.3)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: c.surface,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: c.border),
              ),
              child: Icon(LucideIcons.megaphone, size: 18, color: c.primary),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title.isEmpty ? 'Your title' : title,
                    key: const ValueKey('preview-title'),
                    style: snapText(size: 14, weight: FontWeight.w700, color: title.isEmpty ? c.muted : c.foreground),
                  ),
                  gap4,
                  Text(
                    body.isEmpty ? 'Your message appears here.' : body,
                    style: snapText(size: 13, color: body.isEmpty ? c.muted : c.body, height: 1.45),
                  ),
                  gap4,
                  Text(
                    '${_schedule && _scheduledAt != null ? formatDateTime(_scheduledAt!.toIso8601String()) : 'Just now'} · ${audienceLabel(_payload()['audience'])}',
                    style: snapText(size: 12, color: c.mutedForeground),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _historyCard(SnapColors c) {
    final history = _history;
    Widget body;
    if (_historyError != null) {
      body = SnapAlert(
        variant: AlertVariant.danger,
        title: _historyError,
        action: SnapButton(
          label: 'Try again',
          size: ButtonSize.sm,
          variant: ButtonVariant.secondary,
          onPressed: _loadHistory,
        ),
      );
    } else if (history == null) {
      body = const PageLoader(compact: true);
    } else if (history.isEmpty) {
      body = Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Text(
          'No announcements yet.',
          textAlign: TextAlign.center,
          style: snapText(size: 14, color: c.mutedForeground),
        ),
      );
    } else {
      body = Column(
        children: [
          for (var i = 0; i < history.length; i++) ...[
            if (i > 0) Divider(height: 1, color: c.border),
            _historyRow(c, history[i]),
          ],
        ],
      );
    }
    return SectionCard(title: 'History', child: body);
  }

  Widget _historyRow(SnapColors c, Map<String, dynamic> a) {
    final status = '${a['status'] ?? ''}';
    final badge = _statusBadges[status] ?? (humanize(status), BadgeVariant.neutral);
    final when = status == 'scheduled'
        ? 'Scheduled for ${formatAdminDateTime(a['scheduledAt'])}'
        : status == 'sent'
        ? 'Sent ${formatAdminDateTime(a['sentAt'] ?? a['createdAt'])}'
        : 'Cancelled · created ${formatAdminDateTime(a['createdAt'])}';
    final by = (a['createdBy'] as Map?)?['email'];
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  '${a['title'] ?? ''}',
                  style: snapText(size: 14, weight: FontWeight.w600, color: c.foreground),
                ),
              ),
              const SizedBox(width: 8),
              SnapBadge(badge.$1, variant: badge.$2),
            ],
          ),
          if ('${a['body'] ?? ''}'.isNotEmpty) ...[
            gap4,
            Text(
              '${a['body']}',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: snapText(size: 13, color: c.body, height: 1.45),
            ),
          ],
          gap4,
          Text(
            '${audienceLabel(a['audience'])} · $when${by == null ? '' : ' · by $by'}',
            style: snapText(size: 12, color: c.mutedForeground),
          ),
          if (status == 'sent') ...[
            gap4,
            Text(
              '${formatNumber(a['recipientCount'] as num?)} recipients · ${formatNumber(a['readCount'] as num?)} read',
              style: snapText(size: 12, weight: FontWeight.w500, color: c.foreground),
            ),
          ],
          if (status == 'scheduled') ...[
            gap8,
            Align(
              alignment: Alignment.centerLeft,
              child: SnapButton(
                label: 'Cancel',
                icon: LucideIcons.circleSlash,
                variant: ButtonVariant.secondary,
                size: ButtonSize.sm,
                loading: _cancelling.contains(a['_id']),
                onPressed: () => _cancel(a),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// A searchable list of merchants (the admin merchants API) to tick.
class _MerchantPicker extends StatefulWidget {
  const _MerchantPicker({required this.initial});

  final Map<String, Map<String, dynamic>> initial;

  @override
  State<_MerchantPicker> createState() => _MerchantPickerState();
}

class _MerchantPickerState extends State<_MerchantPicker> {
  final _search = TextEditingController();
  late final _selected = Map<String, Map<String, dynamic>>.from(widget.initial);
  List<Map<String, dynamic>>? _results;
  String? _error;
  int _request = 0;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  /// Searches a moment after typing stops, not on every key.
  void _typed(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), _load);
  }

  Future<void> _load() async {
    final request = ++_request;
    setState(() => _error = null);
    try {
      final res = await context.read<ApiClient>().get(
        '/admin/merchants',
        query: {'page': 1, 'limit': 20, 'search': _search.text.trim()},
      );
      if (!mounted || request != _request) return;
      setState(() => _results = [for (final m in asList(res['merchants'])) Map<String, dynamic>.from(m as Map)]);
    } catch (e) {
      if (mounted && request == _request) setState(() => _error = errorMessage(e, "Couldn't load merchants."));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final results = _results;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.75,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Text(
                'Choose merchants',
                style: snapText(size: 16, weight: FontWeight.w600, color: c.foreground),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: SnapField(
                controller: _search,
                hint: 'Search business, name or email',
                textInputAction: TextInputAction.search,
                onSubmitted: (_) => _load(),
                onChanged: _typed,
                suffix: Icon(LucideIcons.search, size: 16, color: c.mutedForeground),
              ),
            ),
            gap8,
            Expanded(
              child: _error != null
                  ? LoadError(message: _error!, onRetry: _load)
                  : results == null
                  ? const Padding(padding: EdgeInsets.all(16), child: PageLoader(compact: true))
                  : results.isEmpty
                  ? Center(
                      child: Text('No merchants match.', style: snapText(size: 14, color: c.mutedForeground)),
                    )
                  : ListView(
                      children: [
                        for (final m in results)
                          CheckboxListTile(
                            value: _selected.containsKey('${m['_id']}'),
                            controlAffinity: ListTileControlAffinity.leading,
                            title: Text(
                              '${m['businessName'] ?? ''}',
                              style: snapText(size: 14, weight: FontWeight.w500, color: c.foreground),
                            ),
                            subtitle: Text(
                              '${m['email'] ?? ''} · ${formatPlanName((m['subscription'] as Map?)?['plan'] as String?)}',
                              style: snapText(size: 12, color: c.mutedForeground),
                            ),
                            onChanged: (on) => setState(() {
                              if (on == true) {
                                _selected['${m['_id']}'] = {
                                  '_id': '${m['_id']}',
                                  'businessName': m['businessName'],
                                  'email': m['email'],
                                };
                              } else {
                                _selected.remove('${m['_id']}');
                              }
                            }),
                          ),
                      ],
                    ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: SnapButton(
                  label: _selected.isEmpty
                      ? 'Done'
                      : 'Use ${_selected.length} merchant${_selected.length == 1 ? '' : 's'}',
                  variant: ButtonVariant.admin,
                  expand: true,
                  onPressed: () => Navigator.pop(context, _selected),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
