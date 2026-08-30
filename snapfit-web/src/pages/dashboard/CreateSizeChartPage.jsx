import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import api from '../../services/api';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';

const CATEGORY_OPTIONS = ['tops', 'bottoms', 'dresses', 'footwear', 'outerwear'];
const GENDER_OPTIONS = ['male', 'female', 'unisex'];
const MEASUREMENT_FIELDS = [
  { key: 'chest', label: 'Chest' },
  { key: 'waist', label: 'Waist' },
  { key: 'hip', label: 'Hip' },
  { key: 'shoulderWidth', label: 'Shoulder Width' },
  { key: 'torsoLength', label: 'Torso Length' },
  { key: 'inseam', label: 'Inseam' },
];

function emptyMeasurements() {
  const measurements = {};
  MEASUREMENT_FIELDS.forEach(({ key }) => {
    measurements[key] = { min: '', max: '' };
  });
  return measurements;
}

function emptySize() {
  return { label: '', measurements: emptyMeasurements() };
}

function toFormSize(size) {
  const measurements = emptyMeasurements();
  MEASUREMENT_FIELDS.forEach(({ key }) => {
    const range = size.measurements?.[key];
    if (range) {
      measurements[key] = { min: range.min ?? '', max: range.max ?? '' };
    }
  });
  return { label: size.label || '', measurements };
}

function validateForm({ name, category, sizes }) {
  const errors = { name: null, category: null, sizesLength: null, sizes: sizes.map(() => ({})) };

  if (!name.trim()) errors.name = 'Chart name is required';
  if (!category) errors.category = 'Category is required';
  if (sizes.length < 2) errors.sizesLength = 'At least 2 sizes are required';

  sizes.forEach((size, i) => {
    if (!size.label.trim()) {
      errors.sizes[i].label = 'Label is required';
    }
    MEASUREMENT_FIELDS.forEach(({ key }) => {
      const { min, max } = size.measurements[key];
      if (min === '' && max === '') return;
      if (min === '' || max === '') {
        errors.sizes[i][key] = 'Both min and max are required';
      } else if (Number(min) < 0) {
        errors.sizes[i][key] = 'Min cannot be negative';
      } else if (Number(max) <= Number(min)) {
        errors.sizes[i][key] = 'Max must be greater than min';
      }
    });
  });

  return errors;
}

function hasErrors(errors) {
  return Boolean(
    errors.name || errors.category || errors.sizesLength || errors.sizes.some((s) => Object.values(s).some(Boolean))
  );
}

function CreateSizeChartPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [gender, setGender] = useState('');
  const [unit, setUnit] = useState('cm');
  const [sizes, setSizes] = useState([emptySize(), emptySize()]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    api
      .get(`/charts/${id}`)
      .then((res) => {
        const chart = res.data.chart;
        setName(chart.name);
        setCategory(chart.category);
        setGender(chart.gender || '');
        setUnit(chart.unit || 'cm');
        setSizes(chart.sizes.map(toFormSize));
      })
      .catch(() => {
        toast.error('Failed to load size chart');
        navigate('/dashboard/size-charts');
      })
      .finally(() => setLoading(false));
  }, [id, isEdit, navigate]);

  const errors = useMemo(() => validateForm({ name, category, sizes }), [name, category, sizes]);

  function updateSizeLabel(index, label) {
    setSizes((prev) => prev.map((s, i) => (i === index ? { ...s, label } : s)));
  }

  function updateMeasurement(index, key, field, value) {
    setSizes((prev) =>
      prev.map((s, i) =>
        i === index
          ? { ...s, measurements: { ...s.measurements, [key]: { ...s.measurements[key], [field]: value } } }
          : s
      )
    );
  }

  function addSize() {
    setSizes((prev) => [...prev, emptySize()]);
  }

  function removeSize(index) {
    setSizes((prev) => prev.filter((_, i) => i !== index));
  }

  const activeMeasurementKeys = MEASUREMENT_FIELDS.filter(({ key }) =>
    sizes.some((s) => s.measurements[key].min !== '' && s.measurements[key].max !== '')
  );

  async function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);

    if (hasErrors(errors)) {
      setFormError('Please fix the highlighted errors below.');
      toast.error('Please fix the highlighted errors');
      return;
    }

    const payload = {
      name: name.trim(),
      category,
      gender: gender || undefined,
      unit,
      sizes: sizes.map((s) => {
        const measurements = {};
        MEASUREMENT_FIELDS.forEach(({ key }) => {
          const { min, max } = s.measurements[key];
          if (min !== '' && max !== '') {
            measurements[key] = { min: Number(min), max: Number(max) };
          }
        });
        return { label: s.label.trim(), measurements };
      }),
    };

    setSaving(true);
    setFormError('');
    try {
      if (isEdit) {
        await api.put(`/charts/${id}`, payload);
        toast.success('Size chart updated');
      } else {
        await api.post('/charts', payload);
        toast.success('Size chart created');
      }
      navigate('/dashboard/size-charts');
    } catch (err) {
      const data = err.response?.data;
      const message = data?.errors ? data.errors.join(' • ') : data?.message || 'Failed to save size chart';
      setFormError(message);
      toast.error(data?.errors ? 'Please fix the errors below' : message);
    } finally {
      setSaving(false);
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
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold text-ink-900">{isEdit ? 'Edit Size Chart' : 'Create Size Chart'}</h1>

      <form onSubmit={handleSubmit} noValidate>
        {formError && <Alert variant="danger" description={formError} className="mt-4" />}

        <Card className="mt-6">
          <Card.Header>
            <h2 className="text-sm font-semibold text-ink-900">Basic info</h2>
          </Card.Header>
          <Card.Body>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                id="chart-name"
                label="Chart Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                error={touched && errors.name}
              />

              <Select
                id="chart-category"
                label="Category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                error={touched && errors.category}
              >
                <option value="">Select a category</option>
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </option>
                ))}
              </Select>

              <Select id="chart-gender" label="Gender" value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">Not specified</option>
                {GENDER_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </option>
                ))}
              </Select>

              <Select id="chart-unit" label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="cm">Centimeters (cm)</option>
                <option value="inches">Inches</option>
              </Select>
            </div>
          </Card.Body>
        </Card>

        <Card className="mt-6">
          <Card.Header>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-900">Sizes</h2>
              {touched && errors.sizesLength && <p className="text-xs text-danger">{errors.sizesLength}</p>}
            </div>
          </Card.Header>
          <Card.Body>
            <div className="space-y-4">
              {sizes.map((size, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <div key={index} className="rounded-lg border border-surface-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="max-w-[10rem] flex-1">
                      <Input
                        id={`size-${index}-label`}
                        label="Size Label"
                        value={size.label}
                        onChange={(e) => updateSizeLabel(index, e.target.value)}
                        placeholder="e.g. S, M, L"
                        error={touched && errors.sizes[index]?.label}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={16} />}
                      onClick={() => removeSize(index)}
                      disabled={sizes.length <= 2}
                      className="mt-6 hover:!bg-danger-bg hover:!text-danger"
                      aria-label={`Remove size ${index + 1}`}
                    />
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {MEASUREMENT_FIELDS.map(({ key, label }) => {
                      const fieldError = touched && errors.sizes[index]?.[key];
                      return (
                        <div key={key}>
                          <p className="mb-1 text-sm font-medium text-ink-700">
                            {label} ({unit})
                          </p>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              value={size.measurements[key].min}
                              onChange={(e) => updateMeasurement(index, key, 'min', e.target.value)}
                              placeholder="min"
                              error={Boolean(fieldError)}
                              aria-label={`${label} minimum`}
                            />
                            <span className="shrink-0 text-xs text-ink-500">to</span>
                            <Input
                              type="number"
                              value={size.measurements[key].max}
                              onChange={(e) => updateMeasurement(index, key, 'max', e.target.value)}
                              placeholder="max"
                              error={Boolean(fieldError)}
                              aria-label={`${label} maximum`}
                            />
                          </div>
                          {fieldError && <p className="mt-1 text-xs text-danger">{fieldError}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <Button variant="ghost" size="sm" icon={<Plus size={16} />} onClick={addSize} className="mt-4">
              Add Size
            </Button>
          </Card.Body>
        </Card>

        <Card className="mt-6">
          <Card.Header>
            <h2 className="text-sm font-semibold text-ink-900">Preview</h2>
          </Card.Header>
          <Card.Body>
            {activeMeasurementKeys.length === 0 ? (
              <p className="text-sm text-ink-500">Add measurements above to see a preview.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-surface-border text-xs uppercase tracking-wide text-ink-500">
                      <th className="py-2 pr-4 font-medium">Size</th>
                      {activeMeasurementKeys.map(({ key, label }) => (
                        <th key={key} className="py-2 pr-4 font-medium">
                          {label} ({unit})
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {sizes.map((size, index) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <tr key={index}>
                        <td className="py-2 pr-4 font-medium text-ink-900">{size.label || `#${index + 1}`}</td>
                        {activeMeasurementKeys.map(({ key }) => {
                          const { min, max } = size.measurements[key];
                          return (
                            <td key={key} className="py-2 pr-4 text-ink-700">
                              {min !== '' && max !== '' ? `${min}–${max}` : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card.Body>
        </Card>

        <div className="sticky bottom-0 mt-6 flex justify-end gap-3 border-t border-surface-border bg-surface-page py-4">
          <Button type="button" variant="secondary" onClick={() => navigate('/dashboard/size-charts')} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {isEdit ? 'Save changes' : 'Create chart'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default CreateSizeChartPage;
