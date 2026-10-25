import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, Search, Store } from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { listMerchants } from '../../services/adminApi';
import { AccountStatusBadge, PlanBadge } from './components/AdminBadges';
import MerchantStatusDialog from './components/MerchantStatusDialog';
import Pagination from './components/Pagination';
import { LoadError, PageLoader } from './components/PageStatus';
import { ACCOUNT_STATUSES, PLANS, capitalize, formatDate, formatUsage } from './adminFormat';

const PAGE_SIZE = 10;

// Only filters that are set go in the query string.
function queryParams({ search, plan, status }, page) {
  const params = { page, limit: PAGE_SIZE };
  if (search) params.search = search;
  if (plan) params.plan = plan;
  if (status) params.status = status;
  return params;
}

function AdminMerchantsPage() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({ search: '', plan: '', status: '' });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [failed, setFailed] = useState(false);
  const [statusTarget, setStatusTarget] = useState(null);

  const load = useCallback(() => {
    setFailed(false);
    listMerchants(queryParams(filters, page))
      .then(setResult)
      .catch(() => setFailed(true));
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  function applyFilter(patch) {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }

  function handleSearch(e) {
    e.preventDefault();
    applyFilter({ search: searchInput.trim() });
  }

  const hasFilters = Boolean(filters.search || filters.plan || filters.status);

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Merchants</h1>
      <p className="mt-1 text-sm text-muted-foreground">Search, review and manage every merchant account.</p>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <form role="search" onSubmit={handleSearch} className="flex min-w-[16rem] flex-1 items-end gap-2">
          <div className="flex-1">
            <Input
              id="merchant-search"
              label="Search"
              type="search"
              placeholder="Business, name or email"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary" icon={<Search size={16} />}>
            Search
          </Button>
        </form>
        <div className="w-40">
          <Select id="plan-filter" label="Plan" value={filters.plan} onChange={(e) => applyFilter({ plan: e.target.value })}>
            <option value="">All plans</option>
            {PLANS.map((plan) => (
              <option key={plan} value={plan}>
                {capitalize(plan)}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select
            id="status-filter"
            label="Status"
            value={filters.status}
            onChange={(e) => applyFilter({ status: e.target.value })}
          >
            <option value="">All statuses</option>
            {ACCOUNT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {capitalize(status)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mt-4">
        {failed ? (
          <LoadError message="Couldn't load merchants." onRetry={load} />
        ) : !result ? (
          <PageLoader />
        ) : result.merchants.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-6 py-14 text-center shadow-card">
            <Store size={36} className="text-muted" />
            <p className="text-sm text-muted-foreground">
              {hasFilters ? 'No merchants match these filters.' : 'No merchants have signed up yet.'}
            </p>
            {hasFilters && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearchInput('');
                  applyFilter({ search: '', plan: '', status: '' });
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-surface-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3">Business</th>
                      <th className="px-4 py-3">Plan</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Usage</th>
                      <th className="px-4 py-3">Joined</th>
                      <th className="px-4 py-3">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.merchants.map((m) => (
                      <tr key={m._id} className="text-foreground transition-colors duration-150 hover:bg-surface-2">
                        <td className="px-4 py-3">
                          <Link to={`/admin/merchants/${m._id}`} className="font-medium">
                            {m.businessName}
                          </Link>
                          <p className="text-xs text-muted-foreground">{m.email}</p>
                        </td>
                        <td className="px-4 py-3">
                          <PlanBadge plan={m.subscription?.plan} />
                        </td>
                        <td className="px-4 py-3">
                          <AccountStatusBadge status={m.status} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatUsage(m.subscription)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(m.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={<Eye size={14} />}
                              onClick={() => navigate(`/admin/merchants/${m._id}`)}
                              aria-label={`View ${m.businessName}`}
                            >
                              View
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setStatusTarget(m)}
                              className={m.status === 'suspended' ? '' : '!text-danger hover:!bg-danger-soft'}
                              aria-label={`${m.status === 'suspended' ? 'Reactivate' : 'Suspend'} ${m.businessName}`}
                            >
                              {m.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <Pagination page={result.page} pages={result.pages} total={result.total} onChange={setPage} />
          </>
        )}
      </div>

      <MerchantStatusDialog merchant={statusTarget} onClose={() => setStatusTarget(null)} onUpdated={load} />
    </div>
  );
}

export default AdminMerchantsPage;
