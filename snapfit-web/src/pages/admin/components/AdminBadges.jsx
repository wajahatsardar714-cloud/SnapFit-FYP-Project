import Badge from '../../../components/ui/Badge';
import { PLAN_BADGE_VARIANT, formatPlanName } from '../../../utils/plans';
import { ACCOUNT_STATUS_BADGE_VARIANT, SUBSCRIPTION_STATUS_BADGE_VARIANT, capitalize } from '../adminFormat';

export function PlanBadge({ plan }) {
  return <Badge variant={PLAN_BADGE_VARIANT[plan] || 'neutral'}>{formatPlanName(plan)}</Badge>;
}

export function AccountStatusBadge({ status }) {
  return <Badge variant={ACCOUNT_STATUS_BADGE_VARIANT[status] || 'neutral'}>{capitalize(status || 'active')}</Badge>;
}

export function SubscriptionStatusBadge({ status }) {
  return <Badge variant={SUBSCRIPTION_STATUS_BADGE_VARIANT[status] || 'neutral'}>{capitalize(status || 'inactive')}</Badge>;
}
