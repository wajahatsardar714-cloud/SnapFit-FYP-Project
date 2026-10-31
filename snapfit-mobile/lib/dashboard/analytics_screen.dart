import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/format.dart';
import '../core/plans.dart';
import '../core/toast.dart';
import '../core/json.dart';
import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import '../widgets/charts.dart';
import '../widgets/ui.dart';
import 'dashboard_home_screen.dart' show monthTrend;

const _autoRefresh = Duration(seconds: 60);
const periodOptions = {'7d': '7 Days', '30d': '30 Days', '90d': '90 Days'};
const _sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
// The backend's confidence buckets, in order.
const _confidenceBuckets = ['<50%', '50-70%', '70-90%', '>90%'];
const _fitLabels = {
  'too_small': 'Too Small',
  'slightly_small': 'Slightly Small',
  'perfect': 'Perfect',
  'slightly_large': 'Slightly Large',
  'too_large': 'Too Large',
};
const _recommendationStatusVariant = {
  'success': BadgeVariant.success,
  'low_confidence': BadgeVariant.warning,
  'failed': BadgeVariant.danger,
};

int compareSizes(String a, String b) {
  final ai = _sizeOrder.indexOf(a);
  final bi = _sizeOrder.indexOf(b);
  if (ai != -1 && bi != -1) return ai - bi;
  if (ai != -1) return -1;
  if (bi != -1) return 1;
  return a.compareTo(b);
}

List<(DateTime, num)> usagePoints(List<dynamic> data) => [
  for (final d in data) (DateTime.tryParse('${d['date']}') ?? DateTime.now(), (d['count'] as num?) ?? 0),
];

class AnalyticsScreen extends StatefulWidget {
  const AnalyticsScreen({super.key});

  @override
  State<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen> {
  String _period = '30d';
  Map<String, dynamic>? _dashboard;
  List<dynamic> _usage = const [];
  List<dynamic> _sizes = const [];
  List<dynamic> _confidence = const [];
  Map<String, dynamic>? _feedback;
  List<dynamic> _recent = const [];
  bool _refreshing = false;
  bool _exporting = false;
  DateTime? _lastUpdated;
  String? _error;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _loadAll();
    _timer = Timer.periodic(_autoRefresh, (_) => _loadAll(silent: true));
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _loadAll({bool silent = false}) async {
    final api = context.read<ApiClient>();
    if (silent) setState(() => _refreshing = true);
    try {
      final r = await Future.wait([
        api.get('/analytics/dashboard'),
        api.get('/analytics/usage', query: {'period': _period}),
        api.get('/analytics/breakdown'),
        api.get('/feedback/stats'),
        api.get('/analytics/recent'),
      ]);
      if (!mounted) return;
      setState(() {
        _dashboard = r[0];
        _usage = asList(r[1]['data']);
        _sizes = asList(r[2]['sizeDistribution']);
        _confidence = asList(r[2]['confidenceDistribution']);
        _feedback = r[3];
        _recent = asList(r[4]['recommendations']);
        _lastUpdated = DateTime.now();
        _error = null;
      });
    } catch (e) {
      if (_dashboard == null && mounted) {
        setState(() => _error = errorMessage(e, 'Failed to load analytics'));
      } else {
        showToast(errorMessage(e, 'Failed to load analytics'), kind: ToastKind.error);
      }
    } finally {
      if (mounted) setState(() => _refreshing = false);
    }
  }

  Future<void> _changePeriod(String period) async {
    setState(() => _period = period);
    try {
      final res = await context.read<ApiClient>().get('/analytics/usage', query: {'period': period});
      if (mounted) setState(() => _usage = asList(res['data']));
    } catch (e) {
      showToast(errorMessage(e, 'Failed to load usage over time'), kind: ToastKind.error);
    }
  }

  Future<void> _export() async {
    setState(() => _exporting = true);
    try {
      final bytes = await context.read<ApiClient>().download('/analytics/export');
      await shareCsv(bytes, 'recommendations-${todayStamp()}.csv');
    } catch (e) {
      showToast(errorMessage(e, 'Failed to export report'), kind: ToastKind.error);
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    if (_error != null) return LoadError(message: _error!, onRetry: _loadAll);
    final dashboard = _dashboard;
    if (dashboard == null) return const PageLoader();

    final series = chartSeries(c);
    final sizes = [..._sizes]..sort((a, b) => compareSizes('${a['size']}', '${b['size']}'));
    final sizeBars = [
      for (var i = 0; i < sizes.length; i++)
        ('${sizes[i]['size']}', (sizes[i]['count'] as num?) ?? 0, series[i % series.length]),
    ];
    final confidenceBars = [
      for (var i = 0; i < _confidenceBuckets.length; i++)
        (
          _confidenceBuckets[i],
          (_confidence.cast<Map?>().firstWhere(
                    (b) => b?['range'] == _confidenceBuckets[i],
                    orElse: () => null,
                  )?['count']
                  as num?) ??
              0,
          series[i % series.length],
        ),
    ];
    final fitColors = {
      'too_small': c.danger,
      'slightly_small': c.warning,
      'perfect': c.success,
      'slightly_large': c.warning,
      'too_large': c.danger,
    };
    final feedback = _feedback;
    final totalFeedback = (feedback?['totalFeedback'] as num?) ?? 0;
    final feedbackBars = [
      for (final b in asList(feedback?['breakdown']))
        (
          _fitLabels[b['fitResult']] ?? '${b['fitResult']}',
          (b['count'] as num?) ?? 0,
          fitColors[b['fitResult']] ?? c.muted,
        ),
    ];
    final trend = monthTrend(
      (dashboard['recommendationsThisMonth'] as num?) ?? 0,
      (dashboard['recommendationsLastMonth'] as num?) ?? 0,
    );
    final usage = (dashboard['usage'] as Map?) ?? const {};

    return AnimatedOpacity(
      opacity: _refreshing ? 0.7 : 1,
      duration: const Duration(milliseconds: 150),
      child: PageBody(
        onRefresh: _loadAll,
        children: [
          PageIntro(
            title: 'Analytics',
            description: _lastUpdated == null ? null : 'Updated ${DateFormat.jms().format(_lastUpdated!)}',
            actions: [
              SnapButton(
                label: 'Refresh',
                icon: LucideIcons.refreshCw,
                variant: ButtonVariant.secondary,
                size: ButtonSize.sm,
                loading: _refreshing,
                onPressed: () => _loadAll(silent: true),
              ),
            ],
          ),
          gap16,
          StatGrid(
            children: [
              StatCard(
                label: 'Total Recommendations',
                value: formatNumber(dashboard['totalRecommendations'] as num?),
                sub: 'All time',
                badge: trend == null
                    ? null
                    : SnapBadge(
                        '${trend.up ? '↑' : '↓'} ${formatDecimal(trend.pct)}%',
                        variant: trend.up ? BadgeVariant.success : BadgeVariant.danger,
                      ),
              ),
              StatCard(label: 'Success Rate', value: '${dashboard['successRate'] ?? 0}%', sub: 'Of all attempts'),
              StatCard(
                label: 'Average Confidence',
                value: formatPercent(dashboard['averageConfidence'] as num?),
                sub: 'Across successful recommendations',
              ),
              StatCard(
                label: 'API Requests',
                value: '${usage['requestsUsed'] ?? 0} / ${usage['requestsLimit'] ?? '∞'}',
                sub: 'Used this billing cycle',
              ),
            ],
          ),
          gap16,
          ChartCard(
            title: 'Recommendations Over Time',
            action: Segmented<String>(value: _period, options: periodOptions, onChanged: _changePeriod),
            isEmpty: _usage.every((u) => (u['count'] ?? 0) == 0),
            emptyLabel: 'No recommendations in this period',
            child: DailyAreaChart(points: usagePoints(_usage)),
          ),
          gap16,
          ChartCard(
            title: 'Average Confidence',
            child: ConfidenceGauge(
              confidence: dashboard['averageConfidence'] as num?,
              valueColor: confidenceColor(context, dashboard['averageConfidence'] as num?),
            ),
          ),
          gap16,
          ChartCard(
            title: 'Size Distribution',
            isEmpty: sizeBars.isEmpty,
            emptyLabel: 'No sized recommendations yet',
            child: CategoryBarChart(bars: sizeBars),
          ),
          gap16,
          ChartCard(
            title: 'Confidence Buckets',
            isEmpty: confidenceBars.every((b) => b.$2 == 0),
            emptyLabel: 'No confidence data yet',
            child: CategoryBarChart(bars: confidenceBars),
          ),
          gap16,
          ChartCard(
            title: 'Feedback Accuracy',
            isEmpty: totalFeedback == 0,
            emptyLabel: 'No feedback submitted yet',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text.rich(
                  TextSpan(
                    style: snapText(size: 12, color: c.mutedForeground),
                    children: [
                      TextSpan(
                        text: '${feedback?['accuracyRate'] ?? 0}%',
                        style: snapText(size: 12, weight: FontWeight.w600, color: c.foreground),
                      ),
                      const TextSpan(text: ' of customers report an acceptable fit'),
                    ],
                  ),
                ),
                gap8,
                CategoryBarChart(bars: feedbackBars, height: 200),
              ],
            ),
          ),
          gap16,
          ChartCard(
            title: 'Recent Recommendations',
            action: SnapButton(
              label: 'Export CSV',
              icon: LucideIcons.download,
              variant: ButtonVariant.secondary,
              size: ButtonSize.sm,
              loading: _exporting,
              onPressed: _export,
            ),
            isEmpty: _recent.isEmpty,
            emptyLabel: 'No recommendations yet',
            child: Column(
              children: [
                for (final r in _recent)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Row(
                      children: [
                        SizedBox(
                          width: 44,
                          child: Text(
                            '${r['recommendedSize'] ?? '—'}',
                            style: snapText(size: 14, weight: FontWeight.w500, color: c.foreground),
                          ),
                        ),
                        SizedBox(
                          width: 52,
                          child: Text(
                            formatPercent(r['confidence'] as num?),
                            style: snapText(
                              size: 14,
                              weight: FontWeight.w500,
                              color: confidenceColor(context, r['confidence'] as num?),
                            ),
                          ),
                        ),
                        SnapBadge(
                          '${r['status'] ?? ''}'.replaceAll('_', ' '),
                          variant: _recommendationStatusVariant[r['status']] ?? BadgeVariant.neutral,
                        ),
                        const Spacer(),
                        Text(formatDateTime(r['createdAt']), style: snapText(size: 12, color: c.mutedForeground)),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
