import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const CardMemberSkeleton = () => {
  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-[24px]",
        "h-full min-h-[240px] md:min-h-[260px] bg-card border border-border"
      )}
    >
      {/* Header Section */}
      <Skeleton className="h-24 rounded-none rounded-t-[24px]" />

      {/* Profile Image (Overlapping) */}
      <div className="absolute top-14 md:top-12 left-4 z-10">
        <Skeleton className="h-16 w-16 md:h-20 md:w-20 rounded-full border-4 border-background" />
      </div>

      {/* Body Section */}
      <div className="flex flex-1 flex-col pt-10 pb-4 px-4 bg-muted/30">
        {/* Member Name */}
        <div className="mb-4">
          <Skeleton className="h-6 w-24" />
        </div>

        {/* Schedule Area */}
        <div className="flex flex-col gap-2.5 flex-1">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
};
