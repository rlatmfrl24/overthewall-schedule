import { Skeleton } from "@/components/ui/skeleton";

/**
 * 개별 VOD 카드 스켈레톤
 */
export const VodCardSkeleton = () => {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl bg-card border border-border/50">
      {/* 썸네일 */}
      <Skeleton className="aspect-video w-full rounded-none" />

      {/* 정보 */}
      <div className="flex flex-col gap-2 p-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-12" />
        </div>
      </div>
    </div>
  );
};

/**
 * 멤버 + VOD 카드를 포함한 섹션 스켈레톤
 */
export const VodSectionSkeleton = () => {
  return (
    <div className="flex flex-col overflow-hidden rounded-[20px] bg-card border border-border">
      {/* 헤더 */}
      <Skeleton className="h-[72px] rounded-none rounded-t-[20px]" />

      {/* 헤더 위 프로필/이름 오버레이 */}
      <div className="relative -mt-[72px] flex items-center gap-3 p-4">
        <Skeleton className="w-12 h-12 rounded-full" />
        <Skeleton className="h-5 w-24" />
      </div>

      {/* 콘텐츠 */}
      <div className="flex flex-col flex-1 p-4 gap-4 bg-muted/20">
        <VodCardSkeleton />
      </div>
    </div>
  );
};

/**
 * VODs 그리드 전체 스켈레톤
 */
export const VodsGridSkeleton = () => {
  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <VodSectionSkeleton key={i} />
      ))}
    </div>
  );
};
