import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ImagePlus, Loader2 } from 'lucide-react';
import api from '../../services/api';
import Button from '../../components/ui/Button';
import {
  PRODUCT_IMAGE_ACCEPT,
  PRODUCT_IMAGE_HINT,
  resolveProductImageUrl,
  validateProductImageFile,
} from '../../utils/productImage';

// Four visually-distinct dots are needed to tell the draggable landmarks apart
// on the photo -- reuses the theme's existing primary/warning/success/danger
// tokens (rather than new one-off hex values) since together they already give
// four well-separated hues.
const ANCHOR_POINTS = [
  { key: 'shoulderLeft', label: 'Left shoulder', color: 'bg-primary' },
  { key: 'shoulderRight', label: 'Right shoulder', color: 'bg-warning' },
  { key: 'hipLeft', label: 'Left hip', color: 'bg-success' },
  { key: 'hipRight', label: 'Right hip', color: 'bg-danger' },
];

const DEFAULT_POINTS = {
  shoulderLeft: { x: 0.3, y: 0.18 },
  shoulderRight: { x: 0.7, y: 0.18 },
  hipLeft: { x: 0.32, y: 0.55 },
  hipRight: { x: 0.68, y: 0.55 },
};

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
      style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
      className={`${color} absolute z-10 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full border-2 border-primary-foreground shadow-card ring-1 ring-overlay/10`}
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
        setImagePreviewUrl(resolveProductImageUrl(found.productImage));
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
    e.target.value = '';
    const problem = validateProductImageFile(selected);
    if (problem) {
      toast.error(problem);
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
        <Loader2 className="animate-spin text-muted" size={28} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-foreground">Anchor Points</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {mapping.productName || mapping.productId} — place the 4 points where they land on this product&apos;s flat-lay
        photo. These are used to warp the product image onto a customer&apos;s photo for the size-preview overlay.
      </p>

      {!imagePreviewUrl ? (
        <label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-10 text-center transition-colors duration-150 hover:border-primary">
          <ImagePlus size={28} className="text-muted" />
          <p className="mt-2 text-sm text-foreground">Click to upload a product flat-lay photo</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{PRODUCT_IMAGE_HINT}</p>
          <input type="file" accept={PRODUCT_IMAGE_ACCEPT} className="hidden" onChange={handleImageChange} />
        </label>
      ) : (
        <>
          <div
            ref={containerRef}
            className="relative mt-6 select-none overflow-hidden rounded-lg border border-border bg-surface-2"
          >
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

          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            {ANCHOR_POINTS.map(({ key, label, color }) => (
              <li key={key} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
                {label}
              </li>
            ))}
          </ul>

          <label className="mt-4 inline-block cursor-pointer text-sm font-medium text-primary underline">
            Replace photo
            <input type="file" accept={PRODUCT_IMAGE_ACCEPT} className="hidden" onChange={handleImageChange} />
          </label>
        </>
      )}

      <div className="mt-6 flex gap-3">
        <Button loading={saving} disabled={!imagePreviewUrl} onClick={handleSave}>
          Save anchor points
        </Button>
        <Button variant="secondary" onClick={() => navigate('/dashboard/product-mapping')}>
          Back
        </Button>
      </div>
    </div>
  );
}

export default AnchorPointsPage;
