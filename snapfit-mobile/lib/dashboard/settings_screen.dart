import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../auth/auth_screens.dart' show showServerSettings;
import '../core/api_client.dart';
import '../core/app_settings.dart';
import '../core/auth_state.dart';
import '../core/format.dart';
import '../core/toast.dart';
import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import '../widgets/ui.dart';

const _businessTypes = ['clothing', 'footwear', 'accessories'];

const _tabs = [
  ('profile', 'Profile', LucideIcons.user),
  ('security', 'Security', LucideIcons.keyRound),
  ('appearance', 'Appearance', LucideIcons.palette),
  ('danger', 'Danger Zone', LucideIcons.triangleAlert),
];

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  String _tab = 'profile';

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return PageBody(
      children: [
        const PageIntro(title: 'Settings', description: 'Manage your profile, security, appearance, and account.'),
        gap16,
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (final (key, label, icon) in _tabs) ...[
                ChoiceChip(
                  selected: _tab == key,
                  showCheckmark: false,
                  avatar: Icon(icon, size: 16, color: _tab == key ? c.primary : c.mutedForeground),
                  label: Text(label),
                  labelStyle: snapText(
                    size: 14,
                    weight: _tab == key ? FontWeight.w500 : FontWeight.w400,
                    color: _tab == key ? c.primary : c.foreground,
                  ),
                  backgroundColor: c.surface,
                  selectedColor: c.primarySoft,
                  side: BorderSide(color: _tab == key ? c.primary.withValues(alpha: 0.3) : c.border),
                  onSelected: (_) => setState(() => _tab = key),
                ),
                const SizedBox(width: 8),
              ],
            ],
          ),
        ),
        gap16,
        switch (_tab) {
          'security' => const _SecurityTab(),
          'appearance' => const AppearanceTab(),
          'danger' => const _DangerZoneTab(),
          _ => const _ProfileTab(),
        },
      ],
    );
  }
}

class _ProfileTab extends StatefulWidget {
  const _ProfileTab();

  @override
  State<_ProfileTab> createState() => _ProfileTabState();
}

class _ProfileTabState extends State<_ProfileTab> {
  late final Map<String, dynamic> _merchant = context.read<AuthState>().merchant ?? const {};
  late final _name = TextEditingController(text: '${_merchant['name'] ?? ''}');
  late final _businessName = TextEditingController(text: '${_merchant['businessName'] ?? ''}');
  late final _phone = TextEditingController(text: '${_merchant['phone'] ?? ''}');
  late String _businessType = '${_merchant['businessType'] ?? ''}';
  Map<String, String> _errors = {};
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    _businessName.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final errors = <String, String>{
      if (_name.text.trim().isEmpty) 'name': 'Name is required',
      if (_businessName.text.trim().isEmpty) 'businessName': 'Business name is required',
    };
    setState(() => _errors = errors);
    if (errors.isNotEmpty) return;
    setState(() => _saving = true);
    final auth = context.read<AuthState>();
    try {
      final res = await context.read<ApiClient>().put('/merchant/profile', {
        'name': _name.text,
        'businessName': _businessName.text,
        'phone': _phone.text,
        'businessType': _businessType,
      });
      final updated = res['merchant'];
      if (updated is Map) auth.updateMerchant(Map<String, dynamic>.from(updated));
      showToast('Profile updated', kind: ToastKind.success);
    } catch (e) {
      showToast(errorMessage(e, 'Failed to update profile'), kind: ToastKind.error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      title: 'Profile',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SnapField(label: 'Email', initialValue: '${_merchant['email'] ?? ''}', enabled: false),
          gap16,
          SnapField(label: 'Your Name', controller: _name, error: _errors['name']),
          gap16,
          SnapField(label: 'Business Name', controller: _businessName, error: _errors['businessName']),
          gap16,
          SnapField(label: 'Phone (optional)', controller: _phone, keyboardType: TextInputType.phone),
          gap16,
          SnapSelect<String>(
            label: 'Business Type',
            value: _businessType,
            options: {'': 'Not specified', for (final o in _businessTypes) o: capitalize(o)},
            onChanged: (v) => setState(() => _businessType = v ?? ''),
          ),
          gap16,
          Align(
            alignment: Alignment.centerRight,
            child: SnapButton(label: 'Save changes', loading: _saving, onPressed: _save),
          ),
        ],
      ),
    );
  }
}

class _SecurityTab extends StatefulWidget {
  const _SecurityTab();

  @override
  State<_SecurityTab> createState() => _SecurityTabState();
}

class _SecurityTabState extends State<_SecurityTab> {
  final _current = TextEditingController();
  final _new = TextEditingController();
  final _confirm = TextEditingController();
  Map<String, String> _errors = {};
  String _formError = '';
  bool _saving = false;

  @override
  void dispose() {
    _current.dispose();
    _new.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final errors = <String, String>{
      if (_current.text.isEmpty) 'current': 'Current password is required',
      if (_new.text.length < 8) 'new': 'New password must be at least 8 characters',
      if (_confirm.text != _new.text) 'confirm': 'Passwords do not match',
    };
    if (errors.isNotEmpty) {
      setState(() {
        _errors = errors;
        _formError = 'Please fix the highlighted errors below.';
      });
      return;
    }
    setState(() {
      _errors = {};
      _formError = '';
      _saving = true;
    });
    try {
      await context.read<ApiClient>().put('/merchant/password', {
        'currentPassword': _current.text,
        'newPassword': _new.text,
      });
      showToast('Password updated', kind: ToastKind.success);
      _current.clear();
      _new.clear();
      _confirm.clear();
    } catch (e) {
      final message = errorMessage(e, 'Failed to change password');
      if (mounted) setState(() => _formError = message);
      showToast(message, kind: ToastKind.error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      title: 'Security',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_formError.isNotEmpty) ...[SnapAlert(variant: AlertVariant.danger, description: _formError), gap16],
          SnapField(label: 'Current Password', controller: _current, obscureText: true, error: _errors['current']),
          gap16,
          SnapField(label: 'New Password', controller: _new, obscureText: true, error: _errors['new']),
          gap16,
          SnapField(label: 'Confirm New Password', controller: _confirm, obscureText: true, error: _errors['confirm']),
          gap16,
          Align(
            alignment: Alignment.centerRight,
            child: SnapButton(label: 'Update Password', loading: _saving, onPressed: _save),
          ),
        ],
      ),
    );
  }
}

/// Light/dark choice, plus (mobile only) the server address.
class AppearanceTab extends StatelessWidget {
  const AppearanceTab({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final settings = context.watch<AppSettings>();
    Widget option(bool dark, String label, IconData icon) {
      final selected = settings.isDark == dark;
      return Expanded(
        child: Semantics(
          inMutuallyExclusiveGroup: true,
          checked: selected,
          child: Material(
            color: selected ? c.background : Colors.transparent,
            borderRadius: BorderRadius.circular(6),
            child: InkWell(
              borderRadius: BorderRadius.circular(6),
              onTap: selected
                  ? null
                  : () {
                      settings.toggleTheme();
                      showToast('Switched to ${dark ? 'dark' : 'light'} mode', kind: ToastKind.success);
                    },
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(icon, size: 16, color: selected ? c.primary : c.mutedForeground),
                    const SizedBox(width: 8),
                    Text(
                      label,
                      style: snapText(
                        size: 14,
                        weight: FontWeight.w500,
                        color: selected ? c.primary : c.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    }

    return Column(
      children: [
        SectionCard(
          title: 'Appearance',
          subtitle: 'Choose how the dashboard looks on this device. The shopper widget always stays light.',
          child: Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: c.surface2,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: c.border),
            ),
            child: Row(children: [option(false, 'Light', LucideIcons.sun), option(true, 'Dark', LucideIcons.moon)]),
          ),
        ),
        gap16,
        SectionCard(
          title: 'Server',
          subtitle: 'Where this app finds the SnapFit backend.',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SelectableText(
                settings.apiUrl,
                style: TextStyle(fontFamily: 'monospace', fontSize: 13, color: c.foreground),
              ),
              gap12,
              Align(
                alignment: Alignment.centerLeft,
                child: SnapButton(
                  label: 'Change server address',
                  icon: LucideIcons.server,
                  variant: ButtonVariant.secondary,
                  size: ButtonSize.sm,
                  onPressed: () => showServerSettings(context),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _DangerZoneTab extends StatelessWidget {
  const _DangerZoneTab();

  Future<void> _confirmDelete(BuildContext context, String businessName) async {
    final typed = TextEditingController();
    var deleting = false;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setState) {
          final c = dialogContext.colors;
          final canConfirm = typed.text.trim() == businessName;
          return AlertDialog(
            title: const Text('Delete your account?'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text.rich(
                  TextSpan(
                    style: snapText(size: 14, color: c.mutedForeground, height: 1.5),
                    children: [
                      const TextSpan(text: 'This will permanently delete '),
                      TextSpan(
                        text: businessName,
                        style: snapText(size: 14, weight: FontWeight.w500, color: c.foreground),
                      ),
                      const TextSpan(
                        text: "'s account, including all size charts, product mappings, and recommendation history. This cannot be undone.",
                      ),
                    ],
                  ),
                ),
                gap16,
                SnapField(
                  label: 'Type "$businessName" to confirm',
                  controller: typed,
                  onChanged: (_) => setState(() {}),
                ),
              ],
            ),
            actions: [
              SnapButton(
                label: 'Cancel',
                variant: ButtonVariant.ghost,
                onPressed: deleting ? null : () => Navigator.pop(dialogContext),
              ),
              SnapButton(
                label: 'Yes, delete my account',
                variant: ButtonVariant.danger,
                loading: deleting,
                onPressed: canConfirm
                    ? () async {
                        setState(() => deleting = true);
                        try {
                          await context.read<ApiClient>().delete('/merchant/account', {
                            'businessName': typed.text.trim(),
                          });
                          showToast('Your account has been deleted', kind: ToastKind.success);
                          if (dialogContext.mounted) Navigator.pop(dialogContext);
                          if (context.mounted) {
                            await context.read<AuthState>().logout();
                            if (context.mounted) context.go('/signin');
                          }
                        } catch (e) {
                          showToast(errorMessage(e, 'Failed to delete account'), kind: ToastKind.error);
                          setState(() => deleting = false);
                        }
                      }
                    : null,
              ),
            ],
          );
        },
      ),
    );
    typed.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final businessName = '${context.read<AuthState>().merchant?['businessName'] ?? ''}';
    return SnapCard(
      padding: EdgeInsets.zero,
      borderColor: c.danger.withValues(alpha: 0.3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              'Danger Zone',
              style: snapText(size: 15, weight: FontWeight.w600, color: c.danger),
            ),
          ),
          Divider(height: 1, color: c.danger.withValues(alpha: 0.3)),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Permanently delete your SnapFit account, API key, size charts, product mappings, and recommendation history. This action cannot be undone.',
                  style: snapText(size: 14, color: c.foreground, height: 1.5),
                ),
                gap16,
                SnapButton(
                  label: 'Delete Account',
                  variant: ButtonVariant.danger,
                  onPressed: () => _confirmDelete(context, businessName),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
