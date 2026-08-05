import { Skeleton, BookGridSkeleton } from "@/components/ui/Skeleton";

/**
 * Catalogue skeleton — scoped to /books ONLY by the `(catalogue)` route group.
 *
 * Do not move this back up to `app/books/`. A loading.tsx wraps its own page
 * *and every segment nested below it* in one Suspense boundary, so sitting at
 * `app/books/` it also covered `/books/[slug]`. Opening any book from the
 * homepage, a genre page or search therefore flashed this full 25-card grid
 * with a filter rail — a catalogue page that was never being navigated to —
 * before the book detail appeared.
 *
 * The route group keeps the URL as /books while making `[slug]` a sibling
 * rather than a child, so the book page now shows its own skeleton.
 */
export default function BooksLoading() {
  return (
    <div className="shell py-10">
      <Skeleton className="h-10 w-64" />
      <div className="mt-6 grid gap-8 lg:grid-cols-[16rem_1fr]">
        <div className="hidden space-y-4 lg:block">
          {Array.from({ length: 6 }).map((_, i) => (
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
            <BookGridSkeleton count={25} className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" />
          </div>
        </div>
      </div>
    </div>
  );
}
