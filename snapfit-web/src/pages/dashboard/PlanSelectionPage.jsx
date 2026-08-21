import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Check, Loader2 } from 'lucide-react';
import api from '../../services/api';
import ConfirmModal from '../../components/ConfirmModal';
import Badge from '../../components/Badge';

function formatPrice(plan) {
  if (plan.price === 0) return 'Free';
  if (plan.price == null) return 'Custom pricing';
  return `$${plan.price}/month`;
}

function formatRequests(limit) {
  return limit == null ? 'Unlimited requests' : `${limit.toLocaleString()} requests/month`;
}

function formatCharts(limit) {
  if (limit == null) return 'Unlimited size charts';
  return `${limit} size chart${limit === 1 ? '' : 's'}`;
}

function PlanSelectionPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    Promise.all([api.get('/subscription/plans'), api.get('/subscription/status')])
      .then(([plansRes, statusRes]) => {
        setPlans(plansRes.data.plans);
        setCurrentPlan(statusRes.data.subscription.plan);
      })
      .catch(() => toast.error('Failed to load plans'))
      .finally(() => setLoading(false));
  }, []);

  async function confirmSwitch() {
    if (!selectedPlan) return;
    setSwitching(true);
    try {
      await api.post('/subscription/select', { plan: selectedPlan.plan });
      toast.success(`Switched to the ${selectedPlan.name} plan!`);
      setCurrentPlan(selectedPlan.plan);
      setSelectedPlan(null);
      navigate('/dashboard/subscription');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to switch plans');
    } finally {
      setSwitching(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-gray-400" size={28} />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Choose a plan</h1>
      <p className="mt-1 text-sm text-gray-500">Pick the plan that fits your store&apos;s volume.</p>

      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => {
          const isCurrent = plan.plan === currentPlan;
          return (
            <div
              key={plan.plan}
              className={`flex flex-col rounded-xl border bg-white p-6 shadow-sm ${
                isCurrent ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold capitalize text-gray-900">{plan.name}</h2>
                {isCurrent && <Badge color="blue">Current</Badge>}
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-900">{formatPrice(plan)}</p>

              <ul className="mt-4 flex-1 space-y-2 text-sm text-gray-600">
                <li className="flex items-center gap-2">
                  <Check size={16} className="shrink-0 text-gray-400" />
                  {formatRequests(plan.requestsLimit)}
                </li>
                <li className="flex items-center gap-2">
                  <Check size={16} className="shrink-0 text-gray-400" />
                  {formatCharts(plan.chartsLimit)}
                </li>
              </ul>

              <button
                type="button"
                disabled={isCurrent}
                onClick={() => setSelectedPlan(plan)}
                className="mt-6 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCurrent ? 'Current Plan' : 'Select Plan'}
              </button>
            </div>
          );
        })}
      </div>

      <ConfirmModal
        open={Boolean(selectedPlan)}
        title={selectedPlan ? `Switch to ${selectedPlan.name}?` : ''}
        description={
          selectedPlan
            ? `Your plan will change to ${selectedPlan.name} (${formatPrice(selectedPlan)}) immediately, starting a new 30-day billing cycle.`
            : ''
        }
        confirmLabel="Confirm switch"
        loading={switching}
        onConfirm={confirmSwitch}
        onClose={() => !switching && setSelectedPlan(null)}
      />
    </div>
  );
}

export default PlanSelectionPage;
