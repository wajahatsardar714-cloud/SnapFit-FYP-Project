import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

// Staged copy for a request that also renders a try-on, which can take up to a
// minute on the GPU. Each stage starts once `after` seconds have passed.
const TRY_ON_STAGES = [
  { after: 0, message: 'Measuring you…' },
  { after: 5, message: 'Creating your try-on preview — this can take up to a minute.' },
  { after: 30, message: 'Almost there — your preview is still rendering…' },
];

// The checklist under the scan: each step is current from `after` seconds
// until the next one starts; the last stays current until the result arrives.
const STEPS = [
  { after: 0, label: 'Finding your pose' },
  { after: 2, label: 'Measuring your body' },
  { after: 4, label: 'Matching the size chart' },
  { after: 5, label: 'Creating your try-on preview', tryOnOnly: true },
];

// The body outline the scan line sweeps over (the homepage art's figure).
const SILHOUETTE =
  'M140 118 L180 118 L206 128 Q214 132 214 142 L218 222 Q218 230 210 230 L204 230 L200 150 L196 150 L194 228 L190 300 L168 300 L162 240 L158 240 L152 300 L130 300 L126 228 L124 150 L120 150 L116 230 L110 230 Q102 230 102 222 L106 142 Q106 132 114 128 Z';

function stageMessage(elapsedSeconds, includesTryOn) {
  if (!includesTryOn) return TRY_ON_STAGES[0].message;
  return TRY_ON_STAGES.filter((stage) => elapsedSeconds >= stage.after).at(-1).message;
}

function ScanFigure() {
  return (
    <div aria-hidden="true" className="relative h-44 w-32">
      {/* Viewfinder corners, like the logo. */}
      <span className="absolute left-0 top-0 h-5 w-5 rounded-tl-lg border-l-2 border-t-2 border-primary" />
      <span className="absolute right-0 top-0 h-5 w-5 rounded-tr-lg border-r-2 border-t-2 border-primary" />
      <span className="absolute bottom-0 left-0 h-5 w-5 rounded-bl-lg border-b-2 border-l-2 border-primary" />
      <span className="absolute bottom-0 right-0 h-5 w-5 rounded-br-lg border-b-2 border-r-2 border-primary" />
      <svg viewBox="92 66 136 244" className="absolute inset-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)]">
        <circle cx="160" cy="94" r="20" className="fill-primary/15" />
        <rect x="152" y="108" width="16" height="14" className="fill-primary/15" />
        <path d={SILHOUETTE} className="fill-primary/15 stroke-primary/40" strokeWidth="2" />
      </svg>
      {/* The scan: a soft glow with a bright line through it. */}
      <div className="absolute inset-x-2 h-10 -translate-y-1/2 animate-scan">
        <div className="h-full w-full bg-gradient-to-b from-transparent via-primary/20 to-transparent" />
        <div className="absolute inset-x-0 top-1/2 h-0.5 rounded-full bg-primary" />
      </div>
    </div>
  );
}

function StepList({ elapsedSeconds, includesTryOn }) {
  const steps = STEPS.filter((step) => includesTryOn || !step.tryOnOnly);
  const current = steps.filter((step) => elapsedSeconds >= step.after).length - 1;
  return (
    <ol className="mt-5 w-full max-w-xs space-y-2 text-left text-sm">
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={step.label} className={`flex items-center gap-2.5 ${i <= current ? 'animate-fade-in' : ''}`}>
            <span
              aria-hidden="true"
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                done ? 'bg-success text-primary-foreground' : active ? 'bg-primary-soft' : 'border border-border'
              }`}
            >
              {done && <Check size={12} strokeWidth={3} />}
              {active && <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />}
            </span>
            <span className={done ? 'text-muted-foreground' : active ? 'font-medium text-foreground' : 'text-muted'}>
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// Loading step of the widget: a body outline being scanned, the current stage,
// a checklist of what's happening, an indeterminate bar and the seconds
// elapsed. Mounted only while the request is in flight, so its timer stops as
// soon as the result (or an error) replaces it.
function AnalysisProgress({ includesTryOn }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex animate-fade-in flex-col items-center justify-center py-6 text-center">
      <ScanFigure />
      <p role="status" className="mt-5 text-sm font-medium text-foreground">
        {stageMessage(elapsedSeconds, includesTryOn)}
      </p>
      <StepList elapsedSeconds={elapsedSeconds} includesTryOn={includesTryOn} />
      <div className="mt-5 h-1 w-full max-w-xs overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        <div className="h-full w-2/5 animate-progress rounded-full bg-primary" />
      </div>
      <p className="mt-2 text-xs tabular-nums text-muted-foreground">{elapsedSeconds} s elapsed</p>
    </div>
  );
}

export default AnalysisProgress;
