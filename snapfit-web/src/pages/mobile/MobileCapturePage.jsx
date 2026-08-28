import { lazy, Suspense, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, ImagePlus, Loader2 } from 'lucide-react';

// Same lazy chunk the desktop widget uses for its own live capture -- reused
// as-is here, not duplicated.
const LiveCapture = lazy(() => import('../../components/widget/LiveCapture'));

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function MobileCapturePage() {
  const { sessionId } = useParams();
  const [mode, setMode] = useState('camera'); // camera | upload
  const [capturedFile, setCapturedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | uploading | done | expired | error
  const [error, setError] = useState('');

  useEffect(() => {
    if (!capturedFile) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(capturedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [capturedFile]);

  async function sendPhoto(file) {
    setStatus('uploading');
    setError('');

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch(`${API_BASE}/handoff/sessions/${sessionId}/photo`, {
        method: 'POST',
        body: formData,
      });

      if (res.status === 404 || res.status === 410) {
        setStatus('expired');
        return;
      }

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message || 'Could not send the photo. Please try again.');
        setStatus('error');
        return;
      }

      setStatus('done');
    } catch {
      setError('Network error — please check your connection and try again.');
      setStatus('error');
    }
  }

  function handleFileSelected(e) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (!selected.type.startsWith('image/')) {
      setError('Please choose an image file (JPG or PNG).');
      return;
    }
    if (selected.size > MAX_FILE_SIZE_BYTES) {
      setError('This image is too large. Please choose a photo under 10MB.');
      return;
    }
    setError('');
    sendPhoto(selected);
  }

  if (status === 'done') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50 p-6 text-center">
        <CheckCircle2 size={40} className="text-green-600" />
        <p className="text-lg font-semibold text-gray-900">Photo sent!</p>
        <p className="text-sm text-gray-500">Return to your computer to see your size recommendation.</p>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50 p-6 text-center">
        <p className="text-lg font-semibold text-gray-900">This link has expired</p>
        <p className="text-sm text-gray-500">Go back to your computer and generate a new QR code.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-sm">
        <h1 className="text-center text-lg font-semibold text-gray-900">Take your photo</h1>
        <p className="mt-1 text-center text-sm text-gray-500">This is sent straight to your computer.</p>

        {status === 'uploading' ? (
          <div className="mt-6 flex flex-col items-center gap-2 py-10">
            <Loader2 className="animate-spin text-gray-500" size={28} />
            <p className="text-sm text-gray-500">Sending photo...</p>
          </div>
        ) : mode === 'camera' ? (
          <div className="mt-4">
            <Suspense fallback={<p className="py-10 text-center text-sm text-gray-500">Loading camera…</p>}>
              <LiveCapture
                file={capturedFile}
                previewUrl={previewUrl}
                onCapture={setCapturedFile}
                onRetake={() => setCapturedFile(null)}
                onSwitchToUpload={() => {
                  setCapturedFile(null);
                  setMode('upload');
                }}
                autoCapture={false}
              />
            </Suspense>
            {capturedFile && (
              <button
                type="button"
                onClick={() => sendPhoto(capturedFile)}
                className="mt-3 w-full rounded-md bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
              >
                Send Photo
              </button>
            )}
          </div>
        ) : (
          <div className="mt-4">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-8 text-center hover:bg-white">
              <ImagePlus size={28} className="text-gray-400" />
              <p className="mt-2 text-sm text-gray-600">Tap to choose a photo</p>
              <p className="mt-1 text-xs text-gray-400">JPG or PNG, up to 10MB</p>
              <input type="file" accept="image/*" className="hidden" onChange={handleFileSelected} />
            </label>
            <button
              type="button"
              onClick={() => setMode('camera')}
              className="mt-3 w-full text-center text-xs font-medium text-gray-600 underline"
            >
              Or use your camera instead
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}

export default MobileCapturePage;
