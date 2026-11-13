import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/format.dart';
import '../core/notifications_api.dart';
import '../core/plans.dart';
import '../core/toast.dart';
import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import '../widgets/ui.dart';
import 'receipt_screens.dart';

/// A merchant's receipts on the admin merchant page: download the PDF, or
/// void an issued one (it stays on record, marked VOID).
class AdminReceiptsCard extends StatefulWidget {
  const AdminReceiptsCard({super.key, required this.merchantId});

  final String merchantId;

  @override
  State<AdminReceiptsCard> createState() => _AdminReceiptsCardState();
}

class _AdminReceiptsCardState extends State<AdminReceiptsCard> {
  List<Map<String, dynamic>>? _receipts;
  String? _error;
  final _busy = <Object?>{};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final receipts = await context.read<ApiClient>().fetchMerchantReceipts(widget.merchantId);
      if (mounted) setState(() => _receipts = receipts);
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e, "Couldn't load this merchant's receipts."));
    }
  }

  Future<void> _download(Map<String, dynamic> receipt) async {
    final api = context.read<ApiClient>();
    setState(() => _busy.add(receipt['_id']));
    await downloadReceipt(() => api.downloadAdminReceiptPdf(receipt['_id'] as Object), receipt['number']);
    if (mounted) setState(() => _busy.remove(receipt['_id']));
  }

  Future<void> _void(Map<String, dynamic> receipt) async {
    final ok = await confirmAction(
      context,
      title: 'Void receipt ${receipt['number']}?',
      message:
          'The receipt stays on record but is marked VOID on the merchant\'s copy and the PDF. This cannot be undone.',
      confirmLabel: 'Void receipt',
    );
    if (!ok || !mounted) return;
    final api = context.read<ApiClient>();
    setState(() => _busy.add(receipt['_id']));
    try {
      final updated = await api.voidReceipt(receipt['_id'] as Object);
      if (!mounted) return;
      setState(() => receipt.addAll(updated.isEmpty ? {'status': 'void'} : updated));
      showToast('Receipt ${receipt['number']} voided', kind: ToastKind.success);
    } catch (e) {
      showToast(errorMessage(e, "Couldn't void the receipt."), kind: ToastKind.error);
    } finally {
      if (mounted) setState(() => _busy.remove(receipt['_id']));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final receipts = _receipts;
    Widget body;
    if (_error != null) {
      body = SnapAlert(
        variant: AlertVariant.danger,
        title: _error,
        action: SnapButton(label: 'Try again', size: ButtonSize.sm, variant: ButtonVariant.secondary, onPressed: _load),
      );
    } else if (receipts == null) {
      body = const PageLoader(compact: true);
    } else if (receipts.isEmpty) {
      body = Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Text(
          'No receipts yet.',
          textAlign: TextAlign.center,
          style: snapText(size: 14, color: c.mutedForeground),
        ),
      );
    } else {
      body = Column(
        children: [
          for (var i = 0; i < receipts.length; i++) ...[
            if (i > 0) Divider(height: 1, color: c.border),
            _row(context, receipts[i]),
          ],
        ],
      );
    }
    return SnapCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text.rich(
            TextSpan(
              style: snapText(size: 14, weight: FontWeight.w500, color: c.foreground),
              children: [
                const TextSpan(text: 'Receipts '),
                if (receipts != null)
                  TextSpan(
                    text: '(${formatNumber(receipts.length)})',
                    style: snapText(size: 14, color: c.mutedForeground),
                  ),
              ],
            ),
          ),
          gap8,
          body,
        ],
      ),
    );
  }

  Widget _row(BuildContext context, Map<String, dynamic> r) {
    final c = context.colors;
    final busy = _busy.contains(r['_id']);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${r['number'] ?? ''}',
                  style: TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: c.foreground,
                  ),
                ),
              ),
              ReceiptStatusBadge(r),
            ],
          ),
          gap4,
          Text(
            '${r['planName'] ?? formatPlanName(r['plan'] as String?)} · ${formatMoney(r['total'] as num?, r['currency'] as String?)}'
            ' · ${receiptReasonLabel(r['reason'])}',
            style: snapText(size: 13, color: c.body),
          ),
          Text(
            'Issued ${formatShortDate(r['issuedAt'])} · ${formatPeriod(r)}',
            style: snapText(size: 12, color: c.mutedForeground),
          ),
          gap8,
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              SnapButton(
                label: 'PDF',
                icon: LucideIcons.fileDown,
                variant: ButtonVariant.secondary,
                size: ButtonSize.sm,
                onPressed: busy ? null : () => _download(r),
              ),
              if (!isVoidReceipt(r))
                SnapButton(
                  label: 'Void',
                  icon: LucideIcons.ban,
                  variant: ButtonVariant.secondary,
                  size: ButtonSize.sm,
                  loading: busy,
                  onPressed: () => _void(r),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
