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
          <div className="flex flex-col h-full">
            {/* Zone A — Header */}
            <div className="flex flex-row items-center justify-between">
              <div className="flex flex-row items-center gap-1.5 flex-1 min-w-0">
                <Skeleton className="h-5 w-16 sm:w-20 rounded-md flex-shrink-0" />
                <Skeleton className="h-4 flex-1 max-w-[50%]" />
              </div>
              <Skeleton className="h-6 w-6 sm:h-7 sm:w-7 rounded-full flex-shrink-0" />
            </div>

            {/* Divider */}
            <div className="w-full h-px bg-brand/15 my-1" />

            {/* Zone B — Hero (Prize Pool) */}
            <div className="flex flex-col items-center justify-center flex-1 min-h-0 gap-1">
              <div className="flex flex-row items-center gap-1.5">
                <Skeleton className="h-5 w-5 sm:h-6 sm:w-6 rounded-full" />
                <Skeleton className="h-6 w-20 sm:h-8 sm:w-28" />
              </div>
              <Skeleton className="h-2.5 w-14 sm:w-16" />
            </div>

            {/* Divider */}
            <div className="w-full h-px bg-brand/15 my-1" />

            {/* Zone C — Footer */}
            <div className="flex flex-row justify-between items-center">
              <div className="flex flex-col items-center gap-0.5">
                <Skeleton className="h-4 w-10 sm:w-12" />
                <Skeleton className="h-2.5 w-8" />
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <Skeleton className="h-4 w-8 sm:w-10" />
                <Skeleton className="h-2.5 w-10" />
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <Skeleton className="h-4 w-16 sm:w-20" />
                <Skeleton className="h-2.5 w-8" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </>
  );
};

export default TournamentSkeletons;
