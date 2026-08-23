import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import api from '../../services/api';

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

function fieldClass(hasError) {
  return `w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 ${
    hasError
      ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
      : 'border-gray-300 focus:border-gray-900 focus:ring-gray-900'
  }`;
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
  const [serverErrors, setServerErrors] = useState([]);
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
    setServerErrors([]);
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
      if (data?.errors) {
        setServerErrors(data.errors);
        toast.error('Please fix the errors below');
      } else {
        toast.error(data?.message || 'Failed to save size chart');
      }
    } finally {
      setSaving(false);
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
    <div className="max-w-4xl">
      <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Edit Size Chart' : 'Create Size Chart'}</h1>

      <form onSubmit={handleSubmit} noValidate>
        {serverErrors.length > 0 && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <ul className="list-inside list-disc space-y-0.5">
              {serverErrors.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:grid-cols-2">
          <div>
            <label htmlFor="chart-name" className="block text-sm font-medium text-gray-700">
              Chart Name
            </label>
            <input
              id="chart-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldClass(touched && errors.name)}
            />
            {touched && errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
          </div>

          <div>
            <label htmlFor="chart-category" className="block text-sm font-medium text-gray-700">
              Category
            </label>
            <select
              id="chart-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={fieldClass(touched && errors.category)}
            >
              <option value="">Select a category</option>
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </option>
              ))}
            </select>
            {touched && errors.category && <p className="mt-1 text-xs text-red-500">{errors.category}</p>}
          </div>

          <div>
            <label htmlFor="chart-gender" className="block text-sm font-medium text-gray-700">
              Gender
            </label>
            <select
              id="chart-gender"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className={fieldClass(false)}
            >
              <option value="">Not specified</option>
              {GENDER_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="chart-unit" className="block text-sm font-medium text-gray-700">
              Unit
            </label>
            <select id="chart-unit" value={unit} onChange={(e) => setUnit(e.target.value)} className={fieldClass(false)}>
              <option value="cm">Centimeters (cm)</option>
              <option value="inches">Inches</option>
            </select>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Sizes</h2>
            {touched && errors.sizesLength && <p className="text-xs text-red-500">{errors.sizesLength}</p>}
          </div>

          <div className="mt-4 space-y-4">
            {sizes.map((size, index) => (
              <div key={index} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <label htmlFor={`size-${index}-label`} className="block text-xs font-medium text-gray-700">
                      Size Label
                    </label>
                    <input
                      id={`size-${index}-label`}
                      value={size.label}
                      onChange={(e) => updateSizeLabel(index, e.target.value)}
                      placeholder="e.g. S, M, L"
                      className={`mt-1 ${fieldClass(touched && errors.sizes[index]?.label)} max-w-[10rem]`}
                    />
                    {touched && errors.sizes[index]?.label && (
                      <p className="mt-1 text-xs text-red-500">{errors.sizes[index].label}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSize(index)}
                    disabled={sizes.length <= 2}
                    className="mt-4 shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label={`Remove size ${index + 1}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {MEASUREMENT_FIELDS.map(({ key, label }) => {
                    const fieldError = touched && errors.sizes[index]?.[key];
                    return (
                      <div key={key}>
                        <label htmlFor={`size-${index}-${key}-min`} className="block text-xs font-medium text-gray-500">
                          {label} ({unit})
                        </label>
                        <div className="mt-1 flex items-center gap-1">
                          <input
                            id={`size-${index}-${key}-min`}
                            type="number"
                            value={size.measurements[key].min}
                            onChange={(e) => updateMeasurement(index, key, 'min', e.target.value)}
                            placeholder="min"
                            className={fieldClass(fieldError)}
                          />
                          <span className="text-gray-400">–</span>
                          <input
                            id={`size-${index}-${key}-max`}
                            type="number"
                            value={size.measurements[key].max}
                            onChange={(e) => updateMeasurement(index, key, 'max', e.target.value)}
                            placeholder="max"
                            className={fieldClass(fieldError)}
                          />
                        </div>
                        {fieldError && <p className="mt-1 text-xs text-red-500">{fieldError}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addSize}
            className="mt-4 flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <Plus size={16} />
            Add Size
          </button>
        </div>

        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Preview</h2>
          {activeMeasurementKeys.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">Add measurements above to see a preview.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                    <th className="py-2 pr-4 font-medium">Size</th>
                    {activeMeasurementKeys.map(({ key, label }) => (
                      <th key={key} className="py-2 pr-4 font-medium">
                        {label} ({unit})
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sizes.map((size, index) => (
                    <tr key={index} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 pr-4 font-medium text-gray-900">{size.label || `#${index + 1}`}</td>
                      {activeMeasurementKeys.map(({ key }) => {
                        const { min, max } = size.measurements[key];
                        return (
                          <td key={key} className="py-2 pr-4 text-gray-700">
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
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Chart'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/dashboard/size-charts')}
            disabled={saving}
            className="rounded-md border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default CreateSizeChartPage;
