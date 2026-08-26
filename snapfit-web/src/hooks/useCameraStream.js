import { useEffect, useState } from 'react';

// idle -> requesting -> granted, or requesting -> denied | unavailable
// granted -> unavailable if a track ends unexpectedly (unplugged, OS revokes
// permission, another app takes the device) mid-session.
export function useCameraStream({ enabled }) {
  const [stream, setStream] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

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

    navigator.mediaDevices
      // Front camera by default so the shopper can see the live framing feedback
      // (silhouette/border/status text) this feature exists to show them.
      .getUserMedia({ video: { facingMode: { ideal: 'user' } }, audio: false })
      .then((mediaStream) => {
        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        mediaStream.getTracks().forEach((track) => track.addEventListener('ended', handleTrackEnded));
        setStream(mediaStream);
        setStatus('granted');
      })
      .catch((err) => {
        if (cancelled) return;
        const unavailable = err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError';
        setStatus(unavailable ? 'unavailable' : 'denied');
        setError(err?.message || 'Camera access was denied.');
      });

    return () => {
      cancelled = true;
      setStream((current) => {
        current?.getTracks().forEach((track) => {
          track.removeEventListener('ended', handleTrackEnded);
          track.stop();
        });
        return null;
      });
    };
  }, [enabled]);

  return { stream, status, error };
}
