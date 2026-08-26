import { useEffect, useRef } from 'react';
import { Camera, RefreshCw } from 'lucide-react';
import { useCameraStream } from '../../hooks/useCameraStream';
import { useLivePoseDetection } from '../../hooks/useLivePoseDetection';

const AUTO_CAPTURE_HOLD_MS = 1500;
const AUTO_CAPTURE_CHECK_MS = 100;

// Friendly grouping for the missingLandmarks names useLivePoseDetection reports
// (LEFT_SHOULDER, RIGHT_HIP, etc.) — purely presentational.
const LANDMARK_GROUP_LABEL = {
  LEFT_SHOULDER: 'shoulders',
  RIGHT_SHOULDER: 'shoulders',
  LEFT_HIP: 'hips',
  RIGHT_HIP: 'hips',
  LEFT_KNEE: 'knees',
  RIGHT_KNEE: 'knees',
  LEFT_ANKLE: 'feet',
  RIGHT_ANKLE: 'feet',
};

const TONE_STYLES = {
  good: { border: 'border-green-500', text: 'text-green-700' },
  bad: { border: 'border-red-500', text: 'text-red-600' },
  // Low-end-device fallback: pose model failed to load or is taking too long
  // (useLivePoseDetection's load timeout). Capture is enabled but unvalidated.
  degraded: { border: 'border-amber-500', text: 'text-amber-700' },
  loading: { border: 'border-gray-300', text: 'text-gray-500' },
};

function describeMissing(missingLandmarks) {
  const labels = [...new Set(missingLandmarks.map((name) => LANDMARK_GROUP_LABEL[name] || 'body'))];
  if (labels.length === 0) return 'you';
  if (labels.length === 1) return `your ${labels[0]}`;
  return `your ${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

function getStatus({ isModelReady, isFramedCorrectly, missingLandmarks, framingReason, poseError }) {
  if (poseError) {
    return { tone: 'degraded', text: 'Live framing guide unavailable on this device — line up a full-body shot and capture manually.' };
  }
  if (!isModelReady) {
    return { tone: 'loading', text: 'Loading pose guide…' };
  }
  if (isFramedCorrectly) {
    return { tone: 'good', text: 'Hold still…' };
  }
  if (framingReason === 'NO_BODY_DETECTED') {
    return { tone: 'bad', text: "We can't see you — step into frame" };
  }
  if (framingReason === 'MISSING_LANDMARKS') {
    return { tone: 'bad', text: `Step back, we can't see ${describeMissing(missingLandmarks)}` };
  }
  if (framingReason === 'TOO_CLOSE_TO_EDGE') {
    return { tone: 'bad', text: 'Move into frame' };
  }
  if (framingReason === 'TOO_FAR') {
    return { tone: 'bad', text: 'Move closer to the camera' };
  }
  if (framingReason === 'TOO_CLOSE') {
    return { tone: 'bad', text: 'Step back for a full-body shot' };
  }
  return { tone: 'bad', text: 'Adjust your position' };
}

function SilhouetteOverlay({ good }) {
  return (
    <svg viewBox="0 0 200 400" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      <g fill="none" stroke={good ? '#22c55e' : '#f8fafc'} strokeOpacity={good ? 0.9 : 0.45} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="100" cy="55" r="24" />
        <path d="M68 105 Q100 88 132 105 L142 235 Q100 252 58 235 Z" />
        <path d="M58 235 L42 375" />
        <path d="M142 235 L158 375" />
      </g>
    </svg>
  );
}

function UploadInsteadLink({ onClick }) {
  return (
    <div className="mt-3 text-center text-xs">
      <button type="button" onClick={onClick} className="font-medium text-gray-600 underline hover:text-gray-900">
        Or upload a photo instead
      </button>
    </div>
  );
}

// Required-landmark set comes straight from useLivePoseDetection (shoulders, hips,
// knees, ankles). Confirmed against snapfit-ai/app/feature_engine.py: the ratios
// that actually feed size_matcher.py (shoulder_to_hip_ratio, torso_length_ratio,
// and the measurement-mode chest/shoulder/hip/torso/inseam cm values) all derive
// from shoulders + hips + ankles — this hook's set is a strict superset of that
// (it also requires knees, matching the server's own confidence scoring in
// snapfit-ai/app/utils.py), so a capture that passes here will also score well
// server-side. Nothing to change here — this component just consumes it as-is.
function LiveCapture({ file, previewUrl, onCapture, onRetake, onSwitchToUpload, autoCapture = false }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const stableSinceRef = useRef(null);
  const capturingRef = useRef(false);

  const cameraEnabled = !file;
  const { stream, status: cameraStatus, error: cameraError } = useCameraStream({ enabled: cameraEnabled });
  const cameraReady = cameraStatus === 'granted';

  const {
    isModelReady,
    isFramedCorrectly,
    missingLandmarks,
    framingReason,
    error: poseError,
  } = useLivePoseDetection(videoRef, { enabled: cameraEnabled && cameraReady });

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream || null;
    }
  }, [stream]);

  useEffect(() => {
    if (cameraStatus === 'denied' || cameraStatus === 'unavailable') {
      onSwitchToUpload();
    }
  }, [cameraStatus, onSwitchToUpload]);

  // Degraded mode (pose model failed to load or timed out): let the shopper
  // capture manually rather than trap them behind a gate that can never turn green.
  const canCapture = isFramedCorrectly || Boolean(poseError);

  function handleCapture() {
    if (!canCapture || capturingRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;

    capturingRef.current = true;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        // Always release the guard once the async encode settles — if the parent
        // rejects this file (e.g. over the 10MB limit) `file` never changes, so a
        // reset keyed on the `file` prop would leave Capture permanently disabled.
        capturingRef.current = false;
        if (!blob) return;
        onCapture(new File([blob], `snapfit-capture-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.92
    );
  }

  useEffect(() => {
    if (!autoCapture || !cameraEnabled) {
      stableSinceRef.current = null;
      return undefined;
    }

    if (!isFramedCorrectly) {
      stableSinceRef.current = null;
      return undefined;
    }
    if (stableSinceRef.current == null) {
      stableSinceRef.current = performance.now();
    }

    const id = setInterval(() => {
      if (stableSinceRef.current != null && performance.now() - stableSinceRef.current >= AUTO_CAPTURE_HOLD_MS) {
        handleCapture();
      }
    }, AUTO_CAPTURE_CHECK_MS);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCapture, cameraEnabled, isFramedCorrectly]);

  if (file) {
    return (
      <div>
        <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-gray-200 p-3">
          <img src={previewUrl} alt="Captured preview" className="h-48 w-48 rounded-md object-cover" />
          <span className="text-xs text-gray-500">Photo captured</span>
        </div>
        <div className="mt-3 flex items-center justify-center gap-4 text-xs">
          <button type="button" onClick={onRetake} className="flex items-center gap-1 font-medium text-gray-600 underline hover:text-gray-900">
            <RefreshCw size={12} />
            Retake
          </button>
          <button type="button" onClick={onSwitchToUpload} className="font-medium text-gray-600 underline hover:text-gray-900">
            Or upload a photo instead
          </button>
        </div>
      </div>
    );
  }

  if (cameraStatus === 'requesting' || cameraStatus === 'idle') {
    return (
      <div>
        <p className="py-10 text-center text-sm text-gray-500">Requesting camera access…</p>
        <UploadInsteadLink onClick={onSwitchToUpload} />
      </div>
    );
  }
  if (cameraStatus === 'denied' || cameraStatus === 'unavailable') {
    return (
      <div>
        <p className="py-10 text-center text-sm text-gray-500">{cameraError || 'Camera unavailable.'}</p>
        <UploadInsteadLink onClick={onSwitchToUpload} />
      </div>
    );
  }

  const status = getStatus({ isModelReady, isFramedCorrectly, missingLandmarks, framingReason, poseError });
  const { border: borderClass, text: textClass } = TONE_STYLES[status.tone];

  return (
    <div>
      <div className={`relative aspect-[3/4] w-full overflow-hidden rounded-lg border-4 bg-gray-900 transition-colors ${borderClass}`}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-contain" />
        <SilhouetteOverlay good={status.tone === 'good'} />
      </div>
      <canvas ref={canvasRef} className="hidden" />

      <p className={`mt-2 text-center text-sm font-medium ${textClass}`}>{status.text}</p>

      {(!autoCapture || Boolean(poseError)) && (
        <button
          type="button"
          onClick={handleCapture}
          disabled={!canCapture}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Camera size={16} />
          Capture
        </button>
      )}

      <UploadInsteadLink onClick={onSwitchToUpload} />
    </div>
  );
}

export default LiveCapture;
