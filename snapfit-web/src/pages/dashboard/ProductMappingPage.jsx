import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import api from '../../services/api';
import Badge from '../../components/Badge';
import ConfirmModal from '../../components/ConfirmModal';

const initialForm = { productId: '', productName: '', sizeChartId: '' };

function ProductMappingPage() {
  const [charts, setCharts] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return Promise.all([api.get('/charts', { params: { limit: 100 } }), api.get('/products/mappings')])
      .then(([chartsRes, mappingsRes]) => {
        setCharts(chartsRes.data.charts.filter((c) => c.isActive));
        setMappings(mappingsRes.data.mappings);
      })
      .catch(() => toast.error('Failed to load product mappings'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.productId.trim() || !form.sizeChartId) {
      toast.error('Product ID and size chart are required');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/products/map', form);
      toast.success('Product mapped');
      setForm(initialForm);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to map product');
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await api.delete(`/products/map/${removeTarget._id}`);
      toast.success('Mapping removed');
      setRemoveTarget(null);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove mapping');
    } finally {
      setRemoving(false);
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
      <h1 className="text-xl font-bold text-gray-900">Product Mapping</h1>
      <p className="mt-1 text-sm text-gray-500">
        Link products from your store to a size chart. Product IDs come from your own e-commerce system.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">Map a product</h2>
            <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="mapping-productId" className="block text-sm font-medium text-gray-700">
                  Product ID
                </label>
                <input
                  id="mapping-productId"
                  name="productId"
                  value={form.productId}
                  onChange={handleChange}
                  placeholder="e.g. SKU-1029"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
              </div>
              <div>
                <label htmlFor="mapping-productName" className="block text-sm font-medium text-gray-700">
                  Product Name (optional)
                </label>
                <input
                  id="mapping-productName"
                  name="productName"
                  value={form.productName}
                  onChange={handleChange}
                  placeholder="e.g. Classic Crew Tee"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="mapping-sizeChartId" className="block text-sm font-medium text-gray-700">
                  Size Chart
                </label>
                <select
                  id="mapping-sizeChartId"
                  name="sizeChartId"
                  value={form.sizeChartId}
                  onChange={handleChange}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                >
                  <option value="">Select a size chart</option>
                  {charts.map((chart) => (
                    <option key={chart._id} value={chart._id}>
                      {chart.name} ({chart.category})
                    </option>
                  ))}
                </select>
                {charts.length === 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    You don&apos;t have any size charts yet.{' '}
                    <Link to="/dashboard/size-charts/new" className="font-medium text-gray-900 underline">
                      Create one
                    </Link>
                    .
                  </p>
                )}
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={submitting || charts.length === 0}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? 'Mapping...' : 'Map'}
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-sm font-semibold text-gray-900">Existing mappings</h2>
            </div>
            {mappings.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-gray-500">No products mapped yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                      <th className="px-6 py-3 font-medium">Product ID</th>
                      <th className="px-6 py-3 font-medium">Product Name</th>
                      <th className="px-6 py-3 font-medium">Size Chart</th>
                      <th className="px-6 py-3 font-medium">Try-On</th>
                      <th className="px-6 py-3 font-medium" aria-hidden="true"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.map((mapping) => (
                      <tr key={mapping._id} className="border-b border-gray-50 last:border-0">
                        <td className="px-6 py-3 font-mono text-xs text-gray-700">{mapping.productId}</td>
                        <td className="px-6 py-3 text-gray-700">{mapping.productName || '—'}</td>
                        <td className="px-6 py-3 text-gray-700">
                          {mapping.sizeChartId?.name || <span className="text-gray-400">Chart deleted</span>}
                        </td>
                        <td className="px-6 py-3">
                          <Link
                            to={`/dashboard/product-mapping/${mapping._id}/anchor-points`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 underline hover:text-gray-900"
                          >
                            <ImagePlus size={13} />
                            {mapping.anchorPoints ? 'Edit points' : 'Set up'}
                          </Link>
                        </td>
                        <td className="px-6 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setRemoveTarget(mapping)}
                            className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            aria-label={`Remove mapping for ${mapping.productId}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Your size charts</h2>
          {charts.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">No active size charts yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {charts.map((chart) => (
                <li key={chart._id} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-900">{chart.name}</span>
                    <Badge color="blue">{chart.category}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {chart.sizes.length} size{chart.sizes.length === 1 ? '' : 's'}
                    {chart.gender ? ` · ${chart.gender}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ConfirmModal
        open={Boolean(removeTarget)}
        title="Remove this mapping?"
        description={
          removeTarget ? `"${removeTarget.productId}" will no longer use a size chart for recommendations.` : ''
        }
        confirmLabel="Yes, remove"
        tone="danger"
        loading={removing}
        onConfirm={confirmRemove}
        onClose={() => !removing && setRemoveTarget(null)}
      />
    </div>
  );
}

export default ProductMappingPage;
