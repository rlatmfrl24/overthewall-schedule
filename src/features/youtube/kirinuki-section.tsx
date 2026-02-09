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

      {/* 콘텐츠 */}
      {!isInitialLoading && !error && (
        <>
          {/* 일반 동영상 플레이리스트 */}
          <YouTubePlaylist
            title="최신 키리누키"
            videos={videos}
            members={members}
            variant="default"
            emptyMessage="등록된 키리누키 채널이 없거나 업로드된 영상이 없습니다."
          />

          {/* 쇼츠 플레이리스트 */}
          {shorts.length > 0 && (
            <YouTubePlaylist
              title="키리누키 Shorts"
              videos={shorts}
              members={members}
              variant="short"
              emptyMessage="업로드된 Shorts가 없습니다."
            />
          )}
        </>
      )}
    </div>
  );
};
