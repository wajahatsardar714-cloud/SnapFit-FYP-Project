import { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, SwitchCamera } from 'lucide-react';
import { AUTO_CAPTURE_COUNTDOWN_S, MIRROR_PREVIEW } from '../../config/poseConfig';
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

function getStatus({ isModelReady, validation, poseError, countdown }) {
  if (poseError) {
    return { tone: 'degraded', text: 'Live pose guide unavailable on this device — line up a full-body shot and capture manually.' };
  }
  if (!isModelReady) return { tone: 'loading', text: 'Loading pose guide…' };
  if (!validation) return { tone: 'searching', text: 'Step into the frame so we can see your whole body' };
  if (countdown != null) return { tone: 'aligned', text: `Hold still — taking your photo in ${countdown}…` };
  if (validation.ok) return { tone: 'aligned', text: 'Perfect — hold still' };
  return { tone: alignmentState(validation), text: primaryInstruction(validation) || 'Adjust your position' };
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
  const [initialFacingMode] = useState(defaultFacingMode);
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [countdown, setCountdown] = useState(null);
  const [captureError, setCaptureError] = useState('');

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

  // Degraded mode (pose model failed to load or timed out): let the shopper
  // capture manually rather than trap them behind a gate that can never pass.
  const canCapture = Boolean(validation?.ok) || Boolean(poseError);

  function handleCapture() {
    if (!canCapture || capturingRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;

    capturingRef.current = true;
    // Always the raw camera frame: never mirrored, whatever MIRROR_PREVIEW says.
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    if (!poseError) {
      const recheck = checkFrame(canvas);
      if (recheck && !recheck.ok) {
        capturingRef.current = false;
        setCaptureError(`Almost — ${primaryInstruction(recheck) || 'hold the pose'} and try again.`);
        return;
      }
    }

    setCaptureError('');
    canvas.toBlob(
      (blob) => {
        // Always release the guard once the async encode settles -- if the parent
        // rejects this file (e.g. over the 10MB limit) `file` never changes.
        capturingRef.current = false;
        if (!blob) return;
        onCapture(new File([blob], `snapfit-capture-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.92
    );
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

  const status = getStatus({ isModelReady, validation, poseError, countdown });
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
            aria-label="Switch camera"
            className="absolute right-2 top-2 rounded-full bg-overlay/50 p-2 text-primary-foreground hover:bg-overlay/70"
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
        disabled={!canCapture}
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
