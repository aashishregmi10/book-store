import { Skeleton, BookGridSkeleton } from "@/components/ui/Skeleton";

export default function GenreLoading() {
  return (
    <div className="shell py-10">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-4 h-12 w-80" />
      <Skeleton className="mt-4 h-4 w-full max-w-2xl" />
      <Skeleton className="mt-2 h-4 w-2/3 max-w-xl" />
      <div className="mt-10">
        <BookGridSkeleton count={8} />
      </div>
    </div>
  );
}
