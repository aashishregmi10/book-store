import { Skeleton, BookGridSkeleton } from "@/components/ui/Skeleton";

export default function BooksLoading() {
  return (
    <div className="mx-auto max-w-[1600px] px-6 py-10 sm:px-8 lg:px-16 xl:px-24">
      <Skeleton className="h-10 w-64" />
      <div className="mt-6 grid gap-8 lg:grid-cols-[15rem_1fr]">
        <div className="hidden space-y-4 lg:block">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 border-b border-border pb-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ))}
        </div>
        <div>
          <div className="flex items-center justify-between border-b border-border pb-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-48" />
          </div>
          <div className="mt-8">
            <BookGridSkeleton count={9} className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3" />
          </div>
        </div>
      </div>
    </div>
  );
}
