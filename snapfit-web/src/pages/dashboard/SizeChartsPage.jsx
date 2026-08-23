import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2, Pencil, Trash2, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../../services/api';
import Badge from '../../components/Badge';
import ConfirmModal from '../../components/ConfirmModal';

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
          <h1 className="text-xl font-bold text-gray-900">Size Charts</h1>
          <p className="mt-1 text-sm text-gray-500">Manage the size charts used for fit recommendations.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard/product-mapping"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Product Mapping
          </Link>
          <Link
            to="/dashboard/size-charts/new"
            className="flex items-center gap-1.5 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            <Plus size={16} />
            Create New Chart
          </Link>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <label htmlFor="category-filter" className="text-sm text-gray-600">
          Category
        </label>
        <select
          id="category-filter"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        >
          <option value="">All categories</option>
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-gray-400" size={28} />
          </div>
        ) : charts.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-500">No size charts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">Category</th>
                  <th className="px-6 py-3 font-medium">Gender</th>
                  <th className="px-6 py-3 font-medium"># of Sizes</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium" aria-hidden="true"></th>
                </tr>
              </thead>
              <tbody>
                {charts.map((chart) => (
                  <tr key={chart._id} className="border-b border-gray-50 last:border-0">
                    <td className="px-6 py-3 font-medium text-gray-900">{chart.name}</td>
                    <td className="px-6 py-3 capitalize text-gray-700">{chart.category}</td>
                    <td className="px-6 py-3 capitalize text-gray-700">{chart.gender || '—'}</td>
                    <td className="px-6 py-3 text-gray-700">{chart.sizes.length}</td>
                    <td className="px-6 py-3">
                      <Badge color={chart.isActive ? 'green' : 'gray'}>{chart.isActive ? 'Active' : 'Inactive'}</Badge>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => navigate(`/dashboard/size-charts/${chart._id}/edit`)}
                          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          aria-label={`Edit ${chart.name}`}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(chart)}
                          disabled={!chart.isActive}
                          className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Delete ${chart.name}`}
                        >
                          <Trash2 size={16} />
                        </button>
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
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => load(pagination.page - 1, category)}
              className="flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={14} />
              Prev
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => load(pagination.page + 1, category)}
              className="flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight size={14} />
            </button>
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
