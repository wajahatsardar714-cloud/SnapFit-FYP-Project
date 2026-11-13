import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/notifications_api.dart';
import '../core/toast.dart';
import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import '../widgets/ui.dart';

/// Which notifications the account receives, grouped as the server groups
/// them. Important ones (security, billing, announcements) cannot be turned
/// off and read "Always on". Each switch saves straight away.
class NotificationPreferencesCard extends StatefulWidget {
  const NotificationPreferencesCard({super.key});

  @override
  State<NotificationPreferencesCard> createState() => _NotificationPreferencesCardState();
}

class _NotificationPreferencesCardState extends State<NotificationPreferencesCard> {
  NotificationPreferences? _prefs;
  String? _error;
  final _saving = <String>{};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final prefs = await context.read<ApiClient>().fetchNotificationPreferences();
      if (mounted) setState(() => _prefs = prefs);
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e, "Couldn't load your notification settings."));
    }
  }

  Future<void> _toggle(String type, bool value) async {
    final prefs = _prefs;
    if (prefs == null) return;
    final before = Map<String, bool>.from(prefs.preferences);
    final next = {...before, type: value};
    setState(() {
      _prefs = NotificationPreferences(preferences: next, types: prefs.types);
      _saving.add(type);
    });
    // Only the types that can be muted are sent: the server refuses to turn
    // an important one off.
    final body = {
      for (final t in prefs.types)
        if (t['important'] != true) '${t['type']}': next['${t['type']}'] ?? true,
    };
    try {
      final saved = await context.read<ApiClient>().saveNotificationPreferences(body);
      if (!mounted) return;
      setState(
        () => _prefs = saved.types.isEmpty
            ? NotificationPreferences(preferences: saved.preferences, types: prefs.types)
            : saved,
      );
      showToast('Notification settings saved', kind: ToastKind.success);
    } catch (e) {
      if (mounted) setState(() => _prefs = NotificationPreferences(preferences: before, types: prefs.types));
      showToast(errorMessage(e, "Couldn't save your notification settings."), kind: ToastKind.error);
    } finally {
      if (mounted) setState(() => _saving.remove(type));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final prefs = _prefs;
    Widget content;
    if (_error != null) {
      content = SnapAlert(
        variant: AlertVariant.danger,
        title: _error,
        action: SnapButton(label: 'Try again', size: ButtonSize.sm, variant: ButtonVariant.secondary, onPressed: _load),
      );
    } else if (prefs == null) {
      content = const PageLoader(compact: true);
    } else {
      final groups = <String, List<Map<String, dynamic>>>{};
      for (final t in prefs.types) {
        groups.putIfAbsent('${t['group'] ?? 'Other'}', () => []).add(t);
      }
      content = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final (i, entry) in groups.entries.indexed) ...[
            if (i > 0) gap16,
            Text(
              entry.key.toUpperCase(),
              style: snapText(size: 11, weight: FontWeight.w600, color: c.mutedForeground, letterSpacing: 0.8),
            ),
            gap4,
            for (final t in entry.value)
              _PreferenceRow(
                label: '${t['label'] ?? t['type']}',
                important: t['important'] == true,
                value: t['important'] == true || (prefs.preferences['${t['type']}'] ?? true),
                busy: _saving.contains('${t['type']}'),
                onChanged: (v) => _toggle('${t['type']}', v),
              ),
          ],
        ],
      );
    }
    return SectionCard(
      title: 'Notifications',
      subtitle: 'Choose what you hear about. Important account and billing notices are always on.',
      child: content,
    );
  }
}

class _PreferenceRow extends StatelessWidget {
  const _PreferenceRow({
    required this.label,
    required this.important,
    required this.value,
    required this.busy,
    required this.onChanged,
  });

  final String label;
  final bool important;
  final bool value;
  final bool busy;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: snapText(size: 14, color: c.foreground, height: 1.4)),
          ),
          const SizedBox(width: 12),
          if (important)
            Semantics(
              label: '$label: always on',
              child: ExcludeSemantics(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(LucideIcons.lock, size: 13, color: c.mutedForeground),
                    const SizedBox(width: 4),
                    Text(
                      'Always on',
                      style: snapText(size: 12, weight: FontWeight.w500, color: c.mutedForeground),
                    ),
                  ],
                ),
              ),
            )
          else
            Semantics(
              label: label,
              child: Switch(
                value: value,
                activeTrackColor: c.primary,
                activeThumbColor: c.primaryForeground,
                onChanged: busy ? null : onChanged,
              ),
            ),
        ],
      ),
    );
  }
}
