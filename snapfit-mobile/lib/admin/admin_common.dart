// Formatting and badges shared by the admin console (the web's adminFormat.js
// and AdminBadges.jsx), plus its pagination and usage bar.
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../core/format.dart';
import '../core/plans.dart';
import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import '../widgets/ui.dart';

const subscriptionStatuses = ['active', 'inactive', 'expired'];
const accountStatuses = ['active', 'suspended'];

const _accountStatusVariant = {'active': BadgeVariant.success, 'suspended': BadgeVariant.danger};
const _subscriptionStatusVariant = {
  'active': BadgeVariant.success,
  'inactive': BadgeVariant.neutral,
  'expired': BadgeVariant.warning,
};
const recommendationStatusVariant = {
  'success': BadgeVariant.success,
  'low_confidence': BadgeVariant.warning,
  'failed': BadgeVariant.danger,
};

/// "low_confidence" -> "Low confidence"
String humanize(Object? value) => capitalize('${value ?? ''}'.replaceAll('_', ' '));

/// 0.873 -> "87.3%"
String formatRatio(num? ratio) => ratio == null ? '—' : '${formatDecimal((ratio * 1000).round() / 10)}%';

/// "1,240 / 5,000", or "1,240 / Unlimited" when there is no cap.
String formatUsage(Map? subscription) {
  final used = formatNumber(subscription?['requestsUsed'] as num?);
  final limit = subscription?['requestsLimit'] as num?;
  return '$used / ${limit == null ? 'Unlimited' : formatNumber(limit)}';
}

/// Audit actions are machine names ("merchant.suspend", "apiKeyRegenerated");
/// show them as words.
String formatAction(Object? action) => capitalize(
  '${action ?? ''}'
      .replaceAllMapped(RegExp('([a-z])([A-Z])'), (m) => '${m[1]} ${m[2]}')
      .replaceAll(RegExp('[._-]+'), ' ')
      .trim()
      .toLowerCase(),
);

String formatAdminDate(Object? value) => value == null ? '—' : formatShortDate(value);

String formatAdminDateTime(Object? value) {
  final date = value == null ? null : DateTime.tryParse('$value')?.toLocal();
  return date == null ? '—' : DateFormat('MMM d, h:mm a').format(date);
}

class PlanBadge extends StatelessWidget {
  const PlanBadge(this.plan, {super.key});

  final String? plan;

  @override
  Widget build(BuildContext context) =>
      SnapBadge(formatPlanName(plan), variant: badgeVariantFrom(planBadgeVariant[plan]));
}

class AccountStatusBadge extends StatelessWidget {
  const AccountStatusBadge(this.status, {super.key});

  final String? status;

  @override
  Widget build(BuildContext context) =>
      SnapBadge(capitalize(status ?? 'active'), variant: _accountStatusVariant[status] ?? BadgeVariant.neutral);
}

class SubscriptionStatusBadge extends StatelessWidget {
  const SubscriptionStatusBadge(this.status, {super.key});

  final String? status;

  @override
  Widget build(BuildContext context) =>
      SnapBadge(capitalize(status ?? 'inactive'), variant: _subscriptionStatusVariant[status] ?? BadgeVariant.neutral);
}

/// Requests used against the plan's cap; a null limit means unlimited.
class AdminUsageBar extends StatelessWidget {
  const AdminUsageBar({super.key, required this.subscription});

  final Map? subscription;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final used = (subscription?['requestsUsed'] as num?) ?? 0;
    final limit = subscription?['requestsLimit'] as num?;
    final pct = limit == null ? 0 : (limit == 0 ? 100 : (used / limit * 100).round().clamp(0, 100));
    final tone = pct >= 90 ? c.danger : (pct >= 75 ? c.warning : c.admin);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Text('Requests used', style: snapText(size: 14, color: c.mutedForeground)),
            const Spacer(),
            Text(
              formatUsage(subscription),
              style: snapText(size: 14, weight: FontWeight.w500, color: c.foreground),
            ),
          ],
        ),
        gap8,
        ProgressBar(percent: limit == null ? 0 : pct, color: tone),
        if (limit == null) ...[
          gap4,
          Text('Unlimited requests on this account', style: snapText(size: 12, color: c.mutedForeground)),
        ],
      ],
    );
  }
}

class Pagination extends StatelessWidget {
  const Pagination({super.key, required this.page, required this.pages, required this.total, required this.onChange});

  final int page;
  final int pages;
  final int total;
  final ValueChanged<int> onChange;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    if (pages <= 1) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Row(
        children: [
          Expanded(
            child: Text(
              'Page $page of $pages (${formatNumber(total)} total)',
              style: snapText(size: 13, color: c.mutedForeground),
            ),
          ),
          SnapButton(
            label: 'Prev',
            icon: LucideIcons.chevronLeft,
            variant: ButtonVariant.secondary,
            size: ButtonSize.sm,
            onPressed: page <= 1 ? null : () => onChange(page - 1),
          ),
          const SizedBox(width: 8),
          SnapButton(
            label: 'Next',
            variant: ButtonVariant.secondary,
            size: ButtonSize.sm,
            onPressed: page >= pages ? null : () => onChange(page + 1),
          ),
        ],
      ),
    );
  }
}

/// The super admin marker shown in the admin app bar.
class SuperAdminBadge extends StatelessWidget {
  const SuperAdminBadge({super.key});

  @override
  Widget build(BuildContext context) =>
      const SnapBadge('Super Admin', variant: BadgeVariant.admin, icon: LucideIcons.shieldCheck);
}
