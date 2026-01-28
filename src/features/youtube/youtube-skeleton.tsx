import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface YouTubeVideoCardSkeletonProps {
  variant?: "default" | "short";
}

/**
 * 개별 YouTube 비디오 카드 스켈레톤
 */
export const YouTubeVideoCardSkeleton = ({
  variant = "default",
}: YouTubeVideoCardSkeletonProps) => {
  const isShort = variant === "short";

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl bg-card border border-border/50",
        isShort ? "w-[140px] shrink-0" : "w-[280px] shrink-0"
      )}
    >
      {/* 썸네일 */}
      <Skeleton
        className={cn(
          "w-full rounded-none",
          isShort ? "aspect-9/16" : "aspect-video"
        )}
      />

      {/* 정보 */}
      <div className={cn("flex flex-col gap-1.5", isShort ? "p-2" : "p-3")}>
        <Skeleton className={cn("w-full", isShort ? "h-3" : "h-4")} />
        <Skeleton className={cn("w-3/4", isShort ? "h-3" : "h-4")} />
        <div className="flex items-center gap-2">
          <Skeleton className={cn(isShort ? "h-2.5 w-10" : "h-3 w-12")} />
          <Skeleton className={cn(isShort ? "h-2.5 w-8" : "h-3 w-10")} />
        </div>
      </div>
    </div>
  );
};

interface YouTubePlaylistSkeletonProps {
  variant?: "default" | "short";
}

/**
 * YouTube 플레이리스트 스켈레톤 (가로 스크롤)
 */
export const YouTubePlaylistSkeleton = ({
  variant = "default",
}: YouTubePlaylistSkeletonProps) => {
  const count = variant === "short" ? 8 : 5;

  return (
    <div className="space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-24" />
        <div className="flex gap-1">
          <Skeleton className="w-8 h-8 rounded-full" />
          <Skeleton className="w-8 h-8 rounded-full" />
        </div>
      </div>

      {/* 카드 리스트 */}
      <div
        className="flex gap-4 overflow-x-hidden pb-2"
        style={{ scrollbarWidth: "none" }}
      >
        {Array.from({ length: count }).map((_, i) => (
          <YouTubeVideoCardSkeleton key={i} variant={variant} />
        ))}
      </div>
    </div>
  );
};

/**
 * YouTube 섹션 전체 스켈레톤 (필터 칩 + 플레이리스트)
 */
export const YouTubeSectionSkeleton = () => {
  return (
    <div className="space-y-6">
      {/* 멤버 필터 칩 스켈레톤 */}
      <div className="flex gap-2 flex-wrap">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-16 rounded-full" />
        ))}
      </div>

      {/* 플레이리스트 스켈레톤 */}
      <div className="space-y-8">
        <YouTubePlaylistSkeleton variant="default" />
        <YouTubePlaylistSkeleton variant="short" />
      </div>
    </div>
  );
};
