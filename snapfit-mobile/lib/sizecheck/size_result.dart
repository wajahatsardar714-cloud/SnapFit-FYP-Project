import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../core/json.dart';
import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import '../widgets/ui.dart';

const _measurementLabels = {
  'shoulderWidth': 'Shoulders',
  'chest': 'Chest',
  'waist': 'Waist',
  'hip': 'Hips',
  'torsoLength': 'Torso length',
  'inseam': 'Inseam',
};

/// Confidence colour: green above 70%, amber from 50%, red below.
Color resultConfidenceColor(SnapColors c, num confidence) {
  final pct = confidence * 100;
  if (pct > 70) return c.success;
  if (pct >= 50) return c.warning;
  return c.danger;
}

String _range(Map? entry) => entry == null ? '—' : '${(entry['min'] as num).round()}–${(entry['max'] as num).round()}';

/// The size recommendation (the web's SizeResult): warnings, the size,
/// confidence bar, measurements against the recommended and neighbouring
/// sizes, fit notes and photo tips.
class SizeResultView extends StatelessWidget {
  const SizeResultView({super.key, required this.result});

  final Map<String, dynamic> result;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final confidence = (result['confidence'] as num?) ?? 0;
    final pct = (confidence * 100).round();
    final fitNotes = asList(result['fitNotes']).isNotEmpty
        ? asList(result['fitNotes'])
        : ('${result['notes'] ?? ''}'.isEmpty ? const [] : [result['notes']]);
    final warnings = asList(result['warnings']);
    final tips = asList(result['photoTips']);
    final framesUsed = (result['framesUsed'] as num?) ?? 1;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (warnings.isNotEmpty) ...[
          Semantics(
            label: 'Warnings',
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: c.warningSoft,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: c.warning.withValues(alpha: 0.3)),
              ),
              child: Column(
                children: [
                  for (final w in warnings)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 2),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Icon(LucideIcons.triangleAlert, size: 16, color: c.warning),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text('${w['message']}', style: snapText(size: 14, color: c.foreground)),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
          gap16,
        ],
        Center(
          child: Container(
            width: 80,
            height: 80,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: c.primary, shape: BoxShape.circle),
            child: Text(
              '${result['size']}',
              style: snapText(size: 24, weight: FontWeight.w700, color: c.primaryForeground),
            ),
          ),
        ),
        if (result['alternativeSize'] != null) ...[
          gap8,
          Text.rich(
            TextSpan(
              style: snapText(size: 12, color: c.mutedForeground),
              children: [
                const TextSpan(text: 'Also consider '),
                TextSpan(
                  text: '${result['alternativeSize']}',
                  style: snapText(size: 12, weight: FontWeight.w600, color: c.foreground),
                ),
              ],
            ),
            textAlign: TextAlign.center,
          ),
        ],
        gap16,
        Row(
          children: [
            Text('Confidence', style: snapText(size: 12, color: c.mutedForeground)),
            const Spacer(),
            Text('$pct%', style: snapText(size: 12, color: resultConfidenceColor(c, confidence))),
          ],
        ),
        gap4,
        ProgressBar(percent: pct, color: resultConfidenceColor(c, confidence)),
        if (framesUsed > 1) ...[
          gap4,
          Text('Measured from $framesUsed camera frames', style: snapText(size: 12, color: c.mutedForeground)),
        ],
        if (result['bodyType'] != null && '${result['bodyType']}'.isNotEmpty) ...[
          gap12,
          Text(
            'BODY TYPE: ${'${result['bodyType']}'.toUpperCase()}',
            textAlign: TextAlign.center,
            style: snapText(size: 12, color: c.mutedForeground, letterSpacing: 0.6),
          ),
        ],
        _ComparisonTable(result: result),
        if (fitNotes.isNotEmpty) ...[
          gap12,
          for (final note in fitNotes)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text('$note', style: snapText(size: 14, color: c.mutedForeground, height: 1.5)),
            ),
        ],
        if (tips.isNotEmpty) ...[
          gap16,
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(color: c.surface2, borderRadius: BorderRadius.circular(8)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(LucideIcons.lightbulb, size: 14, color: c.mutedForeground),
                    const SizedBox(width: 6),
                    Text(
                      'Tips for a better photo',
                      style: snapText(size: 12, weight: FontWeight.w600, color: c.foreground),
                    ),
                  ],
                ),
                gap4,
                for (final tip in tips)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      '•  ${tip['message']}',
                      style: snapText(size: 12, color: c.mutedForeground, height: 1.45),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

/// The shopper's measurements against the recommended size and its
/// neighbours in chart order; the matching ranges are highlighted.
class _ComparisonTable extends StatelessWidget {
  const _ComparisonTable({required this.result});

  final Map<String, dynamic> result;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final comparison = asList(result['sizeComparison']);
    final index = comparison.indexWhere((s) => s['label'] == result['size']);
    if (index == -1) return const SizedBox.shrink();
    final columns = comparison.sublist(index > 0 ? index - 1 : 0, (index + 2).clamp(0, comparison.length));
    final recommended = columns.firstWhere((s) => s['label'] == result['size']);
    final rows = asList(recommended['perMeasurement']);
    if (rows.isEmpty) return const SizedBox.shrink();
    final measurements = (result['measurements'] as Map?) ?? const {};
    final hasEstimates = rows.any((r) => measurements[r['name']]?['estimated'] == true);
    final small = snapText(size: 12, color: c.mutedForeground);

    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            label: 'Your measurements compared with the size chart',
            child: Table(
              columnWidths: const {0: FlexColumnWidth(1.6), 1: FlexColumnWidth(0.9)},
              defaultVerticalAlignment: TableCellVerticalAlignment.middle,
              children: [
                TableRow(
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Text('cm', style: small),
                    ),
                    Text('You', textAlign: TextAlign.right, style: small),
                    for (final size in columns)
                      Text(
                        '${size['label']}',
                        textAlign: TextAlign.center,
                        style: snapText(
                          size: 12,
                          weight: FontWeight.w500,
                          color: size['label'] == result['size'] ? c.foreground : c.mutedForeground,
                        ),
                      ),
                  ],
                ),
                for (final row in rows)
                  TableRow(
                    decoration: BoxDecoration(
                      border: Border(top: BorderSide(color: c.border)),
                    ),
                    children: [
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 7),
                        child: Text(_measurementLabels[row['name']] ?? '${row['name']}', style: small),
                      ),
                      Text.rich(
                        TextSpan(
                          children: [
                            if (measurements[row['name']]?['estimated'] == true) TextSpan(text: '≈ ', style: small),
                            TextSpan(
                              text: '${(row['userValue'] as num).round()}',
                              style: snapText(size: 12, weight: FontWeight.w500, color: c.foreground),
                            ),
                          ],
                        ),
                        textAlign: TextAlign.right,
                      ),
                      for (final size in columns)
                        Builder(
                          builder: (context) {
                            final entry = asList(size['perMeasurement'])
                                .cast<Map?>()
                                .firstWhere((m) => m?['name'] == row['name'], orElse: () => null);
                            final within = entry?['status'] == 'within';
                            return Container(
                              margin: const EdgeInsets.symmetric(horizontal: 2, vertical: 3),
                              padding: const EdgeInsets.symmetric(vertical: 3),
                              decoration: within
                                  ? BoxDecoration(color: c.successSoft, borderRadius: BorderRadius.circular(4))
                                  : null,
                              child: Text(
                                _range(entry),
                                textAlign: TextAlign.center,
                                style: snapText(
                                  size: 12,
                                  weight: within ? FontWeight.w600 : FontWeight.w400,
                                  color: entry == null ? c.muted : (within ? c.success : c.mutedForeground),
                                ),
                              ),
                            );
                          },
                        ),
                    ],
                  ),
              ],
            ),
          ),
          if (hasEstimates) ...[
            gap4,
            Text(
              "≈ estimated from your photo — circumferences can't be measured directly.",
              style: snapText(size: 11, color: c.mutedForeground),
            ),
          ],
        ],
      ),
    );
  }
}

/// The try-on image: a data: URL from the GPU service, or a web address.
ImageProvider? tryOnImage(Object? image) {
  final value = '${image ?? ''}';
  if (value.startsWith('data:')) {
    final comma = value.indexOf(',');
    if (comma == -1) return null;
    return MemoryImage(Uint8List.fromList(base64Decode(value.substring(comma + 1))));
  }
  if (value.startsWith('http')) return NetworkImage(value);
  return null;
}

/// "See it on you": the shopper's photo with the product, with an
/// Original / Try-on toggle. Nothing unless the product is try-on ready.
class TryOnPreview extends StatefulWidget {
  const TryOnPreview({super.key, required this.tryOn, required this.originalPath, required this.size});

  final Map<String, dynamic>? tryOn;
  final String? originalPath;
  final String size;

  @override
  State<TryOnPreview> createState() => _TryOnPreviewState();
}

class _TryOnPreviewState extends State<TryOnPreview> {
  bool _showTryOn = true;
  late ImageProvider? _image = tryOnImage(widget.tryOn?['image']);

  @override
  void didUpdateWidget(TryOnPreview old) {
    super.didUpdateWidget(old);
    if (old.tryOn != widget.tryOn) _image = tryOnImage(widget.tryOn?['image']);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final tryOn = widget.tryOn;
    if (tryOn?['status'] == 'failed') {
      return Text(
        "We couldn't create a preview on your photo this time. ${tryOn?['message'] ?? ''}",
        style: snapText(size: 12, color: c.mutedForeground),
      );
    }
    if (tryOn?['status'] != 'success' || _image == null) return const SizedBox.shrink();
    final original = widget.originalPath;
    final showTryOn = _showTryOn || original == null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'See it on you',
                style: snapText(size: 14, weight: FontWeight.w600, color: c.foreground),
              ),
            ),
            if (original != null)
              Segmented<bool>(
                value: showTryOn,
                options: const {false: 'Original', true: 'Try-on'},
                onChanged: (v) => setState(() => _showTryOn = v),
              ),
          ],
        ),
        gap8,
        ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.6),
          child: Stack(
            children: [
              Center(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image(
                    image: showTryOn ? _image! : FileImage(File(original)),
                    fit: BoxFit.contain,
                    semanticLabel: showTryOn ? 'You wearing size ${widget.size}' : 'Your photo',
                  ),
                ),
              ),
              if (showTryOn)
                Positioned(
                  left: 8,
                  top: 8,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: c.primary.withValues(alpha: 0.8),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      'Size ${widget.size}',
                      style: snapText(size: 12, weight: FontWeight.w600, color: c.primaryForeground),
                    ),
                  ),
                ),
            ],
          ),
        ),
        gap8,
        Text(
          'Preview is approximate and does not reflect fabric drape or exact fit.',
          style: snapText(size: 11, color: c.mutedForeground),
        ),
      ],
    );
  }
}
