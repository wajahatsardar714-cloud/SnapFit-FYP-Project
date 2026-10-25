import { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, SwitchCamera } from 'lucide-react';
import {
  AUTO_CAPTURE_COUNTDOWN_S,
  EXTRA_CAPTURE_FRAMES,
  FRAME_INTERVAL_MS,
  MIRROR_PREVIEW,
} from '../../config/poseConfig';
import { useCameraStream } from '../../hooks/useCameraStream';
import { useLivePoseDetection } from '../../hooks/useLivePoseDetection';
import { defaultFacingMode } from '../../utils/device';
import { alignmentState, primaryInstruction } from '../../utils/poseValidation';
import PoseGuideOverlay from './PoseGuideOverlay';

const TONE_STYLES = {
  aligned: { border: 'border-success', text: 'text-success' },
  partial: { border: 'border-warning', text: 'text-warning' },
  searching: { border: 'border-border', text: 'text-foreground' },
  // Low-end-device fallback: pose model failed to load or is taking too long.
  // Capture is enabled but unvalidated here (the server still checks the pose).
  degraded: { border: 'border-warning', text: 'text-warning' },
  loading: { border: 'border-border', text: 'text-muted-foreground' },
};

const JPEG_QUALITY = 0.92;

function getStatus({ isModelReady, validation, poseError, countdown, holdingStill }) {
  if (holdingStill) return { tone: poseError ? 'degraded' : 'aligned', text: 'Hold still…' };
  if (poseError) {
    return { tone: 'degraded', text: 'Live pose guide unavailable on this device — line up a full-body shot and capture manually.' };
  }
  if (!isModelReady) return { tone: 'loading', text: 'Loading pose guide…' };
  if (!validation) return { tone: 'searching', text: 'Step into the frame so we can see your whole body' };
  if (countdown != null) return { tone: 'aligned', text: `Hold still — taking your photo in ${countdown}…` };
  if (validation.ok) return { tone: 'aligned', text: 'Perfect — hold still' };
  return { tone: alignmentState(validation), text: primaryInstruction(validation) || 'Adjust your position' };
}

function frameReady(video) {
  return Boolean(video) && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
}

// Always the raw camera frame: never mirrored, whatever MIRROR_PREVIEW says.
function drawFrame(video, canvas) {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
}

// toBlob copies the canvas when called, so it can be redrawn while this encodes.
// Resolves to a JPEG File, or null if encoding failed.
function encodeJpeg(canvas, name) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob && new File([blob], name, { type: 'image/jpeg' })), 'image/jpeg', JPEG_QUALITY);
  });
}

// Grabs EXTRA_CAPTURE_FRAMES more frames, FRAME_INTERVAL_MS apart, after the
// main one already on `canvas`. A frame that can't be grabbed is dropped -- as is
// one whose size changed (phone rotated), since its landmarks wouldn't line up
// with the main frame's. `burst.timer` holds the pending timer so the caller can
// cancel the burst.
function grabExtraFrames(video, canvas, burst, name) {
  const { width, height } = canvas;
  const frames = [];
  return new Promise((resolve) => {
    function next(index) {
      if (index > EXTRA_CAPTURE_FRAMES) {
        resolve(Promise.all(frames));
        return;
      }
      burst.timer = setTimeout(() => {
        if (frameReady(video) && video.videoWidth === width && video.videoHeight === height) {
          drawFrame(video, canvas);
          frames.push(encodeJpeg(canvas, `${name}-frame-${index}.jpg`));
        }
        next(index + 1);
      }, FRAME_INTERVAL_MS);
    }
    next(1);
  });
}

function UploadInsteadLink({ onClick }) {
  return (
    <div className="mt-3 text-center text-xs">
      <button type="button" onClick={onClick} className="font-medium text-muted-foreground underline hover:text-foreground">
        Or upload a photo instead
      </button>
    </div>
  );
}

function LiveCapture({ file, previewUrl, onCapture, onRetake, onSwitchToUpload, autoCapture = true }) {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const canvasRef = useRef(null);
  const capturingRef = useRef(false);
  const burstRef = useRef(null); // { timer, cancelled } of the burst in progress
  const [initialFacingMode] = useState(defaultFacingMode);
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [countdown, setCountdown] = useState(null);
  const [captureError, setCaptureError] = useState('');
  const [holdingStill, setHoldingStill] = useState(false);

  const cameraEnabled = !file;
  const {
    stream,
    status: cameraStatus,
    error: cameraError,
    switchCamera,
    canSwitch,
  } = useCameraStream({ enabled: cameraEnabled, initialFacingMode });
  const cameraReady = cameraStatus === 'granted';

  const { isModelReady, validation, error: poseError, checkFrame } = useLivePoseDetection(videoRef, {
    enabled: cameraEnabled && cameraReady,
    overlayRef,
    resetKey: stream?.id,
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    video.srcObject = stream || null;
    // Track the real frame size (it changes on camera switch / phone rotation)
    // so the preview box, pose guide and gate all use the true aspect ratio.
    function handleVideoSize() {
      if (video.videoWidth) setVideoSize({ width: video.videoWidth, height: video.videoHeight });
    }
    video.addEventListener('loadedmetadata', handleVideoSize);
    video.addEventListener('resize', handleVideoSize);
    return () => {
      video.removeEventListener('loadedmetadata', handleVideoSize);
      video.removeEventListener('resize', handleVideoSize);
    };
  }, [stream]);

  useEffect(() => {
    if (cameraStatus === 'denied' || cameraStatus === 'unavailable') {
      onSwitchToUpload();
    }
  }, [cameraStatus, onSwitchToUpload]);

  // Unmounting mid-burst (e.g. switching to upload) drops that capture.
  useEffect(
    () => () => {
      const burst = burstRef.current;
      if (!burst) return;
      burst.cancelled = true;
      clearTimeout(burst.timer);
    },
    []
  );

  // Degraded mode (pose model failed to load or timed out): let the shopper
  // capture manually rather than trap them behind a gate that can never pass.
  const canCapture = Boolean(validation?.ok) || Boolean(poseError);

  function handleCapture() {
    if (!canCapture || capturingRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !frameReady(video)) return;

    capturingRef.current = true;
    drawFrame(video, canvas);

    if (!poseError) {
      const recheck = checkFrame(canvas);
      if (recheck && !recheck.ok) {
        capturingRef.current = false;
        setCaptureError(`Almost — ${primaryInstruction(recheck) || 'hold the pose'} and try again.`);
        return;
      }
    }

    setCaptureError('');
    setHoldingStill(true);
    const burst = { timer: null, cancelled: false };
    burstRef.current = burst;
    const name = `snapfit-capture-${Date.now()}`;
    // The main frame is the one previewed and used for the try-on; the extra
    // frames only steady the server's measurements.
    Promise.all([encodeJpeg(canvas, `${name}.jpg`), grabExtraFrames(video, canvas, burst, name)]).then(([mainFile, frames]) => {
      if (burst.cancelled) return;
      burstRef.current = null;
      // Always release the guard once the burst settles -- if the parent
      // rejects this file (e.g. over the 10MB limit) `file` never changes.
      capturingRef.current = false;
      setHoldingStill(false);
      if (mainFile) onCapture(mainFile, frames.filter(Boolean));
    });
  }

  // All checks passing (stillness included) starts a countdown; any check
  // failing cancels it.
  const readyForAutoCapture = autoCapture && cameraEnabled && Boolean(validation?.ok);
  useEffect(() => {
    if (!readyForAutoCapture) {
      setCountdown(null);
      return undefined;
    }
    let remaining = AUTO_CAPTURE_COUNTDOWN_S;
    setCountdown(remaining);
    const id = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        setCountdown(remaining);
        return;
      }
      clearInterval(id);
      setCountdown(null);
      handleCapture();
    }, 1000);
    return () => clearInterval(id);
    // handleCapture reads the latest refs/state at fire time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyForAutoCapture]);

  if (file) {
    return (
      <div>
        <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-border p-3">
          <img src={previewUrl} alt="Captured preview" className="h-48 w-48 rounded-md object-cover" />
          <span className="text-xs text-muted-foreground">Photo captured</span>
        </div>
        <div className="mt-3 flex items-center justify-center gap-4 text-xs">
          <button type="button" onClick={onRetake} className="flex items-center gap-1 font-medium text-muted-foreground underline hover:text-foreground">
            <RefreshCw size={12} />
            Retake
          </button>
          <button type="button" onClick={onSwitchToUpload} className="font-medium text-muted-foreground underline hover:text-foreground">
            Or upload a photo instead
          </button>
        </div>
      </div>
    );
  }

  if (cameraStatus === 'requesting' || cameraStatus === 'idle') {
    return (
      <div>
        <p className="py-10 text-center text-sm text-muted-foreground">Requesting camera access…</p>
        <UploadInsteadLink onClick={onSwitchToUpload} />
      </div>
    );
  }
  if (cameraStatus === 'denied' || cameraStatus === 'unavailable') {
    return (
      <div>
        <p className="py-10 text-center text-sm text-muted-foreground">{cameraError || 'Camera unavailable.'}</p>
        <UploadInsteadLink onClick={onSwitchToUpload} />
      </div>
    );
  }

  const status = getStatus({ isModelReady, validation, poseError, countdown, holdingStill });
  const { border: borderClass, text: textClass } = TONE_STYLES[status.tone];
  const aspect = videoSize.width && videoSize.height ? videoSize.width / videoSize.height : 3 / 4;

  return (
    <div>
      {/* Dark-scoped viewport: overlays on live video (pose guide, skeleton,
          countdown, border) use the bright dark-theme shades for visibility. */}
      <div
        data-theme="dark"
        className={`relative mx-auto overflow-hidden rounded-lg border-4 bg-overlay transition-colors ${borderClass}`}
        style={{ aspectRatio: aspect, width: `min(100%, calc(65vh * ${aspect}))` }}
      >
        <div className="absolute inset-0" style={MIRROR_PREVIEW ? { transform: 'scaleX(-1)' } : undefined}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
          />
          <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
          <PoseGuideOverlay
            width={videoSize.width}
            height={videoSize.height}
            state={poseError || !isModelReady ? 'searching' : alignmentState(validation)}
          />
        </div>

        {countdown != null && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-7xl font-bold text-primary-foreground drop-shadow-lg" aria-live="assertive">
              {countdown}
            </span>
          </div>
        )}

        {canSwitch && (
          <button
            type="button"
            onClick={switchCamera}
            disabled={holdingStill}
            aria-label="Switch camera"
            className="absolute right-2 top-2 rounded-full bg-overlay/50 p-2 text-primary-foreground hover:bg-overlay/70 disabled:opacity-40"
          >
            <SwitchCamera size={18} />
          </button>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />

      <p className={`mt-2 text-center text-sm font-medium ${textClass}`} aria-live="polite">
        {status.text}
      </p>
      {captureError && <p className="mt-1 text-center text-xs text-danger">{captureError}</p>}

      <button
        type="button"
        onClick={handleCapture}
        disabled={!canCapture || holdingStill}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Camera size={16} />
        Capture
      </button>

      <UploadInsteadLink onClick={onSwitchToUpload} />
    </div>
  );
}

export default LiveCapture;
