import { Skeleton } from "@/components/ui/Skeleton";

export default function BookDetailLoading() {
  return (
    <div className="shell py-10">
      <Skeleton className="h-4 w-48" />
      <div className="mt-6 grid gap-10 md:grid-cols-[320px_minmax(0,1fr)]">
        <Skeleton className="aspect-[2/3] w-full" />
        <div>
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="mt-3 h-4 w-40" />
          <Skeleton className="mt-6 h-8 w-32" />
          <Skeleton className="mt-6 h-12 w-full max-w-xs" />
          <div className="mt-8 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </div>
    </div>
  );
}
