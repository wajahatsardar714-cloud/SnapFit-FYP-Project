import { useCallback, useEffect, useRef, useState } from 'react';

function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

async function countVideoInputs() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === 'videoinput').length;
  } catch {
    return 0;
  }
}

// Some cameras (most desktop webcams, some Android devices) don't report a
// facingMode, so an `exact` facingMode request fails with OverconstrainedError.
// Fall back to picking a different camera by deviceId.
async function openByDeviceId(previousDeviceId) {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((device) => device.kind === 'videoinput');
  const next = cameras.find((camera) => camera.deviceId && camera.deviceId !== previousDeviceId) || cameras[0];
  if (!next) throw Object.assign(new Error('No camera found.'), { name: 'NotFoundError' });
  return navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: next.deviceId } }, audio: false });
}

async function openCamera(facingMode, { explicitSwitch, previousDeviceId }) {
  // First open: `ideal` so any camera is accepted. After an explicit switch:
  // `exact`, because browsers may otherwise hand back the same camera.
  const constraint = explicitSwitch ? { exact: facingMode } : { ideal: facingMode };
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: constraint }, audio: false });
  } catch (err) {
    if (err?.name !== 'OverconstrainedError') throw err;
    return openByDeviceId(previousDeviceId);
  }
}

// idle -> requesting -> granted, or requesting -> denied | unavailable
// granted -> unavailable if a track ends unexpectedly (unplugged, OS revokes
// permission, another app takes the device) mid-session.
//
// facingMode: 'user' (front) | 'environment' (back). switchCamera() flips it;
// canSwitch is true once more than one camera is known to exist.
export function useCameraStream({ enabled, initialFacingMode = 'user' }) {
  const [stream, setStream] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [facingMode, setFacingMode] = useState(initialFacingMode);
  const [canSwitch, setCanSwitch] = useState(false);
  const streamRef = useRef(null);
  const switchRequestedRef = useRef(false);
  const lastDeviceIdRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return undefined;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable');
      setError('Camera access is not supported in this browser.');
      return undefined;
    }

    let cancelled = false;
    setStatus('requesting');
    setError(null);

    function handleTrackEnded() {
      if (cancelled) return;
      cancelled = true;
      setStream(null);
      setStatus('unavailable');
      setError('The camera connection was lost.');
    }

    const explicitSwitch = switchRequestedRef.current;
    switchRequestedRef.current = false;

    openCamera(facingMode, { explicitSwitch, previousDeviceId: lastDeviceIdRef.current })
      .then(async (mediaStream) => {
        if (cancelled) {
          stopStream(mediaStream);
          return;
        }
        const [track] = mediaStream.getVideoTracks();
        lastDeviceIdRef.current = track?.getSettings?.().deviceId ?? null;
        mediaStream.getTracks().forEach((t) => t.addEventListener('ended', handleTrackEnded));
        streamRef.current = mediaStream;
        setStream(mediaStream);
        setStatus('granted');
        // Device labels/counts are only reliable once permission is granted.
        const cameras = await countVideoInputs();
        if (!cancelled) setCanSwitch(cameras > 1);
      })
      .catch((err) => {
        if (cancelled) return;
        const unavailable = err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError';
        setStatus(unavailable ? 'unavailable' : 'denied');
        setError(err?.message || 'Camera access was denied.');
      });

    return () => {
      cancelled = true;
      // Stop synchronously, before the next getUserMedia call -- many phones
      // can't open the second camera while the first is still running.
      const current = streamRef.current;
      current?.getTracks().forEach((track) => track.removeEventListener('ended', handleTrackEnded));
      stopStream(current);
      streamRef.current = null;
      setStream(null);
    };
  }, [enabled, facingMode]);

  const switchCamera = useCallback(() => {
    switchRequestedRef.current = true;
    setFacingMode((mode) => (mode === 'user' ? 'environment' : 'user'));
  }, []);

  return { stream, status, error, facingMode, switchCamera, canSwitch };
}
