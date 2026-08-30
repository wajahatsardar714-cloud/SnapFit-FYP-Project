import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Ruler, Trash2 } from 'lucide-react';
import api from '../../services/api';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import ConfirmModal from '../../components/ui/ConfirmModal';

const CATEGORY_OPTIONS = ['tops', 'bottoms', 'dresses', 'footwear', 'outerwear'];
const PAGE_SIZE = 10;

function SizeChartsPage() {
  const navigate = useNavigate();
  const [charts, setCharts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback((page, categoryFilter) => {
    setLoading(true);
    const params = { page, limit: PAGE_SIZE };
    if (categoryFilter) params.category = categoryFilter;
    return api
      .get('/charts', { params })
      .then((res) => {
        setCharts(res.data.charts);
        setPagination(res.data.pagination);
      })
      .catch(() => toast.error('Failed to load size charts'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(1, category);
  }, [load, category]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/charts/${deleteTarget._id}`);
      toast.success('Size chart deleted');
      setDeleteTarget(null);
      await load(pagination.page, category);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete size chart');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Size Charts</h1>
          <p className="mt-1 text-sm text-ink-500">Manage the size charts used for fit recommendations.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/dashboard/product-mapping">
            <Button variant="secondary">Product Mapping</Button>
          </Link>
          <Link to="/dashboard/size-charts/new">
            <Button icon={<Plus size={16} />}>Create New Chart</Button>
          </Link>
        </div>
      </div>

      <div className="mt-6 max-w-xs">
        <Select
          id="category-filter"
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-surface-border bg-surface-card shadow-card">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-ink-300" size={28} />
          </div>
        ) : charts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <Ruler size={36} className="text-ink-300" />
            {category ? (
              <>
                <p className="text-sm text-ink-500">No charts match this category.</p>
                <Button variant="secondary" size="sm" onClick={() => setCategory('')}>
                  Clear filter
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-ink-500">No size charts yet.</p>
                <Link to="/dashboard/size-charts/new">
                  <Button icon={<Plus size={16} />}>Create your first size chart</Button>
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs font-medium uppercase tracking-wide text-ink-500">
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Category</th>
                  <th className="px-6 py-3">Gender</th>
                  <th className="px-6 py-3"># of Sizes</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3" aria-hidden="true"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {charts.map((chart) => (
                  <tr key={chart._id} className="text-sm text-ink-700 transition-colors duration-150 hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-ink-900">{chart.name}</td>
                    <td className="px-6 py-3 capitalize">{chart.category}</td>
                    <td className="px-6 py-3 capitalize">{chart.gender || '—'}</td>
                    <td className="px-6 py-3">{chart.sizes.length}</td>
                    <td className="px-6 py-3">
                      <Badge variant={chart.isActive ? 'success' : 'neutral'}>
                        {chart.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Pencil size={15} />}
                          onClick={() => navigate(`/dashboard/size-charts/${chart._id}/edit`)}
                          aria-label={`Edit ${chart.name}`}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Trash2 size={15} />}
                          onClick={() => setDeleteTarget(chart)}
                          disabled={!chart.isActive}
                          className="hover:!bg-danger-bg hover:!text-danger"
                          aria-label={`Delete ${chart.name}`}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pagination.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-ink-500">
          <span>
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<ChevronLeft size={14} />}
              disabled={pagination.page <= 1}
              onClick={() => load(pagination.page - 1, category)}
            >
              Prev
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => load(pagination.page + 1, category)}
            >
              Next
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete this size chart?"
        description={
          deleteTarget ? `"${deleteTarget.name}" will be marked inactive and hidden from product mapping.` : ''
        }
        confirmLabel="Yes, delete"
        tone="danger"
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => !deleting && setDeleteTarget(null)}
      />
    </div>
  );
}

export default SizeChartsPage;
