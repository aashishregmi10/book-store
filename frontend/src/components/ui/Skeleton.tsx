// Loading placeholders. Pure presentational (no hooks) so they work in both
// Server Components (route `loading.tsx`) and Client Components.

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-border/70 ${className}`} aria-hidden />;
}

/** A single book-card placeholder (cover + title + author + price). */
export function BookCardSkeleton() {
  return (
    <div className="flex flex-col">
      <Skeleton className="aspect-[2/3] w-full" />
      <Skeleton className="mt-3 h-4 w-3/4" />
      <Skeleton className="mt-2 h-3 w-1/2" />
      <Skeleton className="mt-3 h-4 w-1/3" />
    </div>
  );
}

/** A responsive grid of book-card placeholders. */
export function BookGridSkeleton({ count = 8, className }: { count?: number; className?: string }) {
  return (
    <div className={className ?? "grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4"}>
      {Array.from({ length: count }).map((_, i) => (
        <BookCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** A table placeholder matching the admin list tables. */
export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden border border-border bg-surface">
      <div className="flex gap-4 border-b border-border bg-bg px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A grid of small stat-card placeholders (admin overview KPIs). */
export function StatGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border border-border bg-surface p-5">
          <Skeleton className="size-5" />
          <Skeleton className="mt-3 h-7 w-2/3" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
