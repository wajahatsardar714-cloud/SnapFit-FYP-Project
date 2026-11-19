import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Code2, ImageOff, ImagePlus, Link2, Loader2, MapPin, Pencil, Search, Trash2 } from 'lucide-react';
import api from '../../services/api';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Alert from '../../components/ui/Alert';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { FIELD_LABEL_CLASSES } from '../../components/ui/fieldStyles';
import { PageSkeleton } from '../../components/ui/Skeleton';
import {
  PRODUCT_IMAGE_ACCEPT,
  PRODUCT_IMAGE_HINT,
  TRY_ON_STATUS,
  resolveProductImageUrl,
  validateProductImageFile,
} from '../../utils/productImage';
import { buildWidgetSnippet } from '../../utils/widgetSnippet';

// Matches the backend's mapping.garmentLength values (default regular).
const GARMENT_LENGTHS = {
  cropped: { label: 'Cropped', ends: 'ends at the waist' },
  regular: { label: 'Regular', ends: 'ends at the hips' },
  long: { label: 'Long', ends: 'ends at mid-thigh' },
};

// Matches the backend's mapping.sleeveLength values (default short).
const SLEEVE_LENGTHS = {
  none: { label: 'None', hint: 'sleeveless' },
  short: { label: 'Short', hint: 'half sleeves' },
  long: { label: 'Long', hint: 'full sleeves' },
};

const initialForm = { productId: '', productName: '', sizeChartId: '', garmentLength: 'regular', sleeveLength: 'short' };

function matchesSearch(mapping, query) {
  return (
    mapping.productId.toLowerCase().includes(query) || (mapping.productName || '').toLowerCase().includes(query)
  );
}

function validateMappingForm({ productId, sizeChartId }) {
  const errors = {};
  if (!productId.trim()) errors.productId = 'Product ID is required';
  if (!sizeChartId) errors.sizeChartId = 'Size chart is required';
  return errors;
}

const anchorPointsPath = (mapping) => `/dashboard/product-mapping/${mapping._id}/anchor-points`;

// The one thing still stopping try-on for this product, if any.
function nextTryOnStep(statusKey) {
  if (statusKey === 'image_missing') return 'image';
  if (statusKey === 'anchors_missing') return 'anchors';
  return null;
}

const NEXT_STEP_CLASSES =
  'inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-0.5 text-xs font-semibold text-primary transition-colors duration-150 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50';

function TryOnCell({ mapping, busy, onUpload, onRemoveImage }) {
  const fileInputRef = useRef(null);
  const statusKey = TRY_ON_STATUS[mapping.tryOnStatus] ? mapping.tryOnStatus : 'image_missing';
  const status = TRY_ON_STATUS[statusKey];
  const nextStep = nextTryOnStep(statusKey);
  const imageUrl = resolveProductImageUrl(mapping.productImage);

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-2">
        {imageUrl ? (
          <img src={imageUrl} alt={`${mapping.productId} product`} className="h-full w-full object-contain" />
        ) : (
          <ImageOff size={18} className="text-muted" aria-hidden="true" />
        )}
      </div>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={status.variant}>{status.label}</Badge>
          {nextStep === 'image' && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className={NEXT_STEP_CLASSES}
              aria-label={`Add image for ${mapping.productId}`}
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
              Add image
            </button>
          )}
          {nextStep === 'anchors' && (
            <Link
              to={anchorPointsPath(mapping)}
              className={NEXT_STEP_CLASSES}
              aria-label={`Set anchor points for ${mapping.productId}`}
            >
              <MapPin size={13} />
              Set anchor points
            </Link>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={PRODUCT_IMAGE_ACCEPT}
          className="hidden"
          disabled={busy}
          aria-label={`Product image for ${mapping.productId}`}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onUpload(mapping, file);
          }}
        />
        {imageUrl && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium">
            {nextStep !== 'image' && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="inline-flex items-center gap-1 text-primary underline disabled:pointer-events-none disabled:opacity-50"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
                Replace image
              </button>
            )}
            {!nextStep && (
              <Link to={anchorPointsPath(mapping)} className="inline-flex items-center gap-1 text-primary underline">
                <MapPin size={13} />
                Edit points
              </Link>
            )}
            <button
              type="button"
              onClick={() => onRemoveImage(mapping)}
              disabled={busy}
              className="text-muted-foreground underline hover:text-danger"
            >
              Remove image
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProductMappingPage() {
  const navigate = useNavigate();
  const [charts, setCharts] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [busyImageId, setBusyImageId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const formRef = useRef(null);

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
    setEditingId(null);
    setImageFile(null);
    setFieldErrors({});
    setFormError('');
  }

  function startEdit(mapping) {
    const chartId = mapping.sizeChartId?._id || mapping.sizeChartId || '';
    setForm({
      productId: mapping.productId,
      productName: mapping.productName || '',
      // A deleted (inactive) chart is not in the list, so the merchant picks a live one.
      sizeChartId: charts.some((c) => c._id === chartId) ? chartId : '',
      garmentLength: mapping.garmentLength || 'regular',
      sleeveLength: mapping.sleeveLength || 'short',
    });
    setEditingId(mapping._id);
    setImageFile(null);
    setFieldErrors({});
    setFormError('');
    formRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    document.getElementById('mapping-productName')?.focus();
  }

  async function copyWidgetCode(mapping) {
    try {
      await navigator.clipboard.writeText(buildWidgetSnippet(mapping.productId));
      toast.success('Widget code copied');
    } catch {
      toast.error('Could not copy the widget code');
    }
  }

  function handleImageSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const problem = validateProductImageFile(file);
    setFieldErrors((prev) => ({ ...prev, image: problem || undefined }));
    if (!problem) setImageFile(file);
  }

  async function uploadImage(mapping, file) {
    const problem = validateProductImageFile(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusyImageId(mapping._id);
    try {
      const formData = new FormData();
      formData.append('image', file);
      await api.put(`/products/${mapping._id}/image`, formData);
      toast.success('Image saved — now place the 4 anchor points');
      navigate(anchorPointsPath(mapping));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to upload image');
    } finally {
      setBusyImageId(null);
    }
  }

  async function removeImage(mapping) {
    setBusyImageId(mapping._id);
    try {
      await api.delete(`/products/${mapping._id}/image`);
      toast.success('Image removed');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove image');
    } finally {
      setBusyImageId(null);
    }
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
      let payload = form;
      if (imageFile) {
        payload = new FormData();
        Object.entries(form).forEach(([key, value]) => payload.append(key, value));
        payload.append('image', imageFile);
      }
      const res = await api.post('/products/map', payload);
      const wasEditing = Boolean(editingId);
      if (wasEditing) {
        resetForm();
      } else {
        // Keep the chart and lengths so the next similar product is quick to map.
        const { sizeChartId, garmentLength, sleeveLength } = form;
        setForm({ ...initialForm, sizeChartId, garmentLength, sleeveLength });
        setImageFile(null);
      }
      const saved = wasEditing ? 'Changes saved' : 'Product mapped';
      if (imageFile) {
        toast.success(`${saved} — now place the 4 anchor points`);
        navigate(anchorPointsPath(res.data.mapping));
        return;
      }
      toast.success(saved);
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
      if (editingId === removeTarget._id) resetForm();
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
      <PageSkeleton />
    );
  }

  const trimmedProductId = form.productId.trim();
  const existingMapping =
    !editingId && trimmedProductId ? mappings.find((m) => m.productId === trimmedProductId) : null;
  const query = search.trim().toLowerCase();
  const visibleMappings = query ? mappings.filter((m) => matchesSearch(m, query)) : mappings;

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Product Mapping</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Link products from your store to a size chart. Product IDs come from your own e-commerce system.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <Card.Header>
              <h2 className="text-sm font-semibold text-foreground">
                {editingId ? `Edit mapping for ${form.productId}` : 'Map a product'}
              </h2>
            </Card.Header>
            <Card.Body>
              {formError && <Alert variant="danger" description={formError} className="mb-4" />}
              <form
                ref={formRef}
                onSubmit={handleSubmit}
                aria-label={editingId ? 'Edit product mapping' : 'Map a product'}
                className="grid scroll-mt-6 grid-cols-1 gap-4 sm:grid-cols-2"
              >
                <div>
                  <Input
                    id="mapping-productId"
                    name="productId"
                    label="Product ID"
                    value={form.productId}
                    onChange={handleChange}
                    placeholder="e.g. SKU-1029"
                    error={fieldErrors.productId}
                    readOnly={Boolean(editingId)}
                    className="read-only:bg-surface-2 read-only:text-muted-foreground"
                    hint={
                      editingId
                        ? 'The product ID cannot be changed while editing.'
                        : 'Use the same product ID or SKU as in your store.'
                    }
                  />
                  {existingMapping && (
                    <p role="status" className="mt-1 text-xs font-medium text-warning">
                      This product is already mapped — saving will update it.{' '}
                      <button
                        type="button"
                        onClick={() => startEdit(existingMapping)}
                        className="font-semibold text-primary underline"
                      >
                        Edit it instead
                      </button>
                    </p>
                  )}
                </div>
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
                    <p className="mt-1 text-xs text-muted-foreground">
                      You don&apos;t have any size charts yet.{' '}
                      <Link to="/dashboard/size-charts/new" className="font-medium text-primary underline">
                        Create one
                      </Link>
                      .
                    </p>
                  )}
                </div>
                <div>
                  <Select
                    id="mapping-garmentLength"
                    name="garmentLength"
                    label="Garment length"
                    value={form.garmentLength}
                    onChange={handleChange}
                  >
                    {Object.entries(GARMENT_LENGTHS).map(([value, { label, ends }]) => (
                      <option key={value} value={value}>
                        {label} — {ends}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Try-on replaces the shopper&apos;s own top down to this length.
                  </p>
                </div>
                <div>
                  <Select
                    id="mapping-sleeveLength"
                    name="sleeveLength"
                    label="Sleeve length"
                    value={form.sleeveLength}
                    onChange={handleChange}
                  >
                    {Object.entries(SLEEVE_LENGTHS).map(([value, { label, hint }]) => (
                      <option key={value} value={value}>
                        {label} — {hint}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Try-on replaces the shopper&apos;s own sleeves down to this length.
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <span className={FIELD_LABEL_CLASSES}>Product image (optional, for try-on)</span>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border px-4 py-3 text-sm transition-colors duration-150 hover:border-primary">
                    <ImagePlus size={18} className="shrink-0 text-muted" />
                    <span className="truncate text-foreground">{imageFile ? imageFile.name : 'Choose a flat-lay photo'}</span>
                    <input
                      id="mapping-image"
                      type="file"
                      accept={PRODUCT_IMAGE_ACCEPT}
                      className="hidden"
                      onChange={handleImageSelected}
                    />
                  </label>
                  {fieldErrors.image ? (
                    <p className="mt-1 text-xs text-danger">{fieldErrors.image}</p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">{PRODUCT_IMAGE_HINT}</p>
                  )}
                </div>
                <div className="flex justify-end gap-3 sm:col-span-2">
                  <Button type="button" variant="secondary" onClick={resetForm} disabled={submitting}>
                    {editingId ? 'Cancel edit' : 'Cancel'}
                  </Button>
                  <Button type="submit" loading={submitting} disabled={charts.length === 0}>
                    {editingId ? 'Save changes' : 'Map'}
                  </Button>
                </div>
              </form>
            </Card.Body>
          </Card>

          <Card>
            <Card.Header>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-foreground">Existing mappings</h2>
                {mappings.length > 0 && (
                  <div className="relative w-full sm:w-64">
                    <Search
                      size={15}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                      aria-hidden="true"
                    />
                    <Input
                      id="mapping-search"
                      type="search"
                      aria-label="Search mappings"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by product ID or name"
                      className="pl-9"
                    />
                  </div>
                )}
              </div>
            </Card.Header>
            {mappings.length === 0 ? (
              <Card.Body>
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <Link2 size={36} className="text-muted" />
                  <p className="text-sm text-muted-foreground">No products mapped yet.</p>
                </div>
              </Card.Body>
            ) : visibleMappings.length === 0 ? (
              <Card.Body>
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <Search size={36} className="text-muted" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">No mappings match &ldquo;{search.trim()}&rdquo;.</p>
                  <Button variant="secondary" size="sm" onClick={() => setSearch('')}>
                    Clear search
                  </Button>
                </div>
              </Card.Body>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-surface-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <th className="px-6 py-3">Product ID</th>
                      <th className="px-6 py-3">Product Name</th>
                      <th className="px-6 py-3">Size Chart</th>
                      <th className="px-6 py-3">Length</th>
                      <th className="px-6 py-3">Sleeves</th>
                      <th className="px-6 py-3">Try-On</th>
                      <th className="px-6 py-3" aria-hidden="true"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visibleMappings.map((mapping) => (
                      <tr
                        key={mapping._id}
                        className="text-sm text-foreground transition-colors duration-150 hover:bg-surface-2"
                      >
                        <td className="px-6 py-3 font-mono text-xs">{mapping.productId}</td>
                        <td className="px-6 py-3">{mapping.productName || '—'}</td>
                        <td className="px-6 py-3">
                          {mapping.sizeChartId?.name || <span className="text-muted">Chart deleted</span>}
                        </td>
                        <td className="px-6 py-3 text-muted-foreground">
                          {(GARMENT_LENGTHS[mapping.garmentLength] || GARMENT_LENGTHS.regular).label}
                        </td>
                        <td className="px-6 py-3 text-muted-foreground">
                          {(SLEEVE_LENGTHS[mapping.sleeveLength] || SLEEVE_LENGTHS.short).label}
                        </td>
                        <td className="px-6 py-3">
                          <TryOnCell
                            mapping={mapping}
                            busy={busyImageId === mapping._id}
                            onUpload={uploadImage}
                            onRemoveImage={removeImage}
                          />
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={<Pencil size={15} />}
                              onClick={() => startEdit(mapping)}
                              title="Edit"
                              aria-label={`Edit mapping for ${mapping.productId}`}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={<Code2 size={15} />}
                              onClick={() => copyWidgetCode(mapping)}
                              title="Copy widget code"
                              aria-label={`Copy widget code for ${mapping.productId}`}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={<Trash2 size={15} />}
                              onClick={() => setRemoveTarget(mapping)}
                              className="hover:!bg-danger-soft hover:!text-danger"
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
          <h2 className="text-sm font-semibold text-foreground">Your size charts</h2>
          {charts.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No active size charts yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {charts.map((chart) => (
                <li key={chart._id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{chart.name}</span>
                    <Badge variant="info">{chart.category}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
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
