import { Skeleton } from "@/components/ui/skeleton";

const RowSkeleton = () => {
  return <Skeleton className="h-5 w-full" />;
};

interface TableSkeletonProps {
  entryCount: number;
  offset: number;
}

const TableSkeleton = ({ entryCount, offset }: TableSkeletonProps) => {
  // Calculate how many items should be in each column
  const totalItems = Math.max(0, Math.min(10, entryCount - offset));

  // First column gets items 1-5 (indices 0-4)
  const firstColumnCount = Math.min(5, totalItems);

  // Second column gets items 6-10 (indices 5-9)
  const secondColumnCount = Math.max(0, totalItems - 5);

  return (
    <div className="flex flex-row gap-10">
      {/* First column - items 1-5 */}
      <div className="flex flex-col gap-1.5 py-2 w-1/2">
        {Array.from({ length: firstColumnCount }).map((_, index) => (
          <RowSkeleton key={index} />
        ))}
      </div>

      {/* Second column - items 6-10 */}
      <div className="flex flex-col gap-1.5 py-2 w-1/2">
        {Array.from({ length: secondColumnCount }).map((_, index) => (
          <RowSkeleton key={index} />
        ))}
      </div>
    </div>
  );
};

export default TableSkeleton;
