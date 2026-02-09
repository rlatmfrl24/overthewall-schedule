import { useMemo } from "react";
import { useKirinukiVideos } from "@/hooks/use-kirinuki-videos";
import { YouTubePlaylist } from "../youtube/youtube-playlist";
import { YouTubeSectionSkeleton } from "../youtube/youtube-skeleton";
import type { Member } from "@/lib/types";

interface KirinukiSectionProps {
  members: Member[];
  loadingMembers: boolean;
}

export const KirinukiSection = ({
  members,
  loadingMembers,
}: KirinukiSectionProps) => {
  const { videos, shorts, loading, error, hasLoaded } = useKirinukiVideos({
    maxResults: 20,
  });

  // 숏츠와 영상을 구분하지 않고 최신순으로 병합
  const allVideos = useMemo(() => {
    const merged = [...videos, ...shorts];
    // publishedAt 기준 최신순 정렬
    return merged.sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );
  }, [videos, shorts]);

  if (loadingMembers) {
    return <YouTubeSectionSkeleton />;
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

      {/* 콘텐츠 - 숏츠와 영상을 구분하지 않고 통합 */}
      {!isInitialLoading && !error && (
        <YouTubePlaylist
          title="최신 키리누키"
          videos={allVideos}
          members={members}
          variant="default"
          isKirinuki
          emptyMessage="등록된 키리누키 채널이 없거나 업로드된 영상이 없습니다."
        />
      )}
    </div>
  );
};
