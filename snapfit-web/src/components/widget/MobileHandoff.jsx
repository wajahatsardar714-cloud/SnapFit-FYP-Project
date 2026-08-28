import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Loader2, RefreshCw, Smartphone } from 'lucide-react';

const POLL_INTERVAL_MS = 2000;

function isLocalHostname(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

// A phone can never resolve "localhost" back to this machine. When the desktop
// page itself was loaded via localhost (the common local-dev/testing case), swap
// in the backend-reported LAN IP so the QR code actually points somewhere the
// phone can reach. In production the widget's real origin is already a public
// (or at least LAN-real) hostname, so this is a no-op there.
async function resolvePhoneReachableOrigin(apiBase) {
  const { hostname, protocol, port } = window.location;
  if (!isLocalHostname(hostname)) {
    return window.location.origin;
  }

  try {
    const res = await fetch(`${apiBase}/network-info`);
    const data = await res.json();
    if (data.lanIp) {
      return `${protocol}//${data.lanIp}${port ? `:${port}` : ''}`;
    }
  } catch {
    // fall through to the (unreachable-from-phone) origin below
  }
  return window.location.origin;
}

function MobileHandoff({ apiKey, apiUrl, onCapture, onSwitchToUpload }) {
  const [status, setStatus] = useState('creating'); // creating | waiting | expired | error
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const pollIdRef = useRef(null);
  const sessionIdRef = useRef(null);

  const apiBase = apiUrl.replace(/\/$/, '');

  async function startSession() {
    clearInterval(pollIdRef.current);
    setStatus('creating');
    setErrorMessage('');

    try {
      const createRes = await fetch(`${apiBase}/handoff/sessions`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey },
      });
      const createData = await createRes.json().catch(() => null);
      if (!createRes.ok || !createData?.sessionId) {
        setErrorMessage(createData?.message || 'Could not start a phone handoff session.');
        setStatus('error');
        return;
      }

      sessionIdRef.current = createData.sessionId;
      const origin = await resolvePhoneReachableOrigin(apiBase);
      const targetUrl = `${origin}/mobile-capture/${createData.sessionId}`;
      const dataUrl = await QRCode.toDataURL(targetUrl, { width: 220, margin: 1 });

      setQrDataUrl(dataUrl);
      setStatus('waiting');
      pollIdRef.current = setInterval(pollStatus, POLL_INTERVAL_MS);
    } catch {
      setErrorMessage("Couldn't reach SnapFit's servers. Please try again.");
      setStatus('error');
    }
  }

  async function pollStatus() {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;

    try {
      const res = await fetch(`${apiBase}/handoff/sessions/${sessionId}`, {
        headers: { 'x-api-key': apiKey },
      });
      const data = await res.json().catch(() => null);

      if (data?.status === 'ready') {
        clearInterval(pollIdRef.current);
        const photoRes = await fetch(`${apiBase}/handoff/sessions/${sessionId}/photo`, {
          headers: { 'x-api-key': apiKey },
        });
        if (!photoRes.ok) {
          setErrorMessage('The photo could not be retrieved. Please try again.');
          setStatus('error');
          return;
        }
        const blob = await photoRes.blob();
        onCapture(new File([blob], `snapfit-handoff-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' }));
        return;
      }

      if (data?.status === 'expired' || data?.status === 'not_found') {
        clearInterval(pollIdRef.current);
        setStatus('expired');
      }
    } catch {
      // A single failed poll isn't fatal -- the interval just tries again.
    }
  }

  useEffect(() => {
    startSession();
    return () => clearInterval(pollIdRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'creating') {
    return (
      <div className="flex flex-col items-center gap-2 py-10">
        <Loader2 className="animate-spin text-gray-400" size={24} />
        <p className="text-sm text-gray-500">Preparing your phone handoff…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm text-red-600">{errorMessage}</p>
        <button
          type="button"
          onClick={startSession}
          className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw size={14} />
          Try again
        </button>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm text-gray-600">This QR code expired.</p>
        <button
          type="button"
          onClick={startSession}
          className="flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
        >
          <RefreshCw size={14} />
          Generate a new code
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
        <Smartphone size={16} />
        Scan with your phone
      </div>
      {qrDataUrl && <img src={qrDataUrl} alt="QR code to continue on your phone" className="h-44 w-44 rounded-lg border border-gray-200 p-2" />}
      <p className="flex items-center gap-1.5 text-xs text-gray-500">
        <Loader2 size={12} className="animate-spin" />
        Waiting for your phone…
      </p>
      <p className="max-w-xs text-xs text-gray-400">
        Point your phone&apos;s camera app at this code. It&apos;ll open a page to take your photo — no app needed.
      </p>
      <button type="button" onClick={onSwitchToUpload} className="text-xs font-medium text-gray-600 underline hover:text-gray-900">
        Or upload a photo instead
      </button>
    </div>
  );
}

export default MobileHandoff;
