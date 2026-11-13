import 'dart:io';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../core/api_client.dart';
import '../core/format.dart';
import '../core/notifications_api.dart';
import '../core/toast.dart';
import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import '../widgets/logo.dart';
import '../widgets/ui.dart';

String receiptPath(Object? id) => '/dashboard/receipts/${Uri.encodeComponent('$id')}';

/// "$99.00" in the receipt's currency.
String formatMoney(num? amount, [String? currency]) {
  final code = (currency == null || currency.isEmpty) ? 'USD' : currency;
  return NumberFormat.simpleCurrency(name: code).format(amount ?? 0);
}

/// "12 Nov 2026 – 12 Dec 2026"
String formatPeriod(Map receipt) =>
    '${formatShortDate(receipt['periodStart'])} – ${formatShortDate(receipt['periodEnd'])}';

const _reasonLabels = {
  'plan_selected': 'Plan selected',
  'plan_changed': 'Plan changed',
  'admin_change': 'Changed by SnapFit',
};

String receiptReasonLabel(Object? reason) => _reasonLabels[reason] ?? '${reason ?? '—'}';

bool isVoidReceipt(Map receipt) => receipt['status'] == 'void';

/// The file name the server gives a receipt PDF.
String receiptFileName(Object? number) => 'SnapFit-receipt-${number ?? 'receipt'}.pdf';

typedef ReceiptPdfSaver = Future<void> Function(List<int> bytes, String fileName);

/// Saves a receipt PDF and opens it to share or view. Tests swap it out.
ReceiptPdfSaver receiptPdfSaver = saveAndShareReceiptPdf;

/// Keeps [bytes] in the app's documents (Receipts folder) and opens the share
/// sheet, from which the PDF can be viewed, saved to Files, or sent.
Future<void> saveAndShareReceiptPdf(List<int> bytes, String fileName) async {
  final documents = await getApplicationDocumentsDirectory();
  final folder = Directory('${documents.path}/receipts');
  await folder.create(recursive: true);
  final file = File('${folder.path}/$fileName');
  await file.writeAsBytes(bytes, flush: true);
  await SharePlus.instance.share(
    ShareParams(
      files: [XFile(file.path, mimeType: 'application/pdf')],
      title: fileName,
    ),
  );
}

/// Downloads a receipt's PDF with [download] and hands it to [receiptPdfSaver].
Future<void> downloadReceipt(Future<List<int>> Function() download, Object? number) async {
  try {
    final bytes = await download();
    await receiptPdfSaver(bytes, receiptFileName(number));
  } catch (e) {
    showToast(errorMessage(e, "Couldn't download the receipt."), kind: ToastKind.error);
  }
}

class ReceiptStatusBadge extends StatelessWidget {
  const ReceiptStatusBadge(this.receipt, {super.key});

  final Map receipt;

  @override
  Widget build(BuildContext context) => isVoidReceipt(receipt)
      ? const SnapBadge('Void', variant: BadgeVariant.danger, icon: LucideIcons.ban)
      : const SnapBadge('Issued', variant: BadgeVariant.success);
}

/// The merchant's receipts, newest first.
class ReceiptsScreen extends StatefulWidget {
  const ReceiptsScreen({super.key});

  @override
  State<ReceiptsScreen> createState() => _ReceiptsScreenState();
}

class _ReceiptsScreenState extends State<ReceiptsScreen> {
  List<Map<String, dynamic>>? _receipts;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final receipts = await context.read<ApiClient>().fetchReceipts();
      if (mounted) setState(() => _receipts = receipts);
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e, "Couldn't load your receipts."));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    const header = PageIntro(
      title: 'Receipts',
      description: 'A receipt is issued each time your plan starts or changes.',
    );
    final receipts = _receipts;
    return PageBody(
      onRefresh: _load,
      children: [
        header,
        gap16,
        if (_error != null)
          LoadError(message: _error!, onRetry: _load)
        else if (receipts == null)
          const PageLoader(compact: true)
        else if (receipts.isEmpty)
          EmptyState(
            icon: LucideIcons.receiptText,
            title: 'No receipts yet',
            description: 'Your first receipt appears when you choose a plan.',
            action: SnapButton(
              label: 'View plans',
              variant: ButtonVariant.secondary,
              size: ButtonSize.sm,
              onPressed: () => context.go('/dashboard/subscription/plans'),
            ),
          )
        else
          for (final r in receipts) ...[
            SnapCard(
              onTap: () => context.go(receiptPath(r['_id'])),
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: isVoidReceipt(r) ? c.dangerSoft : c.primarySoft,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(LucideIcons.receiptText, size: 18, color: isVoidReceipt(r) ? c.danger : c.primary),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${r['number'] ?? ''}',
                          style: TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: c.foreground,
                          ),
                        ),
                        gap4,
                        Text(
                          '${r['planName'] ?? capitalize('${r['plan'] ?? ''}')} plan · ${formatPeriod(r)}',
                          style: snapText(size: 13, color: c.body),
                        ),
                        Text(
                          'Issued ${formatShortDate(r['issuedAt'])}',
                          style: snapText(size: 12, color: c.mutedForeground),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        formatMoney(r['total'] as num?, r['currency'] as String?),
                        style: snapText(
                          size: 14,
                          weight: FontWeight.w600,
                          color: isVoidReceipt(r) ? c.mutedForeground : c.foreground,
                          decoration: isVoidReceipt(r) ? TextDecoration.lineThrough : null,
                        ),
                      ),
                      gap4,
                      ReceiptStatusBadge(r),
                    ],
                  ),
                ],
              ),
            ),
            gap12,
          ],
      ],
    );
  }
}

/// One receipt, laid out like the PDF, with Download PDF.
class ReceiptDetailScreen extends StatefulWidget {
  const ReceiptDetailScreen({super.key, required this.receiptId});

  final String receiptId;

  @override
  State<ReceiptDetailScreen> createState() => _ReceiptDetailScreenState();
}

class _ReceiptDetailScreenState extends State<ReceiptDetailScreen> {
  Map<String, dynamic>? _receipt;
  String? _error;
  bool _downloading = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final receipt = await context.read<ApiClient>().fetchReceipt(widget.receiptId);
      if (mounted) setState(() => _receipt = receipt);
    } catch (e) {
      if (mounted) {
        setState(
          () => _error = statusOf(e) == 404
              ? 'This receipt was not found.'
              : errorMessage(e, "Couldn't load the receipt."),
        );
      }
    }
  }

  Future<void> _download() async {
    final api = context.read<ApiClient>();
    setState(() => _downloading = true);
    await downloadReceipt(() => api.downloadReceiptPdf(widget.receiptId), _receipt?['number']);
    if (mounted) setState(() => _downloading = false);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final receipt = _receipt;
    final back = Align(
      alignment: Alignment.centerLeft,
      child: TextButton.icon(
        onPressed: () => context.go('/dashboard/receipts'),
        icon: Icon(LucideIcons.arrowLeft, size: 14, color: c.link),
        label: Text(
          'All receipts',
          style: snapText(size: 14, weight: FontWeight.w500, color: c.link),
        ),
      ),
    );
    if (_error != null) {
      return PageBody(
        children: [
          back,
          LoadError(message: _error!, onRetry: _load),
        ],
      );
    }
    if (receipt == null) return PageBody(children: [back, const PageLoader(compact: true)]);
    return PageBody(
      onRefresh: _load,
      children: [
        back,
        if (isVoidReceipt(receipt)) ...[
          SnapAlert(
            variant: AlertVariant.danger,
            title: 'VOID',
            description:
                'This receipt was voided${receipt['voidedAt'] != null ? ' on ${formatLongDate(receipt['voidedAt'])}' : ''}. It is kept for your records and is no longer valid.',
          ),
          gap12,
        ],
        ReceiptDocument(receipt: receipt),
        gap16,
        SnapButton(
          label: 'Download PDF',
          icon: LucideIcons.fileDown,
          expand: true,
          loading: _downloading,
          onPressed: _download,
        ),
      ],
    );
  }
}

/// The receipt itself: seller and receipt number, billed-to, the plan line,
/// totals and the payment method. A void receipt carries a VOID stamp.
class ReceiptDocument extends StatelessWidget {
  const ReceiptDocument({super.key, required this.receipt});

  final Map<String, dynamic> receipt;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final merchant = (receipt['merchant'] as Map?) ?? const {};
    final seller = (receipt['seller'] as Map?) ?? const {};
    final currency = receipt['currency'] as String?;
    final voided = isVoidReceipt(receipt);
    final taxRate = (receipt['taxRate'] as num?) ?? 0;
    final amount = receipt['amount'] as num?;
    final label = snapText(size: 11, weight: FontWeight.w600, color: c.mutedForeground, letterSpacing: 0.8);
    final strong = snapText(size: 14, weight: FontWeight.w600, color: c.foreground);
    final normal = snapText(size: 13, color: c.body, height: 1.5);

    Widget totalRow(String name, String value, {bool bold = false}) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(child: Text(name, style: bold ? strong : normal)),
          Text(
            value,
            style: bold ? snapText(size: 16, weight: FontWeight.w700, color: c.foreground) : normal,
          ),
        ],
      ),
    );

    final document = SnapCard(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Logo(height: 40),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text('RECEIPT', style: label),
                    gap4,
                    Text(
                      '${receipt['number'] ?? ''}',
                      style: TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: c.foreground,
                      ),
                    ),
                    gap4,
                    ReceiptStatusBadge(receipt),
                  ],
                ),
              ),
            ],
          ),
          gap16,
          Divider(color: c.border),
          gap12,
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('FROM', style: label),
                    gap4,
                    Text('${seller['company'] ?? seller['name'] ?? 'SnapFit'}', style: strong),
                    for (final key in ['address', 'email', 'website'])
                      if ('${seller[key] ?? ''}'.isNotEmpty) Text('${seller[key]}', style: normal),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('BILLED TO', style: label),
                    gap4,
                    Text('${merchant['businessName'] ?? '—'}', style: strong),
                    for (final key in ['name', 'email', 'phone'])
                      if ('${merchant[key] ?? ''}'.isNotEmpty) Text('${merchant[key]}', style: normal),
                  ],
                ),
              ),
            ],
          ),
          gap16,
          DetailRow(label: 'Issued', value: formatLongDate(receipt['issuedAt'])),
          DetailRow(label: 'Reason', value: receiptReasonLabel(receipt['reason'])),
          DetailRow(label: 'Payment method', value: '${receipt['paymentMethod'] ?? 'Demo (no charge)'}'),
          gap12,
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(color: c.surface2, borderRadius: BorderRadius.circular(8)),
            child: Row(
              children: [
                Expanded(child: Text('DESCRIPTION', style: label)),
                Text('AMOUNT', style: label),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'SnapFit ${receipt['planName'] ?? capitalize('${receipt['plan'] ?? ''}')} plan',
                        style: strong,
                      ),
                      Text(formatPeriod(receipt), style: snapText(size: 12, color: c.mutedForeground)),
                      if ('${receipt['priceNote'] ?? ''}'.isNotEmpty)
                        Text(
                          '${receipt['priceNote']}',
                          style: snapText(size: 12, color: c.mutedForeground).copyWith(fontStyle: FontStyle.italic),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Text(formatMoney(amount, currency), style: strong),
              ],
            ),
          ),
          Divider(color: c.border),
          totalRow('Subtotal', formatMoney(amount, currency)),
          totalRow('Tax (${formatDecimal(taxRate)}%)', formatMoney(receipt['taxAmount'] as num?, currency)),
          Divider(color: c.border),
          totalRow('Total', formatMoney(receipt['total'] as num?, currency), bold: true),
          gap16,
          Text(
            'No payment was taken: SnapFit runs in demo mode, so the payment method is '
            '"${receipt['paymentMethod'] ?? 'Demo (no charge)'}".',
            style: snapText(size: 12, color: c.mutedForeground, height: 1.5),
          ),
        ],
      ),
    );

    if (!voided) return document;
    // A faint diagonal stamp across a voided receipt, as on the PDF.
    return Stack(
      children: [
        document,
        Positioned.fill(
          child: IgnorePointer(
            child: Center(
              child: Transform.rotate(
                angle: -0.45,
                child: ExcludeSemantics(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 4),
                    decoration: BoxDecoration(
                      border: Border.all(color: c.danger.withValues(alpha: 0.35), width: 3),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      'VOID',
                      style: snapText(
                        size: 56,
                        weight: FontWeight.w800,
                        color: c.danger.withValues(alpha: 0.35),
                        letterSpacing: 6,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
