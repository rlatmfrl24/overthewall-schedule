import { useState, useMemo } from "react";
import type { Member } from "@/lib/types";
import { useYouTubeVideos, useFilteredYouTubeVideos } from "@/hooks/use-youtube-videos";
import { MemberFilterChips } from "./member-filter-chips";
import { YouTubePlaylist } from "./youtube-playlist";
import { YouTubeSectionSkeleton } from "./youtube-skeleton";

interface YouTubeSectionProps {
  members: Member[];
}

export const YouTubeSection = ({ members }: YouTubeSectionProps) => {
  const [selectedMemberUids, setSelectedMemberUids] = useState<number[] | null>(null);

  // YouTube 채널이 있는 멤버만 필터링
  const membersWithYouTube = useMemo(
    () => members.filter((m) => m.youtube_channel_id),
    [members]
  );

  const { videos, shorts, loading, error } = useYouTubeVideos(membersWithYouTube, {
    maxResults: 20,
  });

  const { filteredVideos, filteredShorts } = useFilteredYouTubeVideos(
    videos,
    shorts,
    selectedMemberUids
  );

  // YouTube 채널이 등록된 멤버가 없으면 렌더링하지 않음
  if (membersWithYouTube.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* 멤버 필터 */}
      <MemberFilterChips
        members={membersWithYouTube}
        selectedUids={selectedMemberUids}
        onChange={setSelectedMemberUids}
      />

      {/* 로딩 상태 */}
      {loading && <YouTubeSectionSkeleton />}

      {/* 에러 상태 */}
      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <p className="text-destructive">{error}</p>
        </div>
      )}

      {/* 콘텐츠 */}
      {!loading && !error && (
        <div className="space-y-8">
          {/* 일반 동영상 플레이리스트 */}
          <YouTubePlaylist
            title="최신 동영상"
            videos={filteredVideos}
            members={members}
            variant="default"
            emptyMessage="업로드된 동영상이 없습니다."
          />

          {/* 쇼츠 플레이리스트 */}
          <YouTubePlaylist
            title="Shorts"
            videos={filteredShorts}
            members={members}
            variant="short"
            emptyMessage="업로드된 Shorts가 없습니다."
          />
        </div>
      )}
    </div>
  );
};
