import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/auth_state.dart';
import '../core/format.dart';
import '../core/plans.dart';
import '../core/json.dart';
import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import '../widgets/ui.dart';

/// Month-over-month change; null when there is no comparison base.
({double pct, bool up})? monthTrend(num current, num previous) {
  if (previous == 0) return current > 0 ? (pct: 100, up: true) : null;
  final pct = ((current - previous) / previous * 1000).round() / 10;
  return (pct: pct.abs(), up: pct >= 0);
}

class DashboardHomeScreen extends StatefulWidget {
  const DashboardHomeScreen({super.key});

  @override
  State<DashboardHomeScreen> createState() => _DashboardHomeScreenState();
}

class _DashboardHomeScreenState extends State<DashboardHomeScreen> {
  Map<String, dynamic>? _dashboard;
  int _requestsToday = 0;
  List<dynamic> _recent = const [];
  bool _hasChart = false;
  bool _hasMapping = false;
  bool _hasApiKey = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = context.read<ApiClient>();
    setState(() => _error = null);
    try {
      final results = await Future.wait([
        api.get('/analytics/dashboard'),
        api.get('/analytics/usage', query: {'period': '7d'}),
        api.get('/analytics/recent'),
        api.get('/charts', query: {'limit': 1}),
        api.get('/products/mappings'),
        api
            .get('/merchant/api-key')
            .catchError((Object e) => statusOf(e) == 404 ? <String, dynamic>{'apiKey': null} : throw e),
      ]);
      if (!mounted) return;
      final usage = asList(results[1]['data']);
      setState(() {
        _dashboard = results[0];
        _requestsToday = usage.isEmpty ? 0 : (usage.last['count'] as num? ?? 0).toInt();
        _recent = asList(results[2]['recommendations']).take(5).toList();
        _hasChart = ((results[3]['pagination'] as Map?)?['total'] as num? ?? 0) > 0;
        _hasMapping = asList(results[4]['mappings']).isNotEmpty;
        _hasApiKey = results[5]['apiKey'] != null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e, 'Failed to load dashboard'));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    if (_error != null) return LoadError(message: _error!, onRetry: _load);
    final dashboard = _dashboard;
    if (dashboard == null) return const PageLoader();

    final merchant = context.watch<AuthState>().merchant ?? const {};
    final subscription = (merchant['subscription'] as Map?) ?? const {};
    final usage = (dashboard['usage'] as Map?) ?? const {};
    final used = (usage['requestsUsed'] as num?) ?? 0;
    final limit = usage['requestsLimit'] as num?;
    final pct = limit == null || limit == 0 ? 0 : (used / limit * 100).round().clamp(0, 100);
    final nearLimit = limit != null && pct > 80;
    final trend = monthTrend(
      (dashboard['recommendationsThisMonth'] as num?) ?? 0,
      (dashboard['recommendationsLastMonth'] as num?) ?? 0,
    );
    final checklist = [
      ('Create your first size chart', _hasChart, '/dashboard/size-charts/new'),
      ('Map a product to a size chart', _hasMapping, '/dashboard/product-mapping'),
      ('Get your API key', _hasApiKey, '/dashboard/api-key'),
      ('Make your first API call', ((dashboard['totalRecommendations'] as num?) ?? 0) > 0, '/dashboard/api-key'),
    ];

    return PageBody(
      onRefresh: _load,
      children: [
        PageIntro(
          title: 'Welcome back, ${merchant['businessName'] ?? ''}',
          description: "Here's what's happening with your SnapFit integration.",
        ),
        gap16,
        StatGrid(
          children: [
            StatCard(label: 'Requests Today', value: formatNumber(_requestsToday), sub: 'Recommendations served'),
            StatCard(
              label: 'This Month',
              value: formatNumber(dashboard['recommendationsThisMonth'] as num?),
              sub: 'vs last month',
              badge: trend == null
                  ? null
                  : SnapBadge(
                      '${trend.up ? '↑' : '↓'} ${formatDecimal(trend.pct)}%',
                      variant: trend.up ? BadgeVariant.success : BadgeVariant.danger,
                    ),
            ),
            StatCard(
              label: 'Active Plan',
              value: formatPlanName(subscription['plan'] as String?),
              sub: '${subscription['status'] ?? ''}',
            ),
            StatCard(
              label: 'Confidence Avg',
              value: formatPercent(dashboard['averageConfidence'] as num?),
              sub: 'Across successful recommendations',
            ),
          ],
        ),
        gap24,
        Text(
          'Quick actions',
          style: snapText(size: 14, weight: FontWeight.w600, color: c.foreground),
        ),
        gap12,
        const _QuickAction(
          to: '/dashboard/size-charts',
          icon: LucideIcons.package,
          label: 'Manage Size Charts',
          description: 'Create and edit the charts used for fit matching',
        ),
        gap12,
        const _QuickAction(
          to: '/dashboard/api-key',
          icon: LucideIcons.keyRound,
          label: 'View API Key',
          description: 'Copy or regenerate your live API key',
        ),
        gap12,
        const _QuickAction(
          to: '/dashboard/analytics',
          icon: LucideIcons.chartColumn,
          label: 'View Analytics',
          description: 'Track usage, accuracy, and size trends',
        ),
        gap12,
        const _QuickAction(
          to: '/dashboard/docs',
          icon: LucideIcons.bookOpen,
          label: 'Integration Docs',
          description: 'Full API reference, code samples, and a live tester',
        ),
        gap24,
        SnapCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Text(
                    'Plan Usage',
                    style: snapText(size: 14, weight: FontWeight.w600, color: c.foreground),
                  ),
                  const Spacer(),
                  SnapBadge(
                    '${subscription['status'] ?? ''}',
                    variant: badgeVariantFrom(subscriptionStatusVariant(subscription['status'] as String?)),
                  ),
                ],
              ),
              gap12,
              Row(
                children: [
                  Text('$used / ${formatLimit(limit)} requests', style: snapText(size: 12, color: c.mutedForeground)),
                  const Spacer(),
                  if (limit != null) Text('$pct%', style: snapText(size: 12, color: c.mutedForeground)),
                ],
              ),
              if (limit != null) ...[gap8, ProgressBar(percent: pct)],
              if (nearLimit) ...[
                gap12,
                SnapButton(
                  label: "You're nearing your plan limit — Upgrade",
                  variant: ButtonVariant.secondary,
                  size: ButtonSize.sm,
                  expand: true,
                  onPressed: () => context.go(planSelectionPath),
                ),
              ],
            ],
          ),
        ),
        gap16,
        SnapCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Getting Started',
                style: snapText(size: 14, weight: FontWeight.w600, color: c.foreground),
              ),
              if (checklist.every((item) => item.$2))
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text("You're all set up.", style: snapText(size: 12, color: c.mutedForeground)),
                )
              else ...[
                gap8,
                for (final (label, done, to) in checklist)
                  InkWell(
                    borderRadius: BorderRadius.circular(8),
                    onTap: () => context.go(to),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 4),
                      child: Row(
                        children: [
                          Icon(
                            done ? LucideIcons.circleCheck : LucideIcons.circle,
                            size: 18,
                            color: done ? c.success : c.muted,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              label,
                              style: snapText(
                                size: 14,
                                color: done ? c.mutedForeground : c.foreground,
                                decoration: done ? TextDecoration.lineThrough : null,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ],
          ),
        ),
        gap16,
        SectionCard(
          title: 'Recent Activity',
          child: _recent.isEmpty
              ? Padding(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  child: Text(
                    'No recommendations yet.',
                    textAlign: TextAlign.center,
                    style: snapText(size: 14, color: c.mutedForeground),
                  ),
                )
              : Column(children: [for (final r in _recent) RecommendationRow(r as Map)]),
        ),
      ],
    );
  }
}

/// One recommendation: product id and time, size badge and confidence.
class RecommendationRow extends StatelessWidget {
  const RecommendationRow(this.r, {super.key});

  final Map r;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final confidence = r['confidence'] as num?;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${r['productId'] ?? ''}',
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontFamily: 'monospace', fontSize: 12, color: c.foreground),
                ),
                const SizedBox(height: 2),
                Text(formatDateTime(r['createdAt']), style: snapText(size: 12, color: c.mutedForeground)),
              ],
            ),
          ),
          SnapBadge('${r['recommendedSize'] ?? '—'}'),
          SizedBox(
            width: 52,
            child: Text(
              formatPercent(confidence),
              textAlign: TextAlign.right,
              style: snapText(size: 14, weight: FontWeight.w500, color: confidenceColor(context, confidence)),
            ),
          ),
        ],
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({required this.to, required this.icon, required this.label, required this.description});

  final String to;
  final IconData icon;
  final String label;
  final String description;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SnapCard(
      onTap: () => context.go(to),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: c.primary),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: snapText(size: 14, weight: FontWeight.w500, color: c.foreground),
                ),
                const SizedBox(height: 2),
                Text(description, style: snapText(size: 12, color: c.mutedForeground)),
              ],
            ),
          ),
          Icon(LucideIcons.chevronRight, size: 16, color: c.muted),
        ],
      ),
    );
  }
}
