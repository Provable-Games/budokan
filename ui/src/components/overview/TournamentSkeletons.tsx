import { Skeleton } from "@/components/ui/skeleton";

interface TournamentSkeletonsProps {
  tournamentsCount: number;
  count?: number; // Optional count parameter to override tournamentsCount
}

const TournamentSkeletons = ({
  tournamentsCount,
  count,
}: TournamentSkeletonsProps) => {
  // Use count if provided, otherwise use tournamentsCount (up to 12 for pagination)
  // Also ensure we have a valid number (default to 3 if undefined or invalid)
  const skeletonCount =
    count ||
    (isFinite(tournamentsCount) && tournamentsCount > 0
      ? Math.min(tournamentsCount, 12)
      : 3);

  // Create an array of the appropriate length safely
  const skeletons = Array.from({ length: skeletonCount }, (_, i) => i);

  return (
    <>
      {skeletons.map((index) => (
        <div
          key={index}
          className="h-36 sm:h-44 animate-in fade-in zoom-in duration-300 ease-out border border-brand-muted rounded-lg bg-background p-3 sm:p-4 overflow-hidden"
        >
          <div className="flex flex-col justify-between h-full gap-1 sm:gap-2">
            {/* Header */}
            <div className="flex flex-row items-center justify-between">
              <Skeleton className="h-4 sm:h-5 flex-1 max-w-[60%]" />
              <div className="flex flex-row gap-1 sm:gap-2 flex-shrink-0">
                <Skeleton className="h-4 w-8 sm:w-12" />
                <Skeleton className="h-4 w-6 sm:w-10" />
              </div>
            </div>
            <div className="hidden sm:block w-full h-0.5 bg-brand/25" />
            {/* Badges + Icon */}
            <div className="flex flex-row justify-between items-start sm:items-center gap-2">
              <div className="flex flex-wrap gap-1">
                <Skeleton className="h-5 w-14 sm:h-6 sm:w-16 rounded-md" />
                <Skeleton className="h-5 w-12 sm:h-6 sm:w-16 rounded-md" />
              </div>
              <Skeleton className="h-8 w-8 sm:h-10 sm:w-10 rounded-full flex-shrink-0" />
            </div>
            {/* Footer */}
            <div className="flex flex-col gap-1">
              <div className="flex flex-row justify-center items-center gap-3 sm:gap-4">
                <Skeleton className="h-4 w-14 sm:w-16" />
                <Skeleton className="h-4 w-14 sm:w-16" />
              </div>
              <div className="flex justify-center">
                <Skeleton className="h-6 w-32 sm:h-8 sm:w-44" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </>
  );
};

export default TournamentSkeletons;
