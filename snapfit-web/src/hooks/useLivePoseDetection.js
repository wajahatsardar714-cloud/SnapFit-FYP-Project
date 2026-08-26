import { useEffect, useRef, useState } from 'react';

// Same package version on the client (WASM) and server (Python mediapipe==1.0.1, see
// snapfit-ai/requirements.txt) so the two never drift apart.
const TASKS_VISION_VERSION = '1.0.1';
const WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const MODEL_ASSET_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const DEFAULT_THROTTLE_MS = 200;
const VISIBILITY_THRESHOLD = 0.6;
const EDGE_MARGIN = 0.04;
const MIN_BODY_SPAN = 0.45;
// Must stay below (1 - 2*EDGE_MARGIN): once every required landmark is inside the
// edge margin, the max possible span is 1 - 2*EDGE_MARGIN (0.92 here). A higher
// value made this branch unreachable — "too close" always fell through to the
// edge-crop check instead.
const MAX_BODY_SPAN = 0.85;

// A low-end device that's too slow to compile/run the WASM model will also be too
// slow to load it promptly, so a single load timeout doubles as the "runs too
// slowly" signal Prompt 28 asks for — see LiveCapture's poseError fallback.
const MODEL_LOAD_TIMEOUT_MS = 6000;

// Same landmarks the server-side confidence check requires (snapfit-ai/app/utils.py
// REQUIRED_LANDMARKS) — a photo that fails this client-side gate would also score
// poorly server-side, so gating on the same set catches bad framing before upload.
const REQUIRED_LANDMARK_INDEX = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};

export const REQUIRED_LANDMARKS = Object.keys(REQUIRED_LANDMARK_INDEX);

// landmarks: the 33-point array from PoseLandmarker's VIDEO-mode result
// (result.landmarks[0]), normalized to [0, 1] image coordinates.
export function evaluateFraming(landmarks) {
  const missingLandmarks = [];
  const points = {};

  for (const [name, index] of Object.entries(REQUIRED_LANDMARK_INDEX)) {
    const point = landmarks[index];
    if (!point || (point.visibility ?? 0) < VISIBILITY_THRESHOLD) {
      missingLandmarks.push(name);
    } else {
      points[name] = point;
    }
  }

  if (missingLandmarks.length > 0) {
    return { isFramedCorrectly: false, missingLandmarks, reason: 'MISSING_LANDMARKS' };
  }

  const xs = Object.values(points).map((p) => p.x);
  const ys = Object.values(points).map((p) => p.y);
  const nearEdge = xs.some((x) => x < EDGE_MARGIN || x > 1 - EDGE_MARGIN) || ys.some((y) => y < EDGE_MARGIN || y > 1 - EDGE_MARGIN);
  if (nearEdge) {
    return { isFramedCorrectly: false, missingLandmarks: [], reason: 'TOO_CLOSE_TO_EDGE' };
  }

  const shoulderY = Math.min(points.LEFT_SHOULDER.y, points.RIGHT_SHOULDER.y);
  const ankleY = Math.max(points.LEFT_ANKLE.y, points.RIGHT_ANKLE.y);
  const bodySpan = ankleY - shoulderY;
  if (bodySpan < MIN_BODY_SPAN) {
    return { isFramedCorrectly: false, missingLandmarks: [], reason: 'TOO_FAR' };
  }
  if (bodySpan > MAX_BODY_SPAN) {
    return { isFramedCorrectly: false, missingLandmarks: [], reason: 'TOO_CLOSE' };
  }

  return { isFramedCorrectly: true, missingLandmarks: [], reason: null };
}

let sharedLandmarkerPromise = null;

async function createLandmarker() {
  // Dynamic import so @mediapipe/tasks-vision (and its WASM) is code-split into its
  // own chunk and only ever fetched once this function actually runs — i.e. once a
  // shopper opens the camera tab, never on initial widget/page load.
  const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
  const vision = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
  const baseOptions = { modelAssetPath: MODEL_ASSET_URL };
  try {
    return await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { ...baseOptions, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
    });
  } catch {
    return PoseLandmarker.createFromOptions(vision, {
      baseOptions: { ...baseOptions, delegate: 'CPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
    });
  }
}

function getSharedLandmarker() {
  if (!sharedLandmarkerPromise) {
    sharedLandmarkerPromise = createLandmarker().catch((err) => {
      sharedLandmarkerPromise = null;
      throw err;
    });
  }
  return sharedLandmarkerPromise;
}

// Runs the lite PoseLandmarker model against a live <video> element for real-time
// framing feedback only. These landmarks never leave the browser — the actual
// measurement landmarks still come from the server-side BlazePose pipeline
// (snapfit-ai) once a photo is captured and uploaded.
export function useLivePoseDetection(videoRef, { enabled = true, throttleMs = DEFAULT_THROTTLE_MS } = {}) {
  const [isModelReady, setIsModelReady] = useState(false);
  const [isFramedCorrectly, setIsFramedCorrectly] = useState(false);
  const [missingLandmarks, setMissingLandmarks] = useState(REQUIRED_LANDMARKS);
  const [framingReason, setFramingReason] = useState(null);
  const [error, setError] = useState(null);
  const landmarkerRef = useRef(null);

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

    getSharedLandmarker()
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
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !isModelReady) return undefined;

    let rafId;
    let lastDetectAt = 0;
    let lastVideoTime = -1;

    function tick() {
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;

      if (video && landmarker && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        const now = performance.now();
        if (now - lastDetectAt >= throttleMs) {
          lastDetectAt = now;
          lastVideoTime = video.currentTime;

          const result = landmarker.detectForVideo(video, now);
          const landmarks = result.landmarks?.[0];

          if (!landmarks) {
            setIsFramedCorrectly(false);
            setMissingLandmarks(REQUIRED_LANDMARKS);
            setFramingReason('NO_BODY_DETECTED');
          } else {
            const framing = evaluateFraming(landmarks);
            setIsFramedCorrectly(framing.isFramedCorrectly);
            setMissingLandmarks(framing.missingLandmarks);
            setFramingReason(framing.reason);
          }
        }
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      // Drop stale results so a later re-enable (e.g. after Retake) starts from a
      // clean slate instead of a frozen "framed correctly" from the prior session.
      setIsFramedCorrectly(false);
      setMissingLandmarks(REQUIRED_LANDMARKS);
      setFramingReason(null);
    };
    // videoRef is a stable ref object, not a reactive value — intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, isModelReady, throttleMs]);

  return { isModelReady, isFramedCorrectly, missingLandmarks, framingReason, error };
}
