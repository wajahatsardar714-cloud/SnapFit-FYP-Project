// Shimmering placeholders shown while a page's data loads, shaped like what
// is coming so the layout doesn't jump when it arrives.

// One grey block with a light sweep across it.
export function Skeleton({ className = '' }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-shimmer rounded-lg bg-gradient-to-r from-surface-2 via-border to-surface-2 bg-[length:200%_100%] ${className}`}
    />
  );
}

// A dashboard page loading: title, four stat tiles and two cards.
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="animate-fade-in">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    </div>
  );
}

// Rows of a list or table loading.
export function ListSkeleton({ rows = 4 }) {
  return (
    <div role="status" aria-label="Loading" className="animate-fade-in space-y-3 p-6">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10" />
      ))}
    </div>
  );
}
