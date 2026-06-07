import { Skeleton, TableSkeleton } from "@/components/ui/Skeleton";

export default function AdminLoading() {
  return (
    <div>
      <Skeleton className="h-9 w-48" />
      <div className="mt-6">
        <TableSkeleton rows={6} cols={4} />
      </div>
    </div>
  );
}
