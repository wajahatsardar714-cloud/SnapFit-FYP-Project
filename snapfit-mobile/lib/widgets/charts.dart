import 'dart:io';
import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import 'ui.dart';

/// Series colours, like the web's chart theme: the primary blue, lighter
/// tints of it, then the neutral greys -- no extra hues.
List<Color> chartSeries(SnapColors c) => [
  c.primary,
  c.primary.withValues(alpha: 0.75),
  c.primary.withValues(alpha: 0.55),
  c.primary.withValues(alpha: 0.35),
  c.mutedForeground,
  c.muted,
];

/// A card holding one chart, with an optional action and an empty state.
class ChartCard extends StatelessWidget {
  const ChartCard({
    super.key,
    required this.title,
    this.action,
    this.isEmpty = false,
    this.emptyLabel = '',
    required this.child,
  });

  final String title;
  final Widget? action;
  final bool isEmpty;
  final String emptyLabel;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SnapCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 8,
            runSpacing: 8,
            children: [
              Text(
                title,
                style: snapText(size: 14, weight: FontWeight.w500, color: c.foreground),
              ),
              ?action,
            ],
          ),
          if (isEmpty)
            SizedBox(
              height: 200,
              child: Center(
                child: Text(emptyLabel, style: snapText(size: 14, color: c.mutedForeground)),
              ),
            )
          else ...[
            gap12,
            child,
          ],
        ],
      ),
    );
  }
}

Widget _axisLabel(BuildContext context, String text, TitleMeta meta) => SideTitleWidget(
  meta: meta,
  space: 6,
  child: Text(text, style: snapText(size: 11, color: context.colors.mutedForeground)),
);

FlTitlesData _titles(
  BuildContext context, {
  required Widget Function(double, TitleMeta) bottom,
  double bottomSize = 26,
}) {
  return FlTitlesData(
    topTitles: const AxisTitles(),
    rightTitles: const AxisTitles(),
    leftTitles: AxisTitles(
      sideTitles: SideTitles(
        showTitles: true,
        reservedSize: 30,
        getTitlesWidget: (value, meta) =>
            value % 1 == 0 ? _axisLabel(context, value.toInt().toString(), meta) : const SizedBox.shrink(),
      ),
    ),
    bottomTitles: AxisTitles(
      sideTitles: SideTitles(showTitles: true, reservedSize: bottomSize, getTitlesWidget: bottom),
    ),
  );
}

FlGridData _grid(SnapColors c) =>
    FlGridData(drawVerticalLine: false, getDrawingHorizontalLine: (_) => FlLine(color: c.border, strokeWidth: 1));

double _niceMax(num max) => max <= 0 ? 4 : (max * 1.2).ceilToDouble();

/// Counts per day as a filled line (recommendations over time).
class DailyAreaChart extends StatelessWidget {
  const DailyAreaChart({super.key, required this.points, this.color, this.unit = 'recommendation', this.height = 240});

  final List<(DateTime date, num count)> points;
  final Color? color;
  final String unit;
  final double height;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final line = color ?? c.primary;
    final maxY = _niceMax(points.fold<num>(0, (m, p) => math.max(m, p.$2)));
    final step = math.max(1, (points.length / 5).ceil());
    return SizedBox(
      height: height,
      child: LineChart(
        LineChartData(
          minY: 0,
          maxY: maxY,
          gridData: _grid(c),
          borderData: FlBorderData(show: false),
          titlesData: _titles(
            context,
            bottom: (value, meta) {
              final i = value.toInt();
              if (i < 0 || i >= points.length || i % step != 0) return const SizedBox.shrink();
              return _axisLabel(context, DateFormat('MMM d').format(points[i].$1), meta);
            },
          ),
          lineTouchData: LineTouchData(
            touchTooltipData: LineTouchTooltipData(
              getTooltipColor: (_) => c.surface,
              tooltipBorder: BorderSide(color: c.border),
              getTooltipItems: (spots) => [
                for (final s in spots)
                  LineTooltipItem(
                    '${DateFormat('EEE, MMM d').format(points[s.x.toInt()].$1)}\n',
                    snapText(size: 11, color: c.mutedForeground),
                    children: [
                      TextSpan(
                        text: '${s.y.toInt()} $unit${s.y == 1 ? '' : 's'}',
                        style: snapText(size: 13, weight: FontWeight.w600, color: c.foreground),
                      ),
                    ],
                  ),
              ],
            ),
          ),
          lineBarsData: [
            LineChartBarData(
              spots: [for (var i = 0; i < points.length; i++) FlSpot(i.toDouble(), points[i].$2.toDouble())],
              isCurved: true,
              preventCurveOverShooting: true,
              color: line,
              barWidth: 2,
              dotData: FlDotData(
                show: points.length <= 31,
                getDotPainter: (spot, percent, bar, index) =>
                    FlDotCirclePainter(radius: 3, color: line, strokeWidth: 2, strokeColor: c.background),
              ),
              belowBarData: BarAreaData(show: true, color: line.withValues(alpha: 0.08)),
            ),
          ],
        ),
      ),
    );
  }
}

/// One bar per category, each with its own colour.
class CategoryBarChart extends StatelessWidget {
  const CategoryBarChart({super.key, required this.bars, this.height = 220, this.unit = 'recommendation'});

  final List<(String label, num value, Color color)> bars;
  final double height;
  final String unit;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final maxY = _niceMax(bars.fold<num>(0, (m, b) => math.max(m, b.$2)));
    return SizedBox(
      height: height,
      child: BarChart(
        BarChartData(
          minY: 0,
          maxY: maxY,
          gridData: _grid(c),
          borderData: FlBorderData(show: false),
          titlesData: _titles(
            context,
            bottomSize: 34,
            bottom: (value, meta) {
              final i = value.toInt();
              if (i < 0 || i >= bars.length) return const SizedBox.shrink();
              return _axisLabel(context, bars[i].$1, meta);
            },
          ),
          barTouchData: BarTouchData(
            touchTooltipData: BarTouchTooltipData(
              getTooltipColor: (_) => c.surface,
              tooltipBorder: BorderSide(color: c.border),
              getTooltipItem: (group, groupIndex, rod, rodIndex) => BarTooltipItem(
                '${bars[groupIndex].$1}\n',
                snapText(size: 11, color: c.mutedForeground),
                children: [
                  TextSpan(
                    text: '${rod.toY.toInt()} $unit${rod.toY == 1 ? '' : 's'}',
                    style: snapText(size: 13, weight: FontWeight.w600, color: c.foreground),
                  ),
                ],
              ),
            ),
          ),
          barGroups: [
            for (var i = 0; i < bars.length; i++)
              BarChartGroupData(
                x: i,
                barRods: [
                  BarChartRodData(
                    toY: bars[i].$2.toDouble(),
                    color: bars[i].$3,
                    width: 28,
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(2)),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

/// A half-donut gauge: red/amber/green zones and a marker at the average
/// confidence, with the percentage underneath.
class ConfidenceGauge extends StatelessWidget {
  const ConfidenceGauge({super.key, required this.confidence, required this.valueColor});

  final num? confidence;
  final Color valueColor;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final pct = confidence == null ? null : (confidence! * 100).round();
    Widget legend(Color color, String label) => Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 4),
        Text(label, style: snapText(size: 12, color: c.mutedForeground)),
      ],
    );
    return Column(
      children: [
        SizedBox(
          width: 240,
          height: 130,
          child: CustomPaint(
            painter: _GaugePainter(c, pct),
            child: Align(
              alignment: Alignment.bottomCenter,
              child: Text(
                pct == null ? '—' : '$pct%',
                style: snapText(size: 24, weight: FontWeight.w600, color: valueColor),
              ),
            ),
          ),
        ),
        gap8,
        Wrap(
          spacing: 16,
          children: [legend(c.danger, '0-50%'), legend(c.warning, '50-75%'), legend(c.success, '75-100%')],
        ),
      ],
    );
  }
}

class _GaugePainter extends CustomPainter {
  _GaugePainter(this.c, this.pct);

  final SnapColors c;
  final int? pct;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height);
    final outer = math.min(size.width / 2, size.height) * 0.9;
    final thickness = outer * 0.33;
    final rect = Rect.fromCircle(center: center, radius: outer - thickness / 2);
    final zones = [(0.0, 0.5, c.danger), (0.5, 0.75, c.warning), (0.75, 1.0, c.success)];
    for (final (from, to, color) in zones) {
      canvas.drawArc(
        rect,
        math.pi + math.pi * from,
        math.pi * (to - from),
        false,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = thickness,
      );
    }
    if (pct != null) {
      final angle = math.pi + math.pi * (pct!.clamp(0, 100) / 100);
      final inner = outer - thickness * 1.2;
      final outerEnd = outer + thickness * 0.15;
      canvas.drawLine(
        center + Offset(math.cos(angle), math.sin(angle)) * inner,
        center + Offset(math.cos(angle), math.sin(angle)) * outerEnd,
        Paint()
          ..color = c.foreground
          ..strokeWidth = 4
          ..strokeCap = StrokeCap.round,
      );
    }
  }

  @override
  bool shouldRepaint(_GaugePainter old) => old.pct != pct || old.c != c;
}

/// Saves [bytes] as a CSV in the app's temporary folder and opens the share
/// sheet (save to Files, email, Drive...), the phone's take on a download.
Future<void> shareCsv(List<int> bytes, String fileName) async {
  final dir = await getTemporaryDirectory();
  final file = File('${dir.path}/$fileName');
  await file.writeAsBytes(bytes, flush: true);
  await SharePlus.instance.share(
    ShareParams(
      files: [XFile(file.path, mimeType: 'text/csv')],
      title: fileName,
    ),
  );
}

String todayStamp() => DateFormat('yyyy-MM-dd').format(DateTime.now());

/// Requests per day as overlaid lines: total (filled), successes and failures.
class DailyRequestsChart extends StatelessWidget {
  const DailyRequestsChart({super.key, required this.daily, this.height = 240});

  /// [{ date, total, success, failed }]
  final List<dynamic> daily;
  final double height;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    if (daily.every((d) => ((d['total'] as num?) ?? 0) == 0)) {
      return SizedBox(
        height: height,
        child: Center(
          child: Text('No requests in this period', style: snapText(size: 14, color: c.mutedForeground)),
        ),
      );
    }
    final series = [('total', 'Total', c.admin), ('success', 'Success', c.success), ('failed', 'Failed', c.danger)];
    final dates = [for (final d in daily) DateTime.tryParse('${d['date']}') ?? DateTime.now()];
    final maxY = _niceMax(daily.fold<num>(0, (m, d) => math.max(m, (d['total'] as num?) ?? 0)));
    final step = math.max(1, (daily.length / 5).ceil());
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 16,
          children: [
            for (final (_, label, color) in series)
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                  ),
                  const SizedBox(width: 6),
                  Text(label, style: snapText(size: 12, color: c.mutedForeground)),
                ],
              ),
          ],
        ),
        gap8,
        SizedBox(
          height: height,
          child: LineChart(
            LineChartData(
              minY: 0,
              maxY: maxY,
              gridData: _grid(c),
              borderData: FlBorderData(show: false),
              titlesData: _titles(
                context,
                bottom: (value, meta) {
                  final i = value.toInt();
                  if (i < 0 || i >= dates.length || i % step != 0) return const SizedBox.shrink();
                  return _axisLabel(context, DateFormat('MMM d').format(dates[i]), meta);
                },
              ),
              lineTouchData: LineTouchData(
                touchTooltipData: LineTouchTooltipData(
                  getTooltipColor: (_) => c.surface,
                  tooltipBorder: BorderSide(color: c.border),
                  getTooltipItems: (spots) => [
                    for (final s in spots)
                      LineTooltipItem(
                        '${series[s.barIndex].$2}: ${s.y.toInt()}',
                        snapText(size: 12, weight: FontWeight.w600, color: series[s.barIndex].$3),
                      ),
                  ],
                ),
              ),
              lineBarsData: [
                for (final (key, _, color) in series)
                  LineChartBarData(
                    spots: [
                      for (var i = 0; i < daily.length; i++)
                        FlSpot(i.toDouble(), ((daily[i][key] as num?) ?? 0).toDouble()),
                    ],
                    isCurved: true,
                    preventCurveOverShooting: true,
                    color: color,
                    barWidth: 2,
                    dotData: const FlDotData(show: false),
                    belowBarData: BarAreaData(show: key == 'total', color: color.withValues(alpha: 0.08)),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// A labelled share of a total with a bar (status breakdown, plans, top
/// merchants).
class ShareBar extends StatelessWidget {
  const ShareBar({
    super.key,
    required this.label,
    required this.count,
    required this.total,
    required this.color,
    this.onTap,
  });

  final String label;
  final num count;
  final num total;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final pct = total == 0 ? 0 : (count / total * 100).round();
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: GestureDetector(
                  onTap: onTap,
                  child: Text(
                    label,
                    overflow: TextOverflow.ellipsis,
                    style: snapText(
                      size: 14,
                      weight: onTap == null ? FontWeight.w400 : FontWeight.w500,
                      color: onTap == null ? c.foreground : c.link,
                    ),
                  ),
                ),
              ),
              Text.rich(
                TextSpan(
                  style: snapText(size: 14, color: c.mutedForeground),
                  children: [
                    TextSpan(
                      text: NumberFormat.decimalPattern('en_US').format(count),
                      style: snapText(size: 14, weight: FontWeight.w600, color: c.foreground),
                    ),
                    TextSpan(text: ' · $pct%'),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ProgressBar(percent: pct, color: color),
        ],
      ),
    );
  }
}
