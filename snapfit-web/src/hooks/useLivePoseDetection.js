import { useCallback, useEffect, useRef, useState } from 'react';
import { BRIGHTNESS_SAMPLE_SIZE, DETECTION_INTERVAL_MS, PASS_GRACE_MS, POSE_RULES } from '../config/poseConfig';
import { primaryInstruction, validatePose } from '../utils/poseValidation';

// Same package version on the client (WASM) and server (Python mediapipe==1.0.1, see
// snapfit-ai/requirements.txt) so the two never drift apart.
const TASKS_VISION_VERSION = '1.0.1';
const WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const MODEL_ASSET_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

// A low-end device that's too slow to compile/run the WASM model will also be too
// slow to load it promptly, so a single load timeout doubles as the "runs too
// slowly" signal -- see LiveCapture's poseError fallback.
const MODEL_LOAD_TIMEOUT_MS = 6000;

// Frames kept for the stillness check: its window plus one detection of slack.
const HISTORY_MS = POSE_RULES.stillnessWindowMs + DETECTION_INTERVAL_MS;

const SKELETON = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24],
  [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 29], [28, 30],
];

async function createLandmarker() {
  // Dynamic import so @mediapipe/tasks-vision (and its WASM) is code-split into its
  // own chunk and only fetched once a shopper opens the camera.
  const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
  const vision = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL_ASSET_URL, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
  try {
    return await PoseLandmarker.createFromOptions(vision, options('GPU'));
  } catch {
    return PoseLandmarker.createFromOptions(vision, options('CPU'));
  }
}

// One landmarker shared by every mounted camera, closed (freeing its WASM/GPU
// memory) when the last one unmounts.
const shared = { promise: null, users: 0 };

function acquireLandmarker() {
  shared.users += 1;
  if (!shared.promise) {
    shared.promise = createLandmarker().catch((err) => {
      shared.promise = null;
      throw err;
    });
  }
  return shared.promise;
}

function releaseLandmarker() {
  shared.users -= 1;
  if (shared.users > 0 || !shared.promise) return;
  const closing = shared.promise;
  shared.promise = null;
  closing.then((landmarker) => landmarker.close()).catch(() => {});
}

// detectForVideo needs strictly increasing timestamps across every call.
let lastTimestamp = 0;
function nextTimestamp() {
  lastTimestamp = Math.max(lastTimestamp + 1, performance.now());
  return lastTimestamp;
}

function measureBrightness(source, sampleCanvas) {
  const size = BRIGHTNESS_SAMPLE_SIZE;
  sampleCanvas.width = size;
  sampleCanvas.height = size;
  const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return total / (size * size);
}

function clearOverlay(canvas) {
  canvas?.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

// Canvas needs a concrete colour string: read the theme token in effect at the
// canvas (the camera viewport is dark-scoped).
function tokenColor(element, name) {
  return `rgb(${getComputedStyle(element).getPropertyValue(`--color-${name}`).trim()})`;
}

function drawSkeleton(canvas, video, landmarks, tone) {
  if (!canvas) return;
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  clearOverlay(canvas);
  if (!landmarks) return;
  const ctx = canvas.getContext('2d');

  const scale = Math.max(canvas.width, canvas.height) / 400;
  const visible = (lm) => lm && (lm.visibility ?? 0) >= POSE_RULES.visibilityThreshold;
  const color = tokenColor(canvas, tone);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2 * scale;
  ctx.lineCap = 'round';
  for (const [a, b] of SKELETON) {
    if (!visible(landmarks[a]) || !visible(landmarks[b])) continue;
    ctx.beginPath();
    ctx.moveTo(landmarks[a].x * canvas.width, landmarks[a].y * canvas.height);
    ctx.lineTo(landmarks[b].x * canvas.width, landmarks[b].y * canvas.height);
    ctx.stroke();
  }
}

// Only re-render when what the shopper sees would change.
const summarize = (result) =>
  `${result.ok}|${result.checks.map((c) => `${c.id}:${c.passed ? 1 : 0}`).join(',')}|${primaryInstruction(result)}`;

// Runs the lite PoseLandmarker model against a live <video> for real-time pose
// gating. These landmarks never leave the browser -- the measurement landmarks
// still come from the server-side BlazePose pipeline after capture.
//
// overlayRef: optional <canvas> to draw the detected skeleton on (drawn
// directly, no React state per frame). resetKey: change it (e.g. on camera
// switch) to restart the stillness history and gate.
export function useLivePoseDetection(videoRef, { enabled = true, overlayRef = null, resetKey = null } = {}) {
  const [isModelReady, setIsModelReady] = useState(false);
  const [validation, setValidation] = useState(null);
  const [error, setError] = useState(null);
  const landmarkerRef = useRef(null);
  const sampleCanvasRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      setIsModelReady(false);
      return undefined;
    }
    let cancelled = false;
    setError(null);

    const timeoutId = setTimeout(() => {
      cancelled = true;
      setError('The live pose guide is taking too long to load on this device.');
    }, MODEL_LOAD_TIMEOUT_MS);

    acquireLandmarker()
      .then((landmarker) => {
        if (cancelled) return;
        clearTimeout(timeoutId);
        landmarkerRef.current = landmarker;
        setIsModelReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        clearTimeout(timeoutId);
        setError(err?.message || 'Failed to load the live pose model');
      });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      landmarkerRef.current = null;
      setIsModelReady(false);
      releaseLandmarker();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !isModelReady) return undefined;

    let rafId;
    let lastDetectAt = 0;
    let lastVideoTime = -1;
    let lastSummary = null;
    let lastPass = null; // { time, result } of the most recent passing frame
    const history = [];
    sampleCanvasRef.current ??= document.createElement('canvas');

    function tick() {
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      const now = performance.now();

      if (
        video &&
        landmarker &&
        video.readyState >= 2 &&
        video.currentTime !== lastVideoTime &&
        now - lastDetectAt >= DETECTION_INTERVAL_MS
      ) {
        lastDetectAt = now;
        lastVideoTime = video.currentTime;

        const landmarks = landmarker.detectForVideo(video, nextTimestamp()).landmarks?.[0] ?? null;
        if (landmarks) history.push({ time: now, landmarks });
        while (history.length && history[0].time < now - HISTORY_MS) history.shift();

        const result = validatePose(landmarks, {
          aspectRatio: video.videoWidth / video.videoHeight,
          brightness: measureBrightness(video, sampleCanvasRef.current),
          history: landmarks ? history : null,
        });
        // Grace period: a brief failure right after a pass (one jittery frame)
        // keeps reporting the pass, so the countdown isn't reset.
        if (result.ok) lastPass = { time: now, result };
        const shown = !result.ok && lastPass && now - lastPass.time < PASS_GRACE_MS ? lastPass.result : result;
        drawSkeleton(overlayRef?.current, video, landmarks, shown.ok ? 'success' : 'foreground');

        const summary = summarize(shown);
        if (summary !== lastSummary) {
          lastSummary = summary;
          setValidation(shown);
        }
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      clearOverlay(overlayRef?.current);
      // Start the next session (retake, camera switch) from a clean gate.
      setValidation(null);
    };
    // videoRef/overlayRef are stable ref objects, not reactive values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, isModelReady, resetKey]);

  // Re-checks a captured still (canvas) before it's accepted -- the frame that
  // was actually saved, not just the last live one. Stillness is n/a for a still.
  const checkFrame = useCallback((canvas) => {
    const landmarker = landmarkerRef.current;
    if (!landmarker) return null;
    sampleCanvasRef.current ??= document.createElement('canvas');
    const landmarks = landmarker.detectForVideo(canvas, nextTimestamp()).landmarks?.[0] ?? null;
    return validatePose(landmarks, {
      aspectRatio: canvas.width / canvas.height,
      brightness: measureBrightness(canvas, sampleCanvasRef.current),
    });
  }, []);

  return { isModelReady, validation, error, checkFrame };
}
