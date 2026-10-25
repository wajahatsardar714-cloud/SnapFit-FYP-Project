import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../../services/api';
import PlanSelectionPage from './PlanSelectionPage';

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const auth = { merchant: null, refreshMerchant: vi.fn() };
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));

const PLANS = [
  { plan: 'small', name: 'Small', price: 19, requestsLimit: 1000, chartsLimit: 3 },
  { plan: 'medium', name: 'Medium', price: 49, requestsLimit: 10000, chartsLimit: 20 },
  { plan: 'enterprise', name: 'Enterprise', price: null, requestsLimit: null, chartsLimit: null },
];

const UNSUBSCRIBED = { role: 'merchant', subscription: { plan: 'small', status: 'inactive' } };
const ON_SMALL = { role: 'merchant', subscription: { plan: 'small', status: 'active', endDate: null } };

function renderAt(path = '/dashboard/subscription/plans') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dashboard/subscription/plans" element={<PlanSelectionPage />} />
        <Route path="/dashboard/subscription" element={<p>Subscription page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

const card = (name) => within(screen.getByRole('group', { name: `${name} plan` }));

beforeEach(() => {
  vi.clearAllMocks();
  auth.merchant = UNSUBSCRIBED;
  auth.refreshMerchant.mockResolvedValue(ON_SMALL);
  api.get.mockResolvedValue({ data: { plans: PLANS } });
  api.post.mockResolvedValue({ data: {} });
});

describe('PlanSelectionPage', () => {
  it('lists the plans from the public endpoint, recommending Medium', async () => {
    renderAt();

    await screen.findByRole('group', { name: 'Small plan' });
    expect(api.get).toHaveBeenCalledWith('/subscription/plans');
    expect(card('Small').getByText('$19/month')).toBeTruthy();
    expect(card('Small').getByText('1,000 requests/month')).toBeTruthy();
    expect(card('Medium').getByText('Recommended')).toBeTruthy();
    expect(card('Enterprise').getByText('Custom')).toBeTruthy();
    expect(card('Enterprise').getByText('Contact us for custom pricing')).toBeTruthy();
    expect(card('Enterprise').getByText('Unlimited requests')).toBeTruthy();
    expect(card('Enterprise').getByText('Unlimited size charts')).toBeTruthy();
  });

  it('marks the active plan as current', async () => {
    auth.merchant = ON_SMALL;
    renderAt();

    await screen.findByRole('group', { name: 'Small plan' });
    expect(card('Small').getByText('Current')).toBeTruthy();
    expect(card('Small').getByRole('button', { name: 'Current Plan' }).disabled).toBe(true);
  });

  it('subscribes, refreshes the account so the dashboard unlocks, then shows the subscription', async () => {
    renderAt();

    fireEvent.click(await screen.findByRole('button', { name: 'Select Small' }));
    expect(screen.getByText('Subscribe to Small?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm subscribe' }));

    expect(await screen.findByText('Subscription page')).toBeTruthy();
    expect(api.post).toHaveBeenCalledWith('/subscription/select', { plan: 'small' });
    expect(auth.refreshMerchant).toHaveBeenCalled();
  });

  it('lets the merchant pick the custom-priced Enterprise plan', async () => {
    renderAt();

    fireEvent.click(await screen.findByRole('button', { name: 'Select Enterprise' }));
    expect(screen.getByText(/Enterprise \(Custom\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm subscribe' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/subscription/select', { plan: 'enterprise' }));
  });

  it('preselects the plan named in ?plan=', async () => {
    renderAt('/dashboard/subscription/plans?plan=medium');

    expect(await screen.findByText('Subscribe to Medium?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm subscribe' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/subscription/select', { plan: 'medium' }));
  });

  it('ignores an unknown ?plan=', async () => {
    renderAt('/dashboard/subscription/plans?plan=pro');

    await screen.findByRole('group', { name: 'Small plan' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
