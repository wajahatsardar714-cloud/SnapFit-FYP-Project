import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Camera, ImageUp, RefreshCw, ScanLine, Shirt, Smartphone, Sparkles, SwitchCamera, X } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import Input from '../../components/ui/Input';
import Textarea from '../../components/ui/Textarea';
import { MIRROR_PREVIEW } from '../../config/poseConfig';
import { useCameraStream } from '../../hooks/useCameraStream';
import { defaultFacingMode } from '../../utils/device';

// Developer test bench for the Python AI microservice. Public (no login, no API
// key): it calls the FastAPI service directly through Vite's /ai proxy (see
// vite.config.js), bypassing the Node backend's auth + API-key layer, so the AI
// pipeline can be exercised on its own.
const AI_BASE = import.meta.env.VITE_AI_URL || '/ai';
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Same lazy QR-handoff chunk the widget uses, pointed at the backend's key-less
// dev-only /handoff/test-sessions routes.
const MobileHandoff = lazy(() => import('../../components/widget/MobileHandoff'));

const PHOTO_SOURCES = [
  { key: 'upload', label: 'Upload', Icon: ImageUp },
  { key: 'webcam', label: 'Webcam', Icon: Camera },
  { key: 'phone', label: 'Phone (QR)', Icon: Smartphone },
];

// Ranges are on the scale feature_engine.py actually emits: chest/hip are
// front-view *widths* (not circumferences), and lengths come out larger than
// tape measurements because the pixel->cm scale uses shoulder-to-ankle as the
// full height. Tuned so a typical full-body photo gets a real recommendation.
const SAMPLE_SIZE_CHART = {
  unit: 'cm',
  sizes: [
    {
      label: 'S',
      measurements: {
        chest: { min: 36, max: 40 },
        shoulderWidth: { min: 40, max: 44 },
        hip: { min: 22, max: 25 },
        torsoLength: { min: 58, max: 64 },
        inseam: { min: 90, max: 97 },
      },
    },
    {
      label: 'M',
      measurements: {
        chest: { min: 40, max: 44 },
        shoulderWidth: { min: 44, max: 48 },
        hip: { min: 25, max: 28 },
        torsoLength: { min: 64, max: 70 },
        inseam: { min: 97, max: 104 },
      },
    },
    {
      label: 'L',
      measurements: {
        chest: { min: 44, max: 48 },
        shoulderWidth: { min: 48, max: 52 },
        hip: { min: 28, max: 31 },
        torsoLength: { min: 70, max: 76 },
        inseam: { min: 104, max: 111 },
      },
    },
  ],
};

const SKELETON = [
  ['LEFT_SHOULDER', 'RIGHT_SHOULDER'],
  ['LEFT_SHOULDER', 'LEFT_ELBOW'],
  ['LEFT_ELBOW', 'LEFT_WRIST'],
  ['RIGHT_SHOULDER', 'RIGHT_ELBOW'],
  ['RIGHT_ELBOW', 'RIGHT_WRIST'],
  ['LEFT_SHOULDER', 'LEFT_HIP'],
  ['RIGHT_SHOULDER', 'RIGHT_HIP'],
  ['LEFT_HIP', 'RIGHT_HIP'],
  ['LEFT_HIP', 'LEFT_KNEE'],
  ['LEFT_KNEE', 'LEFT_ANKLE'],
  ['RIGHT_HIP', 'RIGHT_KNEE'],
  ['RIGHT_KNEE', 'RIGHT_ANKLE'],
];

async function callAi(path, formData) {
  const started = performance.now();
  const response = await fetch(`${AI_BASE}${path}`, { method: 'POST', body: formData });
  const elapsedMs = Math.round(performance.now() - started);
  let body = null;
  try {
    body = await response.json();
  } catch {
    // non-JSON error page (e.g. proxy failure when the AI service is down)
  }
  if (!response.ok) {
    const detail = body?.detail;
    let message = `HTTP ${response.status}`;
    if (typeof detail === 'string') {
      message = detail;
    } else if (detail?.code === 'POSE_INVALID') {
      message = `POSE_INVALID — ${detail.failed_checks.map((c) => c.message).join('; ')}`;
    } else if (detail) {
      message = JSON.stringify(detail);
    }
    throw new Error(message);
  }
  return { body, elapsedMs };
}

function formatNumber(value, digits = 3) {
  return typeof value === 'number' ? value.toFixed(digits) : '—';
}

function confidenceVariant(value) {
  if (value >= 0.75) return 'success';
  if (value >= 0.5) return 'warning';
  return 'danger';
}

function HealthBadge({ health, onRefresh }) {
  const label = { checking: 'Checking…', ok: 'AI service online', down: 'AI service offline' }[health.status];
  const variant = { checking: 'neutral', ok: 'success', down: 'danger' }[health.status];
  return (
    <div className="flex items-center gap-2">
      <Badge variant={variant}>
        <Activity size={12} className="mr-1" />
        {label}
      </Badge>
      <Button variant="ghost" size="sm" onClick={onRefresh} icon={<RefreshCw size={14} />}>
        Recheck
      </Button>
    </div>
  );
}

// Ungated on purpose (unlike the widget's LiveCapture) so any pose can be sent
// to the AI service -- e.g. to see exactly which POSE_INVALID checks it fails.
function CameraCapture({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const [initialFacingMode] = useState(defaultFacingMode);
  const { stream, status, error, switchCamera, canSwitch } = useCameraStream({ enabled: true, initialFacingMode });

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  function capture() {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => blob && onCapture(new File([blob], 'camera.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.92);
  }

  return (
    <div className="space-y-3">
      {status === 'granted' ? (
        <div className="relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full rounded-lg bg-black"
            style={MIRROR_PREVIEW ? { transform: 'scaleX(-1)' } : undefined}
          />
          {canSwitch && (
            <button
              type="button"
              onClick={switchCamera}
              aria-label="Switch camera"
              className="absolute right-2 top-2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
            >
              <SwitchCamera size={16} />
            </button>
          )}
        </div>
      ) : (
        <Alert
          variant={status === 'requesting' ? 'info' : 'danger'}
          description={status === 'requesting' ? 'Waiting for camera permission…' : error}
        />
      )}
      <div className="flex gap-2">
        <Button onClick={capture} disabled={status !== 'granted'} icon={<Camera size={16} />}>
          Capture photo
        </Button>
        <Button variant="secondary" onClick={onClose} icon={<X size={16} />}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function PoseOverlay({ imageUrl, dimensions, landmarks }) {
  const { width, height } = dimensions;
  const radius = Math.max(width, height) / 160;
  const point = (name) => landmarks[name] && { x: landmarks[name].x * width, y: landmarks[name].y * height };

  return (
    <div className="relative overflow-hidden rounded-lg border border-surface-border bg-gray-100">
      <img src={imageUrl} alt="Analyzed" className="block w-full" />
      <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 h-full w-full">
        {SKELETON.map(([a, b]) => {
          const p1 = point(a);
          const p2 = point(b);
          if (!p1 || !p2) return null;
          return (
            <line
              key={`${a}-${b}`}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke="#6366F1"
              strokeWidth={radius * 0.6}
              strokeLinecap="round"
            />
          );
        })}
        {Object.entries(landmarks).map(([name, lm]) => (
          <circle
            key={name}
            cx={lm.x * width}
            cy={lm.y * height}
            r={radius}
            fill={lm.visibility >= 0.5 ? '#10B981' : '#F59E0B'}
            stroke="#fff"
            strokeWidth={radius * 0.3}
          >
            <title>{`${name} (visibility ${formatNumber(lm.visibility, 2)})`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

function KeyValueTable({ rows }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([key, value]) => (
          <tr key={key} className="border-b border-surface-border last:border-0">
            <td className="py-1.5 pr-4 font-mono text-xs text-ink-500">{key}</td>
            <td className="py-1.5 text-right font-mono text-ink-900">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SizeRecommendation({ recommendation }) {
  const scores = Object.entries(recommendation.fit_scores || {});
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary-50 text-2xl font-bold text-primary">
          {recommendation.recommended_size}
        </div>
        <div>
          <p className="text-sm text-ink-500">Recommended size</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Badge variant={confidenceVariant(recommendation.confidence)}>
              Confidence {Math.round(recommendation.confidence * 100)}%
            </Badge>
            <Badge variant="info">Body type: {recommendation.body_type}</Badge>
          </div>
        </div>
      </div>
      <p className="text-sm text-ink-700">{recommendation.notes}</p>
      <div className="space-y-2">
        {scores.map(([label, score]) => (
          <div key={label} className="flex items-center gap-3 text-sm">
            <span className="w-10 font-medium text-ink-900">{label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full ${label === recommendation.recommended_size ? 'bg-primary' : 'bg-primary-200'}`}
                style={{ width: `${Math.round(score * 100)}%` }}
              />
            </div>
            <span className="w-10 text-right font-mono text-xs text-ink-500">{score.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AiTestPage() {
  const [health, setHealth] = useState({ status: 'checking' });
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [source, setSource] = useState('upload');
  const [height, setHeight] = useState('');
  const [useChart, setUseChart] = useState(true);
  const [chartText, setChartText] = useState(JSON.stringify(SAMPLE_SIZE_CHART, null, 2));
  const [merchantId, setMerchantId] = useState('');
  const [productId, setProductId] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [tryOnImage, setTryOnImage] = useState(null);

  const checkHealth = useCallback(async () => {
    setHealth({ status: 'checking' });
    try {
      const response = await fetch(`${AI_BASE}/health`);
      setHealth({ status: response.ok ? 'ok' : 'down' });
    } catch {
      setHealth({ status: 'down' });
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  function selectFile(nextFile) {
    if (!nextFile) return;
    setFile(nextFile);
    setPreviewUrl(URL.createObjectURL(nextFile));
    setSource('upload');
    setResult(null);
    setTryOnImage(null);
    setError(null);
  }

  async function run(kind) {
    if (!file) return;
    setError(null);
    setBusy(kind);

    const formData = new FormData();
    formData.append('image', file);

    try {
      if (kind === 'analyze') {
        if (height) formData.append('user_height', height);
        if (useChart) {
          try {
            JSON.parse(chartText);
          } catch {
            throw new Error('Size chart is not valid JSON.');
          }
          formData.append('size_chart', chartText);
        }
        const { body, elapsedMs } = await callAi('/analyze', formData);
        setResult({ kind, body, elapsedMs, landmarks: body.key_landmarks, dimensions: body.image_dimensions });
      } else if (kind === 'landmarks') {
        const { body, elapsedMs } = await callAi('/landmarks-only', formData);
        setResult({ kind, body, elapsedMs, landmarks: body.landmarks, dimensions: body.image_dimensions });
      } else if (kind === 'try-on') {
        formData.append('merchant_id', merchantId.trim());
        formData.append('product_id', productId.trim());
        const { body } = await callAi('/try-on', formData);
        setTryOnImage(body.image);
      }
    } catch (err) {
      setError({ kind, message: err.message });
    } finally {
      setBusy(null);
    }
  }

  const features = result?.kind === 'analyze' ? result.body.features : null;

  return (
    <div className="min-h-screen bg-surface-page px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ScanLine className="text-primary" size={24} />
              <h1 className="text-2xl font-bold text-ink-900">AI Service Test Bench</h1>
            </div>
            <p className="mt-1 text-sm text-ink-500">
              Calls the Python AI service directly — no login or API key required. For local development only.
            </p>
          </div>
          <HealthBadge health={health} onRefresh={checkHealth} />
        </div>

        {health.status === 'down' && (
          <Alert
            variant="danger"
            title="Cannot reach the AI service"
            description="Start it with: cd snapfit-ai; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"
          />
        )}

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <Card.Header padding="sm">
                <h2 className="font-semibold text-ink-900">1. Photo</h2>
                <p className="text-xs text-ink-500">Full body, facing the camera, head to ankles visible.</p>
              </Card.Header>
              <Card.Body padding="sm" className="space-y-3">
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1">
                  {PHOTO_SOURCES.map(({ key, label, Icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSource(key)}
                      className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                        source === key ? 'bg-white text-primary shadow-sm' : 'text-ink-500 hover:text-ink-700'
                      }`}
                    >
                      <Icon size={14} />
                      {label}
                    </button>
                  ))}
                </div>
                {source === 'phone' ? (
                  <Suspense fallback={<p className="py-10 text-center text-sm text-ink-500">Loading…</p>}>
                    <MobileHandoff
                      apiUrl={API_BASE}
                      sessionsPath="/handoff/test-sessions"
                      onCapture={selectFile}
                      onSwitchToUpload={() => setSource('upload')}
                    />
                  </Suspense>
                ) : source === 'webcam' ? (
                  <CameraCapture onCapture={selectFile} onClose={() => setSource('upload')} />
                ) : (
                  <label
                    className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-surface-border px-4 py-6 text-center hover:border-primary-200 hover:bg-primary-50"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      selectFile(e.dataTransfer.files?.[0]);
                    }}
                  >
                    {previewUrl ? (
                      <img src={previewUrl} alt="Selected" className="max-h-64 rounded-md" />
                    ) : (
                      <ImageUp size={32} className="text-ink-300" />
                    )}
                    <span className="text-sm text-ink-700">
                      {file ? file.name : 'Click to choose or drop an image'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => selectFile(e.target.files?.[0])}
                    />
                  </label>
                )}
              </Card.Body>
            </Card>

            <Card>
              <Card.Header padding="sm">
                <h2 className="font-semibold text-ink-900">2. Size analysis</h2>
                <p className="text-xs text-ink-500">POST /analyze and /landmarks-only</p>
              </Card.Header>
              <Card.Body padding="sm" className="space-y-4">
                <Input
                  label="Your height (cm) — optional"
                  name="height"
                  type="number"
                  min="50"
                  max="250"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder="e.g. 175 (enables cm estimates)"
                />
                <label className="flex items-center gap-2 text-sm text-ink-700">
                  <input type="checkbox" checked={useChart} onChange={(e) => setUseChart(e.target.checked)} />
                  Send a size chart (get a size recommendation)
                </label>
                {useChart && (
                  <Textarea
                    name="sizeChart"
                    rows={8}
                    className="font-mono text-xs"
                    value={chartText}
                    onChange={(e) => setChartText(e.target.value)}
                  />
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => run('analyze')}
                    loading={busy === 'analyze'}
                    disabled={!file || !!busy}
                    icon={<Sparkles size={16} />}
                  >
                    Run analysis
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => run('landmarks')}
                    loading={busy === 'landmarks'}
                    disabled={!file || !!busy}
                  >
                    Landmarks only
                  </Button>
                </div>
                {error && error.kind !== 'try-on' && <Alert variant="danger" title="Request failed" description={error.message} />}
              </Card.Body>
            </Card>

            <Card>
              <Card.Header padding="sm">
                <h2 className="font-semibold text-ink-900">3. Virtual try-on</h2>
                <p className="text-xs text-ink-500">
                  POST /try-on — needs a product with anchor points saved in the backend.
                </p>
              </Card.Header>
              <Card.Body padding="sm" className="space-y-3">
                <Input label="Merchant ID" name="merchantId" value={merchantId} onChange={(e) => setMerchantId(e.target.value)} />
                <Input label="Product ID" name="productId" value={productId} onChange={(e) => setProductId(e.target.value)} />
                <Button
                  variant="secondary"
                  onClick={() => run('try-on')}
                  loading={busy === 'try-on'}
                  disabled={!file || !merchantId.trim() || !productId.trim() || !!busy}
                  icon={<Shirt size={16} />}
                >
                  Generate try-on
                </Button>
                {error?.kind === 'try-on' && <Alert variant="danger" title="Try-on failed" description={error.message} />}
                {tryOnImage && <img src={tryOnImage} alt="Try-on result" className="w-full rounded-lg border border-surface-border" />}
              </Card.Body>
            </Card>
          </div>

          <div className="space-y-6 lg:col-span-3">
            {!result ? (
              <Card className="flex min-h-[20rem] flex-col items-center justify-center text-center">
                <ScanLine size={40} className="text-ink-300" />
                <p className="mt-3 text-sm text-ink-500">Choose a photo and run an analysis to see the results here.</p>
              </Card>
            ) : (
              <>
                <Card>
                  <Card.Header padding="sm" className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold text-ink-900">
                      Detected pose ({Object.keys(result.landmarks).length} landmarks)
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      {result.kind === 'analyze' && (
                        <Badge variant={confidenceVariant(result.body.confidence)}>
                          Pose confidence {Math.round(result.body.confidence * 100)}%
                        </Badge>
                      )}
                      <Badge>{result.elapsedMs} ms</Badge>
                      <Badge>
                        {result.dimensions.width}×{result.dimensions.height}px
                      </Badge>
                    </div>
                  </Card.Header>
                  <Card.Body padding="sm">
                    <PoseOverlay imageUrl={previewUrl} dimensions={result.dimensions} landmarks={result.landmarks} />
                    <p className="mt-2 text-xs text-ink-500">
                      Green = visibility ≥ 0.5, amber = low visibility. Hover a point for its name.
                    </p>
                  </Card.Body>
                </Card>

                {result.kind === 'analyze' && (
                  <>
                    <Card>
                      <Card.Header padding="sm">
                        <h2 className="font-semibold text-ink-900">Size recommendation</h2>
                      </Card.Header>
                      <Card.Body padding="sm">
                        {result.body.size_recommendation ? (
                          <SizeRecommendation recommendation={result.body.size_recommendation} />
                        ) : (
                          <p className="text-sm text-ink-500">No size chart was sent, so no recommendation.</p>
                        )}
                      </Card.Body>
                    </Card>

                    <div className="grid gap-6 md:grid-cols-2">
                      <Card>
                        <Card.Header padding="sm">
                          <h2 className="font-semibold text-ink-900">Body ratios</h2>
                        </Card.Header>
                        <Card.Body padding="sm">
                          <KeyValueTable rows={Object.entries(features.ratios).map(([k, v]) => [k, formatNumber(v)])} />
                        </Card.Body>
                      </Card>
                      <Card>
                        <Card.Header padding="sm">
                          <h2 className="font-semibold text-ink-900">Estimated measurements</h2>
                        </Card.Header>
                        <Card.Body padding="sm">
                          {features.estimated_cm ? (
                            <KeyValueTable
                              rows={Object.entries(features.estimated_cm).map(([k, v]) => [k, `${formatNumber(v, 1)} cm`])}
                            />
                          ) : (
                            <p className="text-sm text-ink-500">Enter your height to get estimates in cm.</p>
                          )}
                        </Card.Body>
                      </Card>
                    </div>
                  </>
                )}

                <Card>
                  <details>
                    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink-900">Raw JSON response</summary>
                    <pre className="max-h-96 overflow-auto border-t border-surface-border bg-gray-50 p-4 text-xs text-ink-700">
                      {JSON.stringify(result.body, null, 2)}
                    </pre>
                  </details>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AiTestPage;
