import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/format.dart';
import '../core/plans.dart';
import '../core/toast.dart';
import '../dashboard/product_mapping_screens.dart' show productImageUrl;
import '../core/json.dart';
import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import '../widgets/ui.dart';
import 'admin_common.dart';
import 'admin_screens.dart';

const _tryOnStatus = {
  'ready': ('Try-on ready', BadgeVariant.success),
  'image_missing': ('Image missing', BadgeVariant.warning),
  'anchors_missing': ('Anchors missing', BadgeVariant.warning),
};

class AdminMerchantDetailScreen extends StatefulWidget {
  const AdminMerchantDetailScreen({super.key, required this.merchantId});

  final String merchantId;

  @override
  State<AdminMerchantDetailScreen> createState() => _AdminMerchantDetailScreenState();
}

class _AdminMerchantDetailScreenState extends State<AdminMerchantDetailScreen> {
  Map<String, dynamic>? _detail;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _failed = false);
    try {
      final res = await context.read<ApiClient>().get(merchantPath(widget.merchantId));
      if (mounted) setState(() => _detail = res);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  void _applyMerchant(Map<String, dynamic>? merchant) {
    if (merchant == null || _detail == null) return;
    setState(
      () => _detail = {
        ..._detail!,
        'merchant': {...(_detail!['merchant'] as Map), ...merchant},
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    if (_failed) return LoadError(message: "Couldn't load this merchant.", onRetry: _load);
    final detail = _detail;
    if (detail == null) return const PageLoader();
    final merchant = Map<String, dynamic>.from(detail['merchant'] as Map);
    final subscription = (merchant['subscription'] as Map?) ?? const {};
    final sizeCharts = asList(detail['sizeCharts']);
    final products = asList(detail['products']);
    final recent = asList(detail['recentRecommendations']);

    return PageBody(
      onRefresh: _load,
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => context.go('/admin/merchants'),
            icon: Icon(LucideIcons.arrowLeft, size: 14, color: c.link),
            label: Text(
              'All merchants',
              style: snapText(size: 14, weight: FontWeight.w500, color: c.link),
            ),
          ),
        ),
        Wrap(
          spacing: 8,
          runSpacing: 6,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text(
              '${merchant['businessName']}',
              style: snapText(size: 20, weight: FontWeight.w600, color: c.foreground),
            ),
            AccountStatusBadge(merchant['status'] as String?),
            PlanBadge(subscription['plan'] as String?),
          ],
        ),
        gap4,
        Text('${merchant['email'] ?? ''}', style: snapText(size: 14, color: c.mutedForeground)),
        gap12,
        Align(
          alignment: Alignment.centerLeft,
          child: SnapButton(
            label: 'Open in demo studio',
            icon: LucideIcons.flaskConical,
            variant: ButtonVariant.secondary,
            size: ButtonSize.sm,
            onPressed: () => context.go('/admin/demo?merchantId=${merchant['_id']}'),
          ),
        ),
        if (merchant['status'] == 'suspended') ...[
          gap16,
          SnapAlert(
            variant: AlertVariant.danger,
            title:
                'Suspended${merchant['suspendedAt'] != null ? ' on ${formatAdminDate(merchant['suspendedAt'])}' : ''}',
            description: '${merchant['suspendedReason'] ?? ''}'.isNotEmpty
                ? 'Reason: ${merchant['suspendedReason']}'
                : 'No reason was given.',
          ),
        ],
        gap16,
        SnapCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Profile',
                style: snapText(size: 14, weight: FontWeight.w600, color: c.foreground),
              ),
              gap8,
              DetailRow(label: 'Contact name', value: '${merchant['name'] ?? '—'}'),
              DetailRow(label: 'Phone', value: '${merchant['phone'] ?? ''}'.isEmpty ? '—' : '${merchant['phone']}'),
              DetailRow(
                label: 'Business type',
                value: '${merchant['businessType'] ?? ''}'.isEmpty ? '—' : capitalize('${merchant['businessType']}'),
              ),
              DetailRow(label: 'Joined', value: formatAdminDate(merchant['createdAt'])),
              DetailRow(
                label: 'Subscription',
                value: '',
                valueWidget: SubscriptionStatusBadge(subscription['status'] as String?),
              ),
              DetailRow(
                label: 'Period',
                value:
                    '${formatAdminDate(subscription['startDate'])} – ${subscription['endDate'] != null ? formatAdminDate(subscription['endDate']) : 'no end date'}',
              ),
              gap16,
              AdminUsageBar(subscription: subscription),
            ],
          ),
        ),
        gap16,
        _LimitsEditor(key: ValueKey(subscription), merchant: merchant, onUpdated: _applyMerchant),
        gap16,
        _ApiKeyCard(
          merchant: merchant,
          preview: detail['apiKeyPreview'] as String?,
          onRegenerated: _load,
          onRevoked: _applyMerchant,
        ),
        gap16,
        _AccountActions(merchant: merchant, onUpdated: _applyMerchant),
        gap16,
        _ListCard(
          title: 'Size charts',
          count: sizeCharts.length,
          empty: 'No size charts yet.',
          children: [
            for (final chart in sizeCharts)
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${chart['name']}',
                          style: snapText(size: 14, weight: FontWeight.w500, color: c.foreground),
                        ),
                        Text(
                          '${capitalize('${chart['category'] ?? ''}')} · ${chart['sizesCount'] ?? 0} sizes',
                          style: snapText(size: 12, color: c.mutedForeground),
                        ),
                      ],
                    ),
                  ),
                  SnapBadge(
                    chart['isActive'] == true ? 'Active' : 'Inactive',
                    variant: chart['isActive'] == true ? BadgeVariant.success : BadgeVariant.neutral,
                  ),
                ],
              ),
          ],
        ),
        gap16,
        _ListCard(
          title: 'Products',
          count: products.length,
          empty: 'No products mapped yet.',
          children: [
            for (final product in products)
              Builder(
                builder: (context) {
                  final imageUrl = productImageUrl(context, product['productImage']);
                  final tryOn = _tryOnStatus[product['tryOnStatus']];
                  return Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        clipBehavior: Clip.antiAlias,
                        decoration: BoxDecoration(
                          color: c.surface2,
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: c.border),
                        ),
                        child: imageUrl == null
                            ? Icon(LucideIcons.shirt, size: 16, color: c.muted)
                            : Image.network(
                                imageUrl,
                                fit: BoxFit.cover,
                                errorBuilder: (_, _, _) => Icon(LucideIcons.shirt, size: 16, color: c.muted),
                              ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${product['productName'] ?? ''}'.isEmpty
                                  ? '${product['productId']}'
                                  : '${product['productName']}',
                              style: snapText(size: 14, weight: FontWeight.w500, color: c.foreground),
                            ),
                            Text(
                              '${product['productId']} · ${capitalize('${product['garmentLength'] ?? '—'}')}',
                              style: TextStyle(fontFamily: 'monospace', fontSize: 11, color: c.mutedForeground),
                            ),
                          ],
                        ),
                      ),
                      if (tryOn != null) SnapBadge(tryOn.$1, variant: tryOn.$2),
                    ],
                  );
                },
              ),
          ],
        ),
        gap16,
        _ListCard(
          title: 'Recent recommendations',
          count: recent.length,
          empty: 'No recommendations yet.',
          children: [
            for (final r in recent)
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${r['productId']}',
                          style: TextStyle(fontFamily: 'monospace', fontSize: 12, color: c.foreground),
                        ),
                        Text(
                          '${humanize(r['source']).isEmpty ? '—' : humanize(r['source'])} · ${formatAdminDateTime(r['createdAt'])}',
                          style: snapText(size: 12, color: c.mutedForeground),
                        ),
                      ],
                    ),
                  ),
                  SizedBox(
                    width: 36,
                    child: Text(
                      '${r['recommendedSize'] ?? '—'}',
                      style: snapText(size: 14, weight: FontWeight.w500, color: c.foreground),
                    ),
                  ),
                  SizedBox(
                    width: 44,
                    child: Text(formatPercent(r['confidence'] as num?), style: snapText(size: 13, color: c.foreground)),
                  ),
                  SnapBadge(
                    humanize(r['status']),
                    variant: recommendationStatusVariant[r['status']] ?? BadgeVariant.neutral,
                  ),
                ],
              ),
          ],
        ),
      ],
    );
  }
}

class _ListCard extends StatelessWidget {
  const _ListCard({required this.title, required this.count, required this.empty, required this.children});

  final String title;
  final int count;
  final String empty;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SnapCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text.rich(
            TextSpan(
              style: snapText(size: 14, weight: FontWeight.w500, color: c.foreground),
              children: [
                TextSpan(text: '$title '),
                TextSpan(
                  text: '(${formatNumber(count)})',
                  style: snapText(size: 14, color: c.mutedForeground),
                ),
              ],
            ),
          ),
          gap8,
          if (count == 0)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(
                empty,
                textAlign: TextAlign.center,
                style: snapText(size: 14, color: c.mutedForeground),
              ),
            )
          else
            for (var i = 0; i < children.length; i++) ...[
              if (i > 0) Divider(height: 1, color: c.border),
              Padding(padding: const EdgeInsets.symmetric(vertical: 10), child: children[i]),
            ],
        ],
      ),
    );
  }
}

/// Plan, status, request limit and end date overrides. Only what changed is
/// sent, so a plan change alone lets the server apply that plan's defaults.
class _LimitsEditor extends StatefulWidget {
  const _LimitsEditor({super.key, required this.merchant, required this.onUpdated});

  final Map<String, dynamic> merchant;
  final ValueChanged<Map<String, dynamic>?> onUpdated;

  @override
  State<_LimitsEditor> createState() => _LimitsEditorState();
}

class _LimitsEditorState extends State<_LimitsEditor> {
  late final Map _subscription = (widget.merchant['subscription'] as Map?) ?? const {};
  late String _plan = '${_subscription['plan'] ?? plans.first}';
  late String _status = '${_subscription['status'] ?? 'active'}';
  late bool _unlimited = _subscription['requestsLimit'] == null;
  late final _limit = TextEditingController(text: _subscription['requestsLimit']?.toString() ?? '');
  late DateTime? _endDate = DateTime.tryParse('${_subscription['endDate'] ?? ''}');
  bool _resetUsage = false;
  String _limitError = '';
  bool _saving = false;

  @override
  void dispose() {
    _limit.dispose();
    super.dispose();
  }

  String _dateOnly(DateTime? d) => d == null ? '' : DateFormat('yyyy-MM-dd').format(d.toLocal());

  Map<String, dynamic> _changes() {
    final initialEnd = _dateOnly(DateTime.tryParse('${_subscription['endDate'] ?? ''}'));
    final initialUnlimited = _subscription['requestsLimit'] == null;
    final initialLimit = _subscription['requestsLimit']?.toString() ?? '';
    return {
      if (_plan != '${_subscription['plan'] ?? plans.first}') 'plan': _plan,
      if (_status != '${_subscription['status'] ?? 'active'}') 'status': _status,
      if (_unlimited != initialUnlimited || (!_unlimited && _limit.text != initialLimit))
        'requestsLimit': _unlimited ? null : int.parse(_limit.text),
      if (_dateOnly(_endDate) != initialEnd)
        'endDate': _endDate == null
            ? null
            : DateTime.utc(_endDate!.year, _endDate!.month, _endDate!.day).toIso8601String(),
      if (_resetUsage) 'resetUsage': true,
    };
  }

  Future<void> _save() async {
    if (!_unlimited && !RegExp(r'^\d+$').hasMatch(_limit.text)) {
      setState(() => _limitError = 'Enter a whole number of requests (0 or more), or choose unlimited.');
      return;
    }
    final body = _changes();
    if (body.isEmpty) {
      showToast('Nothing to save — no limits were changed.');
      return;
    }
    setState(() => _saving = true);
    try {
      final res = await context.read<ApiClient>().patch('${merchantPath(widget.merchant['_id'])}/subscription', body);
      widget.onUpdated(res['merchant'] is Map ? Map<String, dynamic>.from(res['merchant'] as Map) : null);
      showToast('Subscription updated', kind: ToastKind.success);
    } catch (e) {
      showToast(errorMessage(e, 'Failed to update the subscription'), kind: ToastKind.error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SectionCard(
      title: 'Plan & limits',
      subtitle: "Override the merchant's plan, request quota and billing period.",
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SnapSelect<String>(
            label: 'Plan',
            value: _plan,
            options: {for (final p in plans) p: formatPlanName(p)},
            onChanged: (v) => setState(() => _plan = v ?? _plan),
          ),
          gap16,
          SnapSelect<String>(
            label: 'Subscription status',
            value: _status,
            options: {for (final s in subscriptionStatuses) s: capitalize(s)},
            onChanged: (v) => setState(() => _status = v ?? _status),
          ),
          gap16,
          SnapField(
            label: 'Request limit',
            controller: _limit,
            enabled: !_unlimited,
            hint: _unlimited ? 'Unlimited' : 'e.g. 5000',
            keyboardType: TextInputType.number,
            error: _limitError,
            onChanged: (_) => setState(() => _limitError = ''),
          ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            activeColor: c.admin,
            value: _unlimited,
            title: Text('Unlimited requests', style: snapText(size: 14, color: c.foreground)),
            onChanged: (v) => setState(() {
              _unlimited = v ?? false;
              _limitError = '';
            }),
          ),
          const FieldLabel('End date'),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    alignment: Alignment.centerLeft,
                    side: BorderSide(color: c.border),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  onPressed: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: _endDate ?? DateTime.now().add(const Duration(days: 30)),
                      firstDate: DateTime(2020),
                      lastDate: DateTime(2100),
                    );
                    if (picked != null) setState(() => _endDate = picked);
                  },
                  icon: Icon(LucideIcons.calendar, size: 16, color: c.mutedForeground),
                  label: Text(
                    _endDate == null ? 'No end date' : formatLongDate(_endDate!.toIso8601String()),
                    style: snapText(size: 14, color: c.foreground),
                  ),
                ),
              ),
              if (_endDate != null)
                IconButton(
                  tooltip: 'Clear end date',
                  icon: Icon(LucideIcons.x, size: 16, color: c.mutedForeground),
                  onPressed: () => setState(() => _endDate = null),
                ),
            ],
          ),
          gap4,
          Text('Leave empty for no end date.', style: snapText(size: 12, color: c.mutedForeground)),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            activeColor: c.admin,
            value: _resetUsage,
            title: Text('Reset requests used to 0', style: snapText(size: 14, color: c.foreground)),
            onChanged: (v) => setState(() => _resetUsage = v ?? false),
          ),
          Align(
            alignment: Alignment.centerRight,
            child: SnapButton(label: 'Save limits', loading: _saving, onPressed: _save),
          ),
        ],
      ),
    );
  }
}

/// The merchant's live key: only a preview is readable. Regenerating shows
/// the new key once; the old one stops working straight away.
class _ApiKeyCard extends StatefulWidget {
  const _ApiKeyCard({
    required this.merchant,
    required this.preview,
    required this.onRegenerated,
    required this.onRevoked,
  });

  final Map<String, dynamic> merchant;
  final String? preview;
  final VoidCallback onRegenerated;
  final ValueChanged<Map<String, dynamic>?> onRevoked;

  @override
  State<_ApiKeyCard> createState() => _ApiKeyCardState();
}

class _ApiKeyCardState extends State<_ApiKeyCard> {
  bool _working = false;

  Future<void> _regenerate() async {
    final hasKey = widget.merchant['hasApiKey'] == true;
    final ok = await confirmAction(
      context,
      title: 'Generate a new API key?',
      message: hasKey
          ? 'The current key stops working immediately; the merchant must update their integration.'
          : 'The new key is shown once so you can pass it on.',
      confirmLabel: 'Generate key',
      danger: hasKey,
    );
    if (!ok || !mounted) return;
    setState(() => _working = true);
    try {
      final res = await context.read<ApiClient>().post('${merchantPath(widget.merchant['_id'])}/api-key');
      widget.onRegenerated();
      if (mounted) await _showNewKey('${res['apiKey']}');
    } catch (e) {
      showToast(errorMessage(e, 'Failed to update the API key'), kind: ToastKind.error);
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _revoke() async {
    final ok = await confirmAction(
      context,
      title: 'Revoke this API key?',
      message: "The merchant's widget and integrations stop working until a new key is generated.",
      confirmLabel: 'Revoke key',
    );
    if (!ok || !mounted) return;
    setState(() => _working = true);
    try {
      final res = await context.read<ApiClient>().delete('${merchantPath(widget.merchant['_id'])}/api-key');
      widget.onRevoked(res['merchant'] is Map ? Map<String, dynamic>.from(res['merchant'] as Map) : null);
      showToast('API key revoked', kind: ToastKind.success);
    } catch (e) {
      showToast(errorMessage(e, 'Failed to update the API key'), kind: ToastKind.error);
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _showNewKey(String key) => showDialog<void>(
    context: context,
    builder: (dialogContext) {
      final c = dialogContext.colors;
      return AlertDialog(
        title: const Text('New API key'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SnapAlert(
              variant: AlertVariant.warning,
              description: "Copy it now and share it securely — it won't be shown again.",
            ),
            gap16,
            const FieldLabel('API key'),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: c.border),
              ),
              child: SelectableText(
                key,
                style: TextStyle(fontFamily: 'monospace', fontSize: 13, color: c.foreground),
              ),
            ),
          ],
        ),
        actions: [
          SnapButton(
            label: 'Copy',
            icon: LucideIcons.copy,
            variant: ButtonVariant.secondary,
            onPressed: () {
              Clipboard.setData(ClipboardData(text: key));
              showToast('Copied to clipboard', kind: ToastKind.success);
            },
          ),
          SnapButton(label: 'Done', onPressed: () => Navigator.pop(dialogContext)),
        ],
      );
    },
  );

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final hasKey = widget.merchant['hasApiKey'] == true;
    return SectionCard(
      title: 'API key',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(LucideIcons.keyRound, size: 18, color: c.mutedForeground),
              const SizedBox(width: 12),
              if (hasKey)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(color: c.surface2, borderRadius: BorderRadius.circular(4)),
                  child: Text(
                    widget.preview ?? 'Active key',
                    style: TextStyle(fontFamily: 'monospace', fontSize: 13, color: c.foreground),
                  ),
                )
              else
                Text('No API key', style: snapText(size: 14, color: c.mutedForeground)),
            ],
          ),
          gap16,
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              SnapButton(
                label: hasKey ? 'Regenerate key' : 'Generate key',
                variant: ButtonVariant.secondary,
                size: ButtonSize.sm,
                loading: _working,
                onPressed: _regenerate,
              ),
              if (hasKey)
                TextButton(
                  onPressed: _working ? null : _revoke,
                  child: Text(
                    'Revoke key',
                    style: snapText(size: 12, weight: FontWeight.w600, color: c.danger),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _AccountActions extends StatelessWidget {
  const _AccountActions({required this.merchant, required this.onUpdated});

  final Map<String, dynamic> merchant;
  final ValueChanged<Map<String, dynamic>?> onUpdated;

  Future<void> _resetPassword(BuildContext context) async {
    final password = TextEditingController();
    String error = '';
    var saving = false;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setState) {
          final c = dialogContext.colors;
          return AlertDialog(
            title: Text("Reset ${merchant['businessName']}'s password"),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Sets a new password for ${merchant['email']}. Share it with the merchant securely.',
                  style: snapText(size: 14, color: c.mutedForeground, height: 1.5),
                ),
                gap16,
                SnapField(
                  label: 'New password',
                  controller: password,
                  obscureText: true,
                  error: error,
                  onChanged: (_) => setState(() => error = ''),
                ),
              ],
            ),
            actions: [
              SnapButton(
                label: 'Cancel',
                variant: ButtonVariant.ghost,
                onPressed: saving ? null : () => Navigator.pop(dialogContext),
              ),
              SnapButton(
                label: 'Reset password',
                loading: saving,
                onPressed: () async {
                  if (password.text.length < 8) {
                    setState(() => error = 'Use at least 8 characters.');
                    return;
                  }
                  setState(() => saving = true);
                  try {
                    final res = await context.read<ApiClient>().post(
                      '${merchantPath(merchant['_id'])}/reset-password',
                      {'password': password.text},
                    );
                    showToast('${res['message'] ?? 'Password reset'}', kind: ToastKind.success);
                    if (dialogContext.mounted) Navigator.pop(dialogContext);
                  } catch (e) {
                    setState(() {
                      error = errorMessage(e, 'Failed to reset the password');
                      saving = false;
                    });
                  }
                },
              ),
            ],
          );
        },
      ),
    );
    password.dispose();
  }

  Future<void> _delete(BuildContext context) async {
    final typed = TextEditingController();
    var deleting = false;
    final name = '${merchant['businessName']}';
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setState) {
          final c = dialogContext.colors;
          return AlertDialog(
            title: const Text('Delete this merchant?'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text.rich(
                  TextSpan(
                    style: snapText(size: 14, color: c.mutedForeground, height: 1.5),
                    children: [
                      const TextSpan(text: 'This permanently deletes '),
                      TextSpan(
                        text: name,
                        style: snapText(size: 14, weight: FontWeight.w500, color: c.foreground),
                      ),
                      const TextSpan(
                        text: ', their API key, size charts, product mappings and recommendation history. This cannot be undone.',
                      ),
                    ],
                  ),
                ),
                gap16,
                SnapField(label: 'Type "$name" to confirm', controller: typed, onChanged: (_) => setState(() {})),
              ],
            ),
            actions: [
              SnapButton(
                label: 'Cancel',
                variant: ButtonVariant.ghost,
                onPressed: deleting ? null : () => Navigator.pop(dialogContext),
              ),
              SnapButton(
                label: 'Delete merchant',
                variant: ButtonVariant.danger,
                loading: deleting,
                onPressed: typed.text.trim() == name
                    ? () async {
                        setState(() => deleting = true);
                        try {
                          await context.read<ApiClient>().delete(merchantPath(merchant['_id']));
                          showToast('$name was deleted', kind: ToastKind.success);
                          if (dialogContext.mounted) Navigator.pop(dialogContext);
                          if (context.mounted) context.go('/admin/merchants');
                        } catch (e) {
                          showToast(errorMessage(e, 'Failed to delete the merchant'), kind: ToastKind.error);
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
    final suspended = merchant['status'] == 'suspended';
    return SectionCard(
      title: 'Account',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SnapButton(
            label: suspended ? 'Reactivate merchant' : 'Suspend merchant',
            icon: suspended ? LucideIcons.rotateCcw : LucideIcons.ban,
            variant: ButtonVariant.secondary,
            size: ButtonSize.sm,
            onPressed: () async => onUpdated(await showMerchantStatusDialog(context, merchant)),
          ),
          gap8,
          SnapButton(
            label: 'Reset password',
            icon: LucideIcons.keyRound,
            variant: ButtonVariant.secondary,
            size: ButtonSize.sm,
            onPressed: () => _resetPassword(context),
          ),
          gap8,
          SnapButton(
            label: 'Delete merchant',
            icon: LucideIcons.trash2,
            variant: ButtonVariant.danger,
            size: ButtonSize.sm,
            onPressed: () => _delete(context),
          ),
        ],
      ),
    );
  }
}
