import { Skeleton } from "@/components/ui/skeleton";

/**
 * 개별 VOD 카드 스켈레톤
 */
export const VodCardSkeleton = () => {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card">
      {/* 썸네일 */}
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        <Skeleton className="h-full w-full rounded-none" />
        <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-background/50 px-1.5 py-1 backdrop-blur-md">
          <Skeleton className="h-5 w-5 rounded-full" />
          <Skeleton className="h-3 w-14" />
        </div>
        <Skeleton className="absolute bottom-2 right-2 h-4 w-10 rounded" />
      </div>

      {/* 정보 */}
      <div className="flex flex-col gap-1.5 p-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-28" />
      </div>
    </div>
  );
};

/**
 * VODs 그리드 전체 스켈레톤
 */
export const VodsGridSkeleton = () => {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-8 pt-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <VodCardSkeleton key={i} />
      ))}
    </div>
  );
};
