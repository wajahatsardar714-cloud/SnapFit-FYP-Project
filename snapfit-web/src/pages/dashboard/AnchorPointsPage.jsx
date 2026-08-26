import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ImagePlus, Loader2 } from 'lucide-react';
import api from '../../services/api';

const API_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

const ANCHOR_POINTS = [
  { key: 'shoulderLeft', label: 'Left shoulder', color: '#2a78d6' },
  { key: 'shoulderRight', label: 'Right shoulder', color: '#eb6834' },
  { key: 'hipLeft', label: 'Left hip', color: '#1baf7a' },
  { key: 'hipRight', label: 'Right hip', color: '#e34948' },
];

const DEFAULT_POINTS = {
  shoulderLeft: { x: 0.3, y: 0.18 },
  shoulderRight: { x: 0.7, y: 0.18 },
  hipLeft: { x: 0.32, y: 0.55 },
  hipRight: { x: 0.68, y: 0.55 },
};

function resolveImageUrl(productImage) {
  if (!productImage) return null;
  return productImage.startsWith('http') ? productImage : `${API_ORIGIN}${productImage}`;
}

function AnchorMarker({ point, label, color, containerRef, onDrag }) {
  function updateFromEvent(e) {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    onDrag({ x, y });
  }

  function handlePointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromEvent(e);
  }

  function handlePointerMove(e) {
    if (e.buttons !== 1) return;
    updateFromEvent(e);
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      title={label}
      style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, backgroundColor: color }}
      className="absolute z-10 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full border-2 border-white shadow-md ring-1 ring-black/10"
    />
  );
}

function AnchorPointsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const containerRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mapping, setMapping] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [points, setPoints] = useState(DEFAULT_POINTS);

  const load = useCallback(() => {
    setLoading(true);
    return api
      .get('/products/mappings')
      .then((res) => {
        const found = res.data.mappings.find((m) => m._id === id);
        if (!found) {
          toast.error('Product mapping not found');
          navigate('/dashboard/product-mapping');
          return;
        }
        setMapping(found);
        if (found.anchorPoints) {
          setPoints({
            shoulderLeft: found.anchorPoints.shoulderLeft || DEFAULT_POINTS.shoulderLeft,
            shoulderRight: found.anchorPoints.shoulderRight || DEFAULT_POINTS.shoulderRight,
            hipLeft: found.anchorPoints.hipLeft || DEFAULT_POINTS.hipLeft,
            hipRight: found.anchorPoints.hipRight || DEFAULT_POINTS.hipRight,
          });
        }
        setImagePreviewUrl(resolveImageUrl(found.productImage));
      })
      .catch(() => toast.error('Failed to load product mapping'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!imageFile) return undefined;
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  function handleImageChange(e) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (!selected.type.startsWith('image/')) {
      toast.error('Please choose an image file (JPG or PNG).');
      return;
    }
    setImageFile(selected);
  }

  async function handleSave() {
    if (!imageFile && !mapping?.productImage) {
      toast.error('Upload a product image first');
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      if (imageFile) formData.append('image', imageFile);
      formData.append('anchorPoints', JSON.stringify(points));

      const res = await api.put(`/products/${id}/anchor-points`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMapping(res.data.mapping);
      setImageFile(null);
      toast.success('Anchor points saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save anchor points');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !mapping) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-gray-400" size={28} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900">Anchor Points</h1>
      <p className="mt-1 text-sm text-gray-500">
        {mapping.productName || mapping.productId} — place the 4 points where they land on this product&apos;s flat-lay
        photo. These are used to warp the product image onto a customer&apos;s photo for the size-preview overlay.
      </p>

      {!imagePreviewUrl ? (
        <label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-10 text-center hover:bg-gray-50">
          <ImagePlus size={28} className="text-gray-400" />
          <p className="mt-2 text-sm text-gray-600">Click to upload a product flat-lay photo</p>
          <p className="mt-1 text-xs text-gray-400">JPG or PNG, up to 10MB</p>
          <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
        </label>
      ) : (
        <>
          <div ref={containerRef} className="relative mt-6 select-none overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
            <img src={imagePreviewUrl} alt="Product flat-lay" className="pointer-events-none block w-full" draggable={false} />
            {ANCHOR_POINTS.map(({ key, label, color }) => (
              <AnchorMarker
                key={key}
                point={points[key]}
                label={label}
                color={color}
                containerRef={containerRef}
                onDrag={(next) => setPoints((prev) => ({ ...prev, [key]: next }))}
              />
            ))}
          </div>

          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
            {ANCHOR_POINTS.map(({ key, label, color }) => (
              <li key={key} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                {label}
              </li>
            ))}
          </ul>

          <label className="mt-4 inline-block cursor-pointer text-sm font-medium text-gray-600 underline hover:text-gray-900">
            Replace photo
            <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
          </label>
        </>
      )}

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !imagePreviewUrl}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save anchor points'}
        </button>
        <button
          type="button"
          onClick={() => navigate('/dashboard/product-mapping')}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Back
        </button>
      </div>
    </div>
  );
}

export default AnchorPointsPage;
