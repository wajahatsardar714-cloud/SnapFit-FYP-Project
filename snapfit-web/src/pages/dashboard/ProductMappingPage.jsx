import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ImagePlus, Link2, Loader2, Trash2 } from 'lucide-react';
import api from '../../services/api';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Alert from '../../components/ui/Alert';
import ConfirmModal from '../../components/ui/ConfirmModal';

const initialForm = { productId: '', productName: '', sizeChartId: '' };

function validateMappingForm({ productId, sizeChartId }) {
  const errors = {};
  if (!productId.trim()) errors.productId = 'Product ID is required';
  if (!sizeChartId) errors.sizeChartId = 'Size chart is required';
  return errors;
}

function ProductMappingPage() {
  const [charts, setCharts] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
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
    setFieldErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  }

  function resetForm() {
    setForm(initialForm);
    setFieldErrors({});
    setFormError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const errors = validateMappingForm(form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError('Please fix the highlighted errors below.');
      toast.error('Product ID and size chart are required');
      return;
    }

    setFieldErrors({});
    setFormError('');
    setSubmitting(true);
    try {
      await api.post('/products/map', form);
      toast.success('Product mapped');
      setForm(initialForm);
      await load();
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to map product';
      setFormError(message);
      toast.error(message);
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
        <Loader2 className="animate-spin text-ink-300" size={28} />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-ink-900">Product Mapping</h1>
      <p className="mt-1 text-sm text-ink-500">
        Link products from your store to a size chart. Product IDs come from your own e-commerce system.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <Card.Header>
              <h2 className="text-sm font-semibold text-ink-900">Map a product</h2>
            </Card.Header>
            <Card.Body>
              {formError && <Alert variant="danger" description={formError} className="mb-4" />}
              <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  id="mapping-productId"
                  name="productId"
                  label="Product ID"
                  value={form.productId}
                  onChange={handleChange}
                  placeholder="e.g. SKU-1029"
                  error={fieldErrors.productId}
                />
                <Input
                  id="mapping-productName"
                  name="productName"
                  label="Product Name (optional)"
                  value={form.productName}
                  onChange={handleChange}
                  placeholder="e.g. Classic Crew Tee"
                />
                <div className="sm:col-span-2">
                  <Select
                    id="mapping-sizeChartId"
                    name="sizeChartId"
                    label="Size Chart"
                    value={form.sizeChartId}
                    onChange={handleChange}
                    error={fieldErrors.sizeChartId}
                  >
                    <option value="">Select a size chart</option>
                    {charts.map((chart) => (
                      <option key={chart._id} value={chart._id}>
                        {chart.name} ({chart.category})
                      </option>
                    ))}
                  </Select>
                  {charts.length === 0 && (
                    <p className="mt-1 text-xs text-ink-500">
                      You don&apos;t have any size charts yet.{' '}
                      <Link to="/dashboard/size-charts/new" className="font-medium text-primary underline">
                        Create one
                      </Link>
                      .
                    </p>
                  )}
                </div>
                <div className="flex justify-end gap-3 sm:col-span-2">
                  <Button type="button" variant="secondary" onClick={resetForm} disabled={submitting}>
                    Cancel
                  </Button>
                  <Button type="submit" loading={submitting} disabled={charts.length === 0}>
                    Map
                  </Button>
                </div>
              </form>
            </Card.Body>
          </Card>

          <Card>
            <Card.Header>
              <h2 className="text-sm font-semibold text-ink-900">Existing mappings</h2>
            </Card.Header>
            {mappings.length === 0 ? (
              <Card.Body>
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <Link2 size={36} className="text-ink-300" />
                  <p className="text-sm text-ink-500">No products mapped yet.</p>
                </div>
              </Card.Body>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs font-medium uppercase tracking-wide text-ink-500">
                      <th className="px-6 py-3">Product ID</th>
                      <th className="px-6 py-3">Product Name</th>
                      <th className="px-6 py-3">Size Chart</th>
                      <th className="px-6 py-3">Try-On</th>
                      <th className="px-6 py-3" aria-hidden="true"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {mappings.map((mapping) => (
                      <tr
                        key={mapping._id}
                        className="text-sm text-ink-700 transition-colors duration-150 hover:bg-gray-50"
                      >
                        <td className="px-6 py-3 font-mono text-xs">{mapping.productId}</td>
                        <td className="px-6 py-3">{mapping.productName || '—'}</td>
                        <td className="px-6 py-3">
                          {mapping.sizeChartId?.name || <span className="text-ink-300">Chart deleted</span>}
                        </td>
                        <td className="px-6 py-3">
                          <Link
                            to={`/dashboard/product-mapping/${mapping._id}/anchor-points`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary underline"
                          >
                            <ImagePlus size={13} />
                            {mapping.anchorPoints ? 'Edit points' : 'Set up'}
                          </Link>
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={<Trash2 size={15} />}
                              onClick={() => setRemoveTarget(mapping)}
                              className="hover:!bg-danger-bg hover:!text-danger"
                              aria-label={`Remove mapping for ${mapping.productId}`}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <Card>
          <h2 className="text-sm font-semibold text-ink-900">Your size charts</h2>
          {charts.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">No active size charts yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {charts.map((chart) => (
                <li key={chart._id} className="rounded-lg border border-surface-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink-900">{chart.name}</span>
                    <Badge variant="info">{chart.category}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {chart.sizes.length} size{chart.sizes.length === 1 ? '' : 's'}
                    {chart.gender ? ` · ${chart.gender}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
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
