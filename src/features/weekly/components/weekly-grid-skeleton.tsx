import { Skeleton } from "@/components/ui/skeleton";

const SKELETON_ROWS = 4;
const WEEK_DAYS = 7;

export const WeeklyGridSkeleton = () => {
  return (
    <div className="flex-1 min-h-0 overflow-hidden px-4 sm:px-6 lg:px-8 pb-8 flex flex-col">
      <div className="pb-4 flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Scrollable Container */}
        <div className="flex-1 min-h-0 overflow-auto rounded-2xl border border-border bg-card shadow-sm relative">
          {/* Grid */}
          <div className="grid grid-cols-[80px_repeat(7,1fr)] md:grid-cols-[120px_repeat(7,1fr)] min-w-[800px] md:min-w-full min-h-full">
            {/* Header Row */}
            <div className="sticky top-0 z-30 bg-gray-50/95 dark:bg-gray-950/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800 grid grid-cols-subgrid col-span-full">
              {/* Member Column Header */}
              <div className="sticky left-0 z-40 bg-gray-50/95 dark:bg-gray-950/95 backdrop-blur-sm flex items-center justify-center border-r border-gray-200 dark:border-gray-800 p-3">
                <Skeleton className="h-3 w-12" />
              </div>
              {/* Day Column Headers */}
              {Array.from({ length: WEEK_DAYS }).map((_, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center justify-center p-2 md:p-3 border-r border-gray-100 dark:border-gray-800 last:border-r-0 gap-1"
                >
                  <Skeleton className="h-3 w-6" />
                  <Skeleton className="h-5 w-5 mt-1" />
                </div>
              ))}
            </div>

            {/* Member Rows */}
            {Array.from({ length: SKELETON_ROWS }).map((_, rowIndex) => (
              <div key={rowIndex} className="contents">
                {/* Member Cell */}
                <div className="sticky left-0 z-20 bg-card border-r border-b border-border">
                  <div className="w-full h-full flex flex-col items-center justify-center p-1 md:p-2 gap-1 md:gap-2 border-l-4 border-muted">
                    <Skeleton className="w-8 h-8 md:w-12 md:h-12 rounded-full" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                </div>

                {/* Day Cells */}
                {Array.from({ length: WEEK_DAYS }).map((_, colIndex) => (
                  <div
                    key={colIndex}
                    className="min-h-[80px] md:min-h-[100px] p-1 md:p-2 border-r border-b border-border last:border-r-0 flex flex-col gap-1"
                  >
                    {/* Random schedule skeleton items */}
                    {(rowIndex + colIndex) % 3 === 0 && (
                      <Skeleton className="h-8 w-full rounded-md" />
                    )}
                    {(rowIndex + colIndex) % 4 === 0 && (
                      <Skeleton className="h-8 w-full rounded-md" />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
