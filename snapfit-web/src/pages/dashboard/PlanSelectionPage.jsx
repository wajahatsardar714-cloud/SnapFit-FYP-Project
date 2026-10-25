import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Check, Loader2 } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import ConfirmModal from '../../components/ui/ConfirmModal';
import {
  RECOMMENDED_PLAN,
  formatChartsLimit,
  formatPlanPrice,
  formatRequestsLimit,
  isPlanId,
  isSubscribed,
} from '../../utils/plans';

function planCardClasses({ isCurrent, isRecommended }) {
  if (isCurrent) return '!border-primary !bg-primary-soft';
  if (isRecommended) return '!border-primary';
  return '';
}

function PlanSelectionPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { merchant, refreshMerchant } = useAuth();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [switching, setSwitching] = useState(false);

  const subscribed = isSubscribed(merchant);
  const currentPlan = subscribed ? merchant.subscription.plan : null;
  const requestedPlan = searchParams.get('plan');

  useEffect(() => {
    api
      .get('/subscription/plans')
      .then((res) => setPlans(res.data.plans))
      .catch(() => toast.error('Failed to load plans'))
      .finally(() => setLoading(false));
  }, []);

  // A plan picked on the public pricing page (?plan=medium) opens its
  // confirmation straight away; the param is then dropped so it doesn't reopen.
  useEffect(() => {
    if (!isPlanId(requestedPlan) || plans.length === 0) return;
    const match = plans.find((p) => p.plan === requestedPlan);
    if (match && match.plan !== currentPlan) setSelectedPlan(match);
    setSearchParams({}, { replace: true });
  }, [requestedPlan, plans, currentPlan, setSearchParams]);

  async function confirmSelection() {
    if (!selectedPlan) return;
    setSwitching(true);
    try {
      await api.post('/subscription/select', { plan: selectedPlan.plan });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to select the plan');
      setSwitching(false);
      return;
    }

    toast.success(`You're on the ${selectedPlan.name} plan!`);
    try {
      await refreshMerchant();
    } catch {
      toast.error('Reload the page to unlock your dashboard');
    }
    setSwitching(false);
    setSelectedPlan(null);
    navigate('/dashboard/subscription');
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-muted" size={28} />
      </div>
    );
  }

  const action = subscribed ? 'Switch' : 'Subscribe';

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Choose a plan</h1>
      <p className="mt-1 text-sm text-muted-foreground">Pick the plan that fits your store&apos;s volume.</p>

      <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.plan === currentPlan;
          const isRecommended = plan.plan === RECOMMENDED_PLAN;
          const isCustom = plan.price == null;
          return (
            <Card
              key={plan.plan}
              role="group"
              aria-label={`${plan.name} plan`}
              className={`flex flex-col ${planCardClasses({ isCurrent, isRecommended })}`}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-foreground">{plan.name}</h2>
                {isCurrent ? (
                  <Badge variant="success">Current</Badge>
                ) : (
                  isRecommended && <Badge variant="info">Recommended</Badge>
                )}
              </div>
              <p className="mt-2 text-2xl font-semibold text-foreground">{formatPlanPrice(plan.price)}</p>
              {isCustom && <p className="mt-1 text-sm text-muted-foreground">Contact us for custom pricing</p>}

              <ul className="mt-4 flex-1 space-y-2 text-sm text-foreground">
                <li className="flex items-center gap-2">
                  <Check size={16} className="shrink-0 text-success" aria-hidden="true" />
                  {formatRequestsLimit(plan.requestsLimit)}
                </li>
                <li className="flex items-center gap-2">
                  <Check size={16} className="shrink-0 text-success" aria-hidden="true" />
                  {formatChartsLimit(plan.chartsLimit)}
                </li>
              </ul>

              <Button
                className="mt-6"
                variant={isRecommended ? 'primary' : 'secondary'}
                disabled={isCurrent}
                onClick={() => setSelectedPlan(plan)}
              >
                {isCurrent ? 'Current Plan' : `Select ${plan.name}`}
              </Button>
            </Card>
          );
        })}
      </div>

      <ConfirmModal
        open={Boolean(selectedPlan)}
        title={selectedPlan ? `${action} to ${selectedPlan.name}?` : ''}
        description={
          selectedPlan
            ? `Your plan will be ${selectedPlan.name} (${formatPlanPrice(selectedPlan.price)}) from today, starting a new 30-day billing cycle.`
            : ''
        }
        confirmLabel={`Confirm ${action.toLowerCase()}`}
        loading={switching}
        onConfirm={confirmSelection}
        onClose={() => !switching && setSelectedPlan(null)}
      />
    </div>
  );
}

export default PlanSelectionPage;
