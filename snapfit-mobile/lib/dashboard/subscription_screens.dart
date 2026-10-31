import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/auth_state.dart';
import '../core/format.dart';
import '../core/plans.dart';
import '../core/toast.dart';
import '../core/json.dart';
import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import '../widgets/ui.dart';

Color usageBarColor(BuildContext context, num pct) {
  final c = context.colors;
  if (pct >= 100) return c.danger;
  if (pct >= 80) return c.warning;
  return c.primary;
}

class SubscriptionStatusScreen extends StatefulWidget {
  const SubscriptionStatusScreen({super.key});

  @override
  State<SubscriptionStatusScreen> createState() => _SubscriptionStatusScreenState();
}

class _SubscriptionStatusScreenState extends State<SubscriptionStatusScreen> {
  Map<String, dynamic>? _data;
  num? _chartsLimit;
  String? _error;
  bool _cancelling = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = context.read<ApiClient>();
    setState(() => _error = null);
    try {
      final results = await Future.wait([api.get('/subscription/status'), api.get('/subscription/plans')]);
      if (!mounted) return;
      final plan = (results[0]['subscription'] as Map?)?['plan'];
      final match = asList(results[1]['plans']).cast<Map?>().firstWhere((p) => p?['plan'] == plan, orElse: () => null);
      setState(() {
        _data = results[0];
        _chartsLimit = match?['chartsLimit'] as num?;
      });
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e, 'Failed to load subscription'));
    }
  }

  Future<void> _cancel() async {
    final ok = await confirmAction(
      context,
      title: 'Cancel your subscription?',
      message: 'Your plan will be marked inactive immediately. You can re-subscribe at any time.',
      confirmLabel: 'Yes, cancel',
    );
    if (!ok || !mounted) return;
    setState(() => _cancelling = true);
    try {
      await context.read<ApiClient>().post('/subscription/cancel');
      showToast('Subscription cancelled', kind: ToastKind.success);
      if (!mounted) return;
      await Future.wait([_load(), context.read<AuthState>().refresh()]);
    } catch (e) {
      showToast(errorMessage(e, 'Failed to cancel subscription'), kind: ToastKind.error);
    } finally {
      if (mounted) setState(() => _cancelling = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    if (_error != null) return LoadError(message: _error!, onRetry: _load);
    final data = _data;
    if (data == null) return const PageLoader();
    final subscription = (data['subscription'] as Map?) ?? const {};
    final usage = (data['usage'] as Map?) ?? const {};

    if (subscription['startDate'] == null) {
      return PageBody(
        onRefresh: _load,
        children: [
          const PageIntro(title: 'Subscription'),
          gap16,
          EmptyState(
            icon: LucideIcons.creditCard,
            title: "You haven't selected a plan yet.",
            action: SnapButton(label: 'Choose a Plan', onPressed: () => context.go(planSelectionPath)),
          ),
        ],
      );
    }

    final status = '${subscription['status'] ?? ''}';
    final used = (usage['requestsUsed'] as num?) ?? 0;
    final limit = usage['requestsLimit'] as num?;
    final pct = limit == null || limit == 0 ? 0 : (used / limit * 100).round().clamp(0, 100);

    return PageBody(
      onRefresh: _load,
      children: [
        const PageIntro(title: 'Subscription'),
        gap16,
        SnapCard(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '${formatPlanName(subscription['plan'] as String?)} plan',
                      style: snapText(size: 18, weight: FontWeight.w600, color: c.foreground),
                    ),
                  ),
                  SnapBadge(capitalize(status), variant: badgeVariantFrom(subscriptionStatusVariant(status))),
                ],
              ),
              gap16,
              Row(
                children: [
                  Expanded(
                    child: _Term(label: 'Start date', value: formatLongDate(subscription['startDate'])),
                  ),
                  Expanded(
                    child: _Term(label: 'Renews / ends', value: formatLongDate(subscription['endDate'])),
                  ),
                ],
              ),
              gap24,
              Row(
                children: [
                  Text('Usage this month', style: snapText(size: 14, color: c.mutedForeground)),
                  const Spacer(),
                  Text(
                    '$used / ${formatLimit(limit)} requests',
                    style: snapText(size: 14, weight: FontWeight.w500, color: c.foreground),
                  ),
                ],
              ),
              if (limit != null) ...[gap8, ProgressBar(percent: pct, color: usageBarColor(context, pct))],
              gap16,
              Text.rich(
                TextSpan(
                  style: snapText(size: 14, color: c.mutedForeground),
                  children: [
                    const TextSpan(text: 'Size chart limit: '),
                    TextSpan(
                      text: formatChartsLimit(_chartsLimit),
                      style: snapText(size: 14, weight: FontWeight.w500, color: c.foreground),
                    ),
                  ],
                ),
              ),
              gap24,
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  SnapButton(label: 'Change Plan', onPressed: () => context.go(planSelectionPath)),
                  SnapButton(
                    label: 'Cancel Subscription',
                    variant: ButtonVariant.secondary,
                    loading: _cancelling,
                    onPressed: status == 'active' ? _cancel : null,
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Term extends StatelessWidget {
  const _Term({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: snapText(size: 14, color: c.mutedForeground)),
        const SizedBox(height: 2),
        Text(
          value,
          style: snapText(size: 14, weight: FontWeight.w500, color: c.foreground),
        ),
      ],
    );
  }
}

class PlanSelectionScreen extends StatefulWidget {
  const PlanSelectionScreen({super.key, this.requestedPlan});

  /// A plan picked on the pricing page (?plan=), opened for confirmation.
  final String? requestedPlan;

  @override
  State<PlanSelectionScreen> createState() => _PlanSelectionScreenState();
}

class _PlanSelectionScreenState extends State<PlanSelectionScreen> {
  List<Map<String, dynamic>>? _plans;
  String? _error;
  bool _switching = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final res = await context.read<ApiClient>().get('/subscription/plans');
      if (!mounted) return;
      setState(() => _plans = [for (final p in asList(res['plans'])) Map<String, dynamic>.from(p as Map)]);
      final requested = widget.requestedPlan;
      if (isPlanId(requested)) {
        final match = _plans!.where((p) => p['plan'] == requested).firstOrNull;
        if (match != null && match['plan'] != _currentPlan) {
          WidgetsBinding.instance.addPostFrameCallback((_) => _select(match));
        }
      }
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e, 'Failed to load plans'));
    }
  }

  String? get _currentPlan {
    final merchant = context.read<AuthState>().merchant;
    return isSubscribed(merchant) ? merchant!['subscription']['plan'] as String? : null;
  }

  Future<void> _select(Map<String, dynamic> plan) async {
    final action = _currentPlan != null ? 'Switch' : 'Subscribe';
    final ok = await confirmAction(
      context,
      title: '$action to ${plan['name']}?',
      message:
          'Your plan will be ${plan['name']} (${formatPlanPrice(plan['price'] as num?)}) from today, starting a new 30-day billing cycle.',
      confirmLabel: 'Confirm ${action.toLowerCase()}',
      danger: false,
    );
    if (!ok || !mounted) return;
    setState(() => _switching = true);
    final auth = context.read<AuthState>();
    try {
      await context.read<ApiClient>().post('/subscription/select', {'plan': plan['plan']});
    } catch (e) {
      showToast(errorMessage(e, 'Failed to select the plan'), kind: ToastKind.error);
      if (mounted) setState(() => _switching = false);
      return;
    }
    showToast("You're on the ${plan['name']} plan!", kind: ToastKind.success);
    try {
      await auth.refresh();
    } catch (_) {
      showToast('Pull to refresh to unlock your dashboard', kind: ToastKind.error);
    }
    if (!mounted) return;
    setState(() => _switching = false);
    context.go('/dashboard/subscription');
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    if (_error != null) return LoadError(message: _error!, onRetry: _load);
    final plansList = _plans;
    if (plansList == null) return const PageLoader();
    context.watch<AuthState>();
    final current = _currentPlan;

    return PageBody(
      children: [
        const PageIntro(title: 'Choose a plan', description: "Pick the plan that fits your store's volume."),
        gap16,
        for (final plan in plansList) ...[
          Builder(
            builder: (context) {
              final isCurrent = plan['plan'] == current;
              final isRecommended = plan['plan'] == recommendedPlan;
              return SnapCard(
                padding: const EdgeInsets.all(20),
                color: isCurrent ? c.primarySoft : null,
                borderColor: isCurrent || isRecommended ? c.primary : null,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            '${plan['name']}',
                            style: snapText(size: 18, weight: FontWeight.w600, color: c.foreground),
                          ),
                        ),
                        if (isCurrent)
                          const SnapBadge('Current', variant: BadgeVariant.success)
                        else if (isRecommended)
                          const SnapBadge('Recommended', variant: BadgeVariant.info),
                      ],
                    ),
                    gap8,
                    Text(
                      formatPlanPrice(plan['price'] as num?),
                      style: snapText(size: 22, weight: FontWeight.w600, color: c.foreground),
                    ),
                    if (plan['price'] == null) ...[
                      gap4,
                      Text('Contact us for custom pricing', style: snapText(size: 14, color: c.mutedForeground)),
                    ],
                    gap16,
                    for (final feature in [
                      formatRequestsLimit(plan['requestsLimit'] as num?),
                      formatChartsLimit(plan['chartsLimit'] as num?),
                    ])
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          children: [
                            Icon(LucideIcons.check, size: 16, color: c.success),
                            const SizedBox(width: 8),
                            Text(feature, style: snapText(size: 14, color: c.foreground)),
                          ],
                        ),
                      ),
                    gap16,
                    SnapButton(
                      label: isCurrent ? 'Current Plan' : 'Select ${plan['name']}',
                      variant: isRecommended ? ButtonVariant.primary : ButtonVariant.secondary,
                      expand: true,
                      loading: _switching,
                      onPressed: isCurrent ? null : () => _select(plan),
                    ),
                  ],
                ),
              );
            },
          ),
          gap16,
        ],
      ],
    );
  }
}
