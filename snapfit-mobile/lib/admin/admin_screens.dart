import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/auth_state.dart';
import '../core/format.dart';
import '../core/plans.dart';
import '../core/toast.dart';
import '../dashboard/analytics_screen.dart' show compareSizes;
import '../dashboard/settings_screen.dart' show AppearanceTab;
import '../core/json.dart';
import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import '../widgets/charts.dart';
import '../widgets/ui.dart';
import 'admin_common.dart';

String merchantPath(Object? id) => '/admin/merchants/${Uri.encodeComponent('$id')}';

/// One merchant in a list: business, email, plan and status badges.
class MerchantTile extends StatelessWidget {
  const MerchantTile({super.key, required this.merchant, this.trailing, this.footer});

  final Map merchant;
  final Widget? trailing;
  final String? footer;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return InkWell(
      onTap: () => context.go(merchantPath(merchant['_id'])),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${merchant['businessName'] ?? ''}',
                    style: snapText(size: 14, weight: FontWeight.w600, color: c.link),
                  ),
                  Text('${merchant['email'] ?? ''}', style: snapText(size: 12, color: c.mutedForeground)),
                  gap4,
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: [
                      PlanBadge((merchant['subscription'] as Map?)?['plan'] as String?),
                      AccountStatusBadge(merchant['status'] as String?),
                    ],
                  ),
                  if (footer != null) ...[gap4, Text(footer!, style: snapText(size: 12, color: c.mutedForeground))],
                ],
              ),
            ),
            ?trailing,
          ],
        ),
      ),
    );
  }
}

class AdminOverviewScreen extends StatefulWidget {
  const AdminOverviewScreen({super.key});

  @override
  State<AdminOverviewScreen> createState() => _AdminOverviewScreenState();
}

class _AdminOverviewScreenState extends State<AdminOverviewScreen> {
  Map<String, dynamic>? _overview;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _failed = false);
    try {
      final res = await context.read<ApiClient>().get('/admin/overview');
      if (mounted) setState(() => _overview = res);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    if (_failed) return LoadError(message: "Couldn't load the overview.", onRetry: _load);
    final overview = _overview;
    if (overview == null) return const PageLoader();
    final totals = (overview['totals'] as Map?) ?? const {};
    final byPlan = (overview['byPlan'] as Map?) ?? const {};
    final planTotal = plans.fold<num>(0, (sum, p) => sum + ((byPlan[p] as num?) ?? 0));
    final recent = asList(overview['recentMerchants']);

    return PageBody(
      onRefresh: _load,
      children: [
        const PageIntro(title: 'Platform overview', description: 'Every merchant and request across SnapFit.'),
        gap16,
        StatGrid(
          children: [
            StatCard(
              label: 'Merchants',
              value: formatNumber(totals['merchants'] as num?),
              sub:
                  '${formatNumber(totals['activeMerchants'] as num?)} active · ${formatNumber(totals['suspendedMerchants'] as num?)} suspended',
            ),
            StatCard(label: 'Recommendations', value: formatNumber(totals['recommendations'] as num?), sub: 'All time'),
            StatCard(
              label: 'Last 30 days',
              value: formatNumber(totals['recommendationsLast30Days'] as num?),
              sub: 'Recommendations',
            ),
            StatCard(label: 'Success rate', value: formatRatio(totals['successRate'] as num?), sub: 'Of all attempts'),
          ],
        ),
        gap16,
        ChartCard(
          title: 'Requests per day',
          child: DailyRequestsChart(daily: asList(overview['daily'])),
        ),
        gap16,
        ChartCard(
          title: 'Merchants by plan',
          child: Column(
            children: [
              for (final plan in plans)
                ShareBar(
                  label: formatPlanName(plan),
                  count: (byPlan[plan] as num?) ?? 0,
                  total: planTotal,
                  color: c.admin,
                ),
            ],
          ),
        ),
        gap16,
        SectionCard(
          title: 'Recent merchants',
          trailing: TextButton(
            onPressed: () => context.go('/admin/merchants'),
            child: Text(
              'View all',
              style: snapText(size: 14, weight: FontWeight.w500, color: c.link),
            ),
          ),
          child: recent.isEmpty
              ? Padding(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  child: Text(
                    'No merchants have signed up yet.',
                    textAlign: TextAlign.center,
                    style: snapText(size: 14, color: c.mutedForeground),
                  ),
                )
              : Column(
                  children: [
                    for (var i = 0; i < recent.length; i++) ...[
                      if (i > 0) Divider(height: 1, color: c.border),
                      MerchantTile(
                        merchant: recent[i] as Map,
                        footer: 'Joined ${formatAdminDate(recent[i]['createdAt'])}',
                      ),
                    ],
                  ],
                ),
        ),
      ],
    );
  }
}

/// Suspends an active merchant (with an optional reason) or reactivates a
/// suspended one. Resolves to the updated merchant, or null.
Future<Map<String, dynamic>?> showMerchantStatusDialog(BuildContext context, Map merchant) {
  final suspending = merchant['status'] != 'suspended';
  final reason = TextEditingController();
  var saving = false;
  return showDialog<Map<String, dynamic>>(
    context: context,
    builder: (dialogContext) => StatefulBuilder(
      builder: (dialogContext, setState) {
        final c = dialogContext.colors;
        return AlertDialog(
          title: Text(suspending ? 'Suspend ${merchant['businessName']}?' : 'Reactivate ${merchant['businessName']}?'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                suspending
                    ? 'The merchant is signed out, cannot log in, and their API key stops working until the account is reactivated.'
                    : 'The merchant can log in again and their API key starts working again.',
                style: snapText(size: 14, color: c.mutedForeground, height: 1.5),
              ),
              if (suspending) ...[
                gap16,
                SnapField(label: 'Reason (optional)', controller: reason, hint: 'e.g. Payment overdue', maxLines: 3),
              ],
            ],
          ),
          actions: [
            SnapButton(
              label: 'Cancel',
              variant: ButtonVariant.ghost,
              onPressed: saving ? null : () => Navigator.pop(dialogContext),
            ),
            SnapButton(
              label: suspending ? 'Suspend merchant' : 'Reactivate merchant',
              variant: suspending ? ButtonVariant.danger : ButtonVariant.primary,
              loading: saving,
              onPressed: () async {
                setState(() => saving = true);
                try {
                  final res = await context.read<ApiClient>().patch(
                    '${merchantPath(merchant['_id'])}/status',
                    suspending
                        ? {'status': 'suspended', if (reason.text.trim().isNotEmpty) 'reason': reason.text.trim()}
                        : {'status': 'active'},
                  );
                  showToast(
                    suspending ? '${merchant['businessName']} suspended' : '${merchant['businessName']} reactivated',
                    kind: ToastKind.success,
                  );
                  if (dialogContext.mounted) {
                    Navigator.pop(dialogContext, Map<String, dynamic>.from((res['merchant'] as Map?) ?? const {}));
                  }
                } catch (e) {
                  showToast(errorMessage(e, 'Failed to update the account status'), kind: ToastKind.error);
                  setState(() => saving = false);
                }
              },
            ),
          ],
        );
      },
    ),
  );
}

class AdminMerchantsScreen extends StatefulWidget {
  const AdminMerchantsScreen({super.key});

  @override
  State<AdminMerchantsScreen> createState() => _AdminMerchantsScreenState();
}

class _AdminMerchantsScreenState extends State<AdminMerchantsScreen> {
  static const _pageSize = 10;
  final _search = TextEditingController();
  String _query = '';
  String _plan = '';
  String _status = '';
  int _page = 1;
  Map<String, dynamic>? _result;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _failed = false);
    try {
      final res = await context.read<ApiClient>().get(
        '/admin/merchants',
        query: {'page': _page, 'limit': _pageSize, 'search': _query, 'plan': _plan, 'status': _status},
      );
      if (mounted) setState(() => _result = res);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  void _apply(void Function() change) {
    setState(() {
      change();
      _page = 1;
    });
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final result = _result;
    final merchants = asList(result?['merchants']);
    final hasFilters = _query.isNotEmpty || _plan.isNotEmpty || _status.isNotEmpty;

    return PageBody(
      onRefresh: _load,
      children: [
        const PageIntro(title: 'Merchants', description: 'Search, review and manage every merchant account.'),
        gap16,
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: SnapField(
                label: 'Search',
                controller: _search,
                hint: 'Business, name or email',
                textInputAction: TextInputAction.search,
                onSubmitted: (_) => _apply(() => _query = _search.text.trim()),
              ),
            ),
            const SizedBox(width: 8),
            SnapButton(
              label: 'Search',
              icon: LucideIcons.search,
              variant: ButtonVariant.secondary,
              onPressed: () => _apply(() => _query = _search.text.trim()),
            ),
          ],
        ),
        gap12,
        Row(
          children: [
            Expanded(
              child: SnapSelect<String>(
                label: 'Plan',
                value: _plan,
                options: {'': 'All plans', for (final p in plans) p: formatPlanName(p)},
                onChanged: (v) => _apply(() => _plan = v ?? ''),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: SnapSelect<String>(
                label: 'Status',
                value: _status,
                options: {'': 'All statuses', for (final s in accountStatuses) s: capitalize(s)},
                onChanged: (v) => _apply(() => _status = v ?? ''),
              ),
            ),
          ],
        ),
        gap16,
        if (_failed)
          LoadError(message: "Couldn't load merchants.", onRetry: _load)
        else if (result == null)
          const PageLoader()
        else if (merchants.isEmpty)
          EmptyState(
            icon: LucideIcons.store,
            title: hasFilters ? 'No merchants match these filters.' : 'No merchants have signed up yet.',
            action: hasFilters
                ? SnapButton(
                    label: 'Clear filters',
                    variant: ButtonVariant.secondary,
                    size: ButtonSize.sm,
                    onPressed: () {
                      _search.clear();
                      _apply(() {
                        _query = '';
                        _plan = '';
                        _status = '';
                      });
                    },
                  )
                : null,
          )
        else ...[
          SnapCard(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Column(
              children: [
                for (var i = 0; i < merchants.length; i++) ...[
                  if (i > 0) Divider(height: 1, color: c.border),
                  MerchantTile(
                    merchant: merchants[i] as Map,
                    footer:
                        'Usage ${formatUsage(merchants[i]['subscription'] as Map?)} · Joined ${formatAdminDate(merchants[i]['createdAt'])}',
                    trailing: TextButton(
                      onPressed: () async {
                        final updated = await showMerchantStatusDialog(context, merchants[i] as Map);
                        if (updated != null) _load();
                      },
                      child: Text(
                        merchants[i]['status'] == 'suspended' ? 'Reactivate' : 'Suspend',
                        style: snapText(
                          size: 13,
                          weight: FontWeight.w600,
                          color: merchants[i]['status'] == 'suspended' ? c.link : c.danger,
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          Pagination(
            page: (result['page'] as num? ?? 1).toInt(),
            pages: (result['pages'] as num? ?? 1).toInt(),
            total: (result['total'] as num? ?? 0).toInt(),
            onChange: (page) {
              setState(() => _page = page);
              _load();
            },
          ),
        ],
      ],
    );
  }
}

class AdminAnalyticsScreen extends StatefulWidget {
  const AdminAnalyticsScreen({super.key});

  @override
  State<AdminAnalyticsScreen> createState() => _AdminAnalyticsScreenState();
}

class _AdminAnalyticsScreenState extends State<AdminAnalyticsScreen> {
  int _days = 30;
  Map<String, dynamic>? _analytics;
  bool _failed = false;
  bool _exporting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _failed = false);
    try {
      final res = await context.read<ApiClient>().get('/admin/analytics', query: {'days': _days});
      if (mounted) setState(() => _analytics = res);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  Future<void> _export() async {
    setState(() => _exporting = true);
    try {
      final bytes = await context.read<ApiClient>().download('/admin/analytics/export');
      await shareCsv(bytes, 'snapfit-recommendations-${todayStamp()}.csv');
    } catch (e) {
      showToast(errorMessage(e, 'Failed to export the report'), kind: ToastKind.error);
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final header = PageIntro(
      title: 'Platform analytics',
      description: 'Recommendations across every merchant.',
      actions: [
        Segmented<int>(
          value: _days,
          options: const {7: '7 days', 30: '30 days', 90: '90 days'},
          onChanged: (v) {
            setState(() => _days = v);
            _load();
          },
        ),
        SnapButton(
          label: 'Export CSV',
          icon: LucideIcons.download,
          variant: ButtonVariant.secondary,
          size: ButtonSize.sm,
          loading: _exporting,
          onPressed: _export,
        ),
      ],
    );
    if (_failed) {
      return PageBody(
        children: [
          header,
          gap16,
          LoadError(message: "Couldn't load analytics.", onRetry: _load),
        ],
      );
    }
    final analytics = _analytics;
    if (analytics == null) return PageBody(children: [header, const PageLoader()]);

    final daily = asList(analytics['daily']);
    num sum(String key) => daily.fold<num>(0, (s, d) => s + ((d[key] as num?) ?? 0));
    final total = sum('total');
    final success = sum('success');
    final failed = sum('failed');
    final breakdown = (analytics['statusBreakdown'] as Map?) ?? const {};
    final statusRows = [
      ('success', 'Success', c.success),
      ('low_confidence', 'Low confidence', c.warning),
      ('failed', 'Failed', c.danger),
    ];
    final statusTotal = statusRows.fold<num>(0, (s, r) => s + ((breakdown[r.$1] as num?) ?? 0));
    final top = asList(analytics['topMerchants']);
    final topTotal = top.fold<num>(0, (s, m) => s + ((m['count'] as num?) ?? 0));
    final sizes = [...asList(analytics['sizes'])]..sort((a, b) => compareSizes('${a['size']}', '${b['size']}'));

    return PageBody(
      onRefresh: _load,
      children: [
        header,
        gap16,
        StatGrid(
          children: [
            StatCard(label: 'Requests', value: formatNumber(total), sub: 'Last $_days days'),
            StatCard(label: 'Successful', value: formatNumber(success), sub: 'Last $_days days'),
            StatCard(label: 'Failed', value: formatNumber(failed), sub: 'Last $_days days'),
            StatCard(
              label: 'Success rate',
              value: formatRatio(total == 0 ? null : success / total),
              sub: 'Last $_days days',
            ),
          ],
        ),
        gap16,
        ChartCard(
          title: 'Requests per day',
          child: DailyRequestsChart(daily: daily),
        ),
        gap16,
        ChartCard(
          title: 'Status breakdown',
          isEmpty: statusTotal == 0,
          emptyLabel: 'No recommendations yet',
          child: Column(
            children: [
              for (final (key, label, color) in statusRows)
                ShareBar(label: label, count: (breakdown[key] as num?) ?? 0, total: statusTotal, color: color),
            ],
          ),
        ),
        gap16,
        ChartCard(
          title: 'Top merchants',
          isEmpty: top.isEmpty,
          emptyLabel: 'No merchant activity yet',
          child: Column(
            children: [
              for (final m in top)
                ShareBar(
                  label: '${m['businessName']}',
                  count: (m['count'] as num?) ?? 0,
                  total: topTotal,
                  color: c.admin,
                  onTap: () => context.go(merchantPath(m['merchantId'])),
                ),
            ],
          ),
        ),
        gap16,
        ChartCard(
          title: 'Recommended sizes',
          isEmpty: sizes.isEmpty,
          emptyLabel: 'No sized recommendations yet',
          child: CategoryBarChart(bars: [for (final s in sizes) ('${s['size']}', (s['count'] as num?) ?? 0, c.admin)]),
        ),
      ],
    );
  }
}

class AdminAuditLogScreen extends StatefulWidget {
  const AdminAuditLogScreen({super.key});

  @override
  State<AdminAuditLogScreen> createState() => _AdminAuditLogScreenState();
}

class _AdminAuditLogScreenState extends State<AdminAuditLogScreen> {
  int _page = 1;
  Map<String, dynamic>? _result;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _failed = false);
    try {
      final res = await context.read<ApiClient>().get('/admin/audit-log', query: {'page': _page, 'limit': 20});
      if (mounted) setState(() => _result = res);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final result = _result;
    final entries = asList(result?['entries']);
    return PageBody(
      onRefresh: _load,
      children: [
        const PageIntro(title: 'Audit log', description: 'Every change made from the admin console, newest first.'),
        gap16,
        if (_failed)
          LoadError(message: "Couldn't load the audit log.", onRetry: _load)
        else if (result == null)
          const PageLoader()
        else if (entries.isEmpty)
          const EmptyState(icon: LucideIcons.scrollText, title: 'No admin actions have been recorded yet.')
        else ...[
          for (final entry in entries) ...[_AuditEntry(entry as Map), gap12],
          Pagination(
            page: (result['page'] as num? ?? 1).toInt(),
            pages: (result['pages'] as num? ?? 1).toInt(),
            total: (result['total'] as num? ?? 0).toInt(),
            onChange: (page) {
              setState(() => _page = page);
              _load();
            },
          ),
        ],
        if (entries.isNotEmpty)
          Text('Tap an entry to see what changed.', style: snapText(size: 12, color: c.mutedForeground)),
      ],
    );
  }
}

class _AuditEntry extends StatelessWidget {
  const _AuditEntry(this.entry);

  final Map entry;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final details = entry['details'];
    final hasDetails = details is Map && details.isNotEmpty;
    final hasDiff = hasDetails && (details.containsKey('before') || details.containsKey('after'));
    final label = '${entry['targetLabel'] ?? entry['targetId'] ?? '—'}';
    final linkable =
        entry['targetType'] == 'merchant' &&
        entry['targetId'] != null &&
        !'${entry['action'] ?? ''}'.contains('delete');
    const encoder = JsonEncoder.withIndent('  ');

    Widget json(String? title, Object? value) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (title != null) ...[
          Text(
            title,
            style: snapText(size: 12, weight: FontWeight.w500, color: c.mutedForeground),
          ),
          gap4,
        ],
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(color: c.surface2, borderRadius: BorderRadius.circular(8)),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Text(
              encoder.convert(value),
              style: TextStyle(fontFamily: 'monospace', fontSize: 11, color: c.foreground),
            ),
          ),
        ),
      ],
    );

    return SnapCard(
      padding: EdgeInsets.zero,
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          enabled: hasDetails,
          showTrailingIcon: hasDetails,
          tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          title: Text(
            formatAction(entry['action']),
            style: snapText(size: 14, weight: FontWeight.w600, color: c.foreground),
          ),
          subtitle: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              gap4,
              GestureDetector(
                onTap: linkable ? () => context.go(merchantPath(entry['targetId'])) : null,
                child: Text(
                  entry['targetType'] == null ? label : '$label · ${humanize(entry['targetType'])}',
                  style: snapText(size: 13, color: linkable ? c.link : c.foreground),
                ),
              ),
              Text(
                '${entry['adminEmail'] ?? ''} · ${formatAdminDateTime(entry['createdAt'])}',
                style: snapText(size: 12, color: c.mutedForeground),
              ),
              if (hasDetails)
                Text(
                  hasDiff ? 'Before / after' : 'Details',
                  style: snapText(size: 12, weight: FontWeight.w500, color: c.primary),
                ),
            ],
          ),
          children: [
            if (hasDiff) ...[
              json('Before', details['before']),
              gap8,
              json('After', details['after']),
            ] else if (hasDetails)
              json(null, details),
          ],
        ),
      ),
    );
  }
}

class AdminSettingsScreen extends StatelessWidget {
  const AdminSettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final email = '${context.watch<AuthState>().merchant?['email'] ?? ''}';
    return PageBody(
      children: [
        const PageIntro(title: 'Settings', description: 'Appearance and account details for the admin console.'),
        gap16,
        const AppearanceTab(),
        gap16,
        SectionCard(
          title: 'Super admin account',
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(color: c.adminSoft, borderRadius: BorderRadius.circular(8)),
                child: Icon(LucideIcons.shieldCheck, size: 18, color: c.admin),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      email,
                      style: snapText(size: 14, weight: FontWeight.w500, color: c.foreground),
                    ),
                    gap4,
                    Text(
                      "The super admin login is managed in the backend's .env file, not here. To change its email or password, update those values on the server and restart it.",
                      style: snapText(size: 14, color: c.mutedForeground, height: 1.5),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
