// Subscription plans, roles and the subscription gate -- the same rules as the
// web app's src/utils/plans.js, roles.js and subscriptionAccess.js.
import 'package:intl/intl.dart';

const plans = ['small', 'medium', 'enterprise'];
const recommendedPlan = 'medium';
const _planNames = {'small': 'Small', 'medium': 'Medium', 'enterprise': 'Enterprise'};

/// Badge variant per plan.
const planBadgeVariant = {'small': 'neutral', 'medium': 'info', 'enterprise': 'success'};

bool isPlanId(String? value) => plans.contains(value);

final _number = NumberFormat.decimalPattern('en_US');

String formatNumber(num? value) => value == null ? '0' : _number.format(value);

String formatPlanName(String? plan) {
  if (plan == null || plan.isEmpty) return 'None';
  return _planNames[plan] ?? plan[0].toUpperCase() + plan.substring(1);
}

/// A null price is a custom (contact us) plan.
String formatPlanPrice(num? price) => price == null ? 'Custom' : '\$${formatNumber(price)}/month';

/// A null limit means no cap.
String formatLimit(num? limit) => limit == null ? 'Unlimited' : formatNumber(limit);

String formatRequestsLimit(num? limit) => limit == null ? 'Unlimited requests' : '${formatLimit(limit)} requests/month';

String formatChartsLimit(num? limit) {
  if (limit == null) return 'Unlimited size charts';
  return '${formatLimit(limit)} size chart${limit == 1 ? '' : 's'}';
}

/// An active subscription whose end date (if any) is still ahead.
bool isSubscribed(Map<String, dynamic>? merchant, [DateTime? now]) {
  final subscription = merchant?['subscription'];
  if (subscription is! Map || subscription['status'] != 'active') return false;
  final end = subscription['endDate'];
  if (end == null) return true;
  final endDate = DateTime.tryParse(end.toString());
  return endDate == null || endDate.isAfter(now ?? DateTime.now());
}

const roleMerchant = 'merchant';
const roleSuperAdmin = 'superadmin';

String roleOf(Map<String, dynamic>? account) => account?['role'] == roleSuperAdmin ? roleSuperAdmin : roleMerchant;

String homePathFor(Map<String, dynamic>? account) => roleOf(account) == roleSuperAdmin ? '/admin' : '/dashboard';

const planSelectionPath = '/dashboard/subscription/plans';

/// Dashboard areas a merchant can open before subscribing.
const _unlockedPaths = ['/dashboard/subscription', '/dashboard/settings'];

bool isPathUnlocked(String path) => _unlockedPaths.any((p) => path == p || path.startsWith('$p/'));

bool needsSubscription(Map<String, dynamic>? account) => roleOf(account) != roleSuperAdmin && !isSubscribed(account);

bool isPathLockedFor(Map<String, dynamic>? account, String path) => needsSubscription(account) && !isPathUnlocked(path);
