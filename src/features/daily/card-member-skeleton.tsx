import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const CardMemberSkeleton = () => {
  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-[24px]",
        "h-full min-h-[216px] md:min-h-[232px] bg-card border border-border"
      )}
    >
      {/* Header Section */}
      <Skeleton className="h-20 rounded-none rounded-t-[24px]" />

      {/* Profile Image (Overlapping) */}
      <div className="absolute left-4 top-4 z-10">
        <Skeleton className="h-[5.5rem] w-[5.5rem] rounded-full border-4 border-background" />
      </div>

      {/* Body Section */}
      <div className="flex flex-1 flex-col px-4 pb-3 pt-10 bg-muted/30">
        {/* Member Name */}
        <div className="mb-3">
          <Skeleton className="h-7 w-32" />
        </div>

        {/* Schedule Area */}
        <div className="flex flex-col gap-2 flex-1">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
};
