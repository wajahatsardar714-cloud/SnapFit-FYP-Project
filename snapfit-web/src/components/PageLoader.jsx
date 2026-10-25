import { Loader2 } from 'lucide-react';

// Suspense fallback while a lazily loaded page downloads. `fullScreen` fills
// the viewport (no layout around it yet); otherwise it fills the content area.
function PageLoader({ fullScreen = false }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`flex items-center justify-center bg-background ${fullScreen ? 'min-h-screen' : 'min-h-[50vh]'}`}
    >
      <Loader2 aria-hidden="true" className="animate-spin text-muted" size={28} />
    </div>
  );
}

export default PageLoader;
