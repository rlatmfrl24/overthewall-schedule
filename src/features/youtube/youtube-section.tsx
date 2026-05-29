import { useEffect, useMemo, useState } from "react";
import type { Member } from "@/lib/types";
import {
  useYouTubeVideos,
  useFilteredYouTubeVideos,
} from "@/hooks/use-youtube-videos";
import { YouTubePlaylist } from "./youtube-playlist";
import { YouTubeSectionSkeleton } from "./youtube-skeleton";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";

const getVideoGridColumnCount = () => {
  if (typeof window === "undefined") {
    return 3;
  }

  if (window.innerWidth >= 1536) {
    return 4;
  }

  if (window.innerWidth >= 1024) {
    return 3;
  }

  if (window.innerWidth >= 640) {
    return 2;
  }

  return 1;
};

const useVideoGridColumnCount = () => {
  const [columnCount, setColumnCount] = useState(getVideoGridColumnCount);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleResize = () => {
      setColumnCount(getVideoGridColumnCount());
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return columnCount;
};

interface YouTubeSectionProps {
  members: Member[];
  selectedMemberUids: number[] | null;
  loadingMembers: boolean;
}

export const YouTubeSection = ({
  members,
  selectedMemberUids,
  loadingMembers,
}: YouTubeSectionProps) => {
  const gridColumnCount = useVideoGridColumnCount();
  const [visibleVideoCount, setVisibleVideoCount] = useState(gridColumnCount);
  const hasYouTubeMember = members.some((member) => member.youtube_channel_id);

  const { videos, shorts, error, hasLoaded, loading } = useYouTubeVideos(
    members,
    { maxResults: 20 },
  );

  const { filteredVideos, filteredShorts } = useFilteredYouTubeVideos(
    videos,
    shorts,
    selectedMemberUids,
  );
  const selectedMemberKey = selectedMemberUids?.join(",") || "all";
  const clampedVisibleVideoCount = Math.min(
    visibleVideoCount,
    filteredVideos.length,
  );
  const visibleVideos = useMemo(
    () => filteredVideos.slice(0, clampedVisibleVideoCount),
    [clampedVisibleVideoCount, filteredVideos],
  );
  const remainingVideoCount = filteredVideos.length - clampedVisibleVideoCount;
  const nextExpandCount = Math.min(gridColumnCount, remainingVideoCount);
  const canExpandVideos = remainingVideoCount > 0;
  const canCollapseVideos =
    filteredVideos.length > gridColumnCount &&
    clampedVisibleVideoCount >= filteredVideos.length;

  useEffect(() => {
    setVisibleVideoCount(Math.min(gridColumnCount, filteredVideos.length));
  }, [filteredVideos.length, gridColumnCount, selectedMemberKey]);

  const handleExpandVideos = () => {
    setVisibleVideoCount((current) =>
      Math.min(current + gridColumnCount, filteredVideos.length),
    );
  };

  const handleCollapseVideos = () => {
    setVisibleVideoCount(Math.min(gridColumnCount, filteredVideos.length));
  };

  if (loadingMembers) {
    return <YouTubeSectionSkeleton />;
  }

  // YouTube 채널이 등록된 멤버가 없으면 렌더링하지 않음
  if (!hasYouTubeMember) {
    return null;
  }

  const isInitialLoading =
    !hasLoaded || (loading && videos.length === 0 && shorts.length === 0);

  return (
    <div className="space-y-8">
      {/* 로딩 상태 */}
      {isInitialLoading && <YouTubeSectionSkeleton />}

      {/* 에러 상태 */}
      {error && hasLoaded && !isInitialLoading && (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <p className="text-destructive">{error}</p>
        </div>
      )}

      {/* 콘텐츠 */}
      {!isInitialLoading && !error && (
        <>
          {/* 일반 동영상 플레이리스트 */}
          <YouTubePlaylist
            title="최신 동영상"
            videos={visibleVideos}
            members={members}
            variant="default"
            layout="feed-grid"
            emptyMessage="업로드된 동영상이 없습니다."
          />

          {(canExpandVideos || canCollapseVideos) && (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={clampedVisibleVideoCount > gridColumnCount}
                onClick={
                  canExpandVideos ? handleExpandVideos : handleCollapseVideos
                }
                className="h-9 rounded-full px-4 text-sm text-muted-foreground hover:text-foreground"
              >
                {canExpandVideos ? (
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                )}
                {canExpandVideos
                  ? `동영상 ${nextExpandCount}개 더 보기`
                  : "동영상 접기"}
              </Button>
            </div>
          )}

          {/* 쇼츠 플레이리스트 */}
          <YouTubePlaylist
            title="Shorts"
            videos={filteredShorts}
            members={members}
            variant="short"
            layout="shorts-grid"
            emptyMessage="업로드된 Shorts가 없습니다."
          />
        </>
      )}
    </div>
  );
};
