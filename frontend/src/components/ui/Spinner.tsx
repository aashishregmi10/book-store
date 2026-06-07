import { Loader2 } from "lucide-react";

/** Inline spinner — drop into buttons or beside text. */
export function Spinner({ className = "size-4" }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden />;
}

/** Centered spinner + label for a whole panel/section. */
export function PageSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 font-body text-sm text-muted" role="status">
      <Spinner className="size-5 text-accent" />
      {label}
    </div>
  );
}
