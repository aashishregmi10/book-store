import { Skeleton, BookGridSkeleton } from "@/components/ui/Skeleton";

export default function GenreLoading() {
  return (
    <div className="mx-auto max-w-[1600px] px-6 py-10 sm:px-8 lg:px-16 xl:px-24">
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
