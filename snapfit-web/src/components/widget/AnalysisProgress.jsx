import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

// Staged copy for a request that also renders a try-on, which can take up to a
// minute on the GPU. Each stage starts once `after` seconds have passed.
const TRY_ON_STAGES = [
  { after: 0, message: 'Measuring you…' },
  { after: 5, message: 'Creating your try-on preview — this can take up to a minute.' },
  { after: 30, message: 'Almost there — your preview is still rendering…' },
];

function stageMessage(elapsedSeconds, includesTryOn) {
  if (!includesTryOn) return TRY_ON_STAGES[0].message;
  return TRY_ON_STAGES.filter((stage) => elapsedSeconds >= stage.after).at(-1).message;
}

// Loading step of the widget: a spinner, the current stage and the seconds
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
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <Loader2 size={32} className="animate-spin text-foreground" aria-hidden="true" />
      <p role="status" className="mt-4 text-sm font-medium text-foreground">
        {stageMessage(elapsedSeconds, includesTryOn)}
      </p>
      <p className="mt-1 text-xs tabular-nums text-muted-foreground">{elapsedSeconds} s elapsed</p>
    </div>
  );
}

export default AnalysisProgress;
