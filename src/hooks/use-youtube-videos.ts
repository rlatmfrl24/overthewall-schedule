import { useCallback, useEffect, useState } from "react";
import { fetchMembersYouTubeVideos } from "@/lib/api/youtube";
import type { YouTubeVideo, YouTubeVideosResponse, Member } from "@/lib/types";

interface UseYouTubeVideosReturn {
  videos: YouTubeVideo[];
  shorts: YouTubeVideo[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * 멤버들의 YouTube 동영상을 조회하는 훅
 */
export function useYouTubeVideos(
  members: Member[],
  options: { maxResults?: number } = {}
): UseYouTubeVideosReturn {
  const [data, setData] = useState<YouTubeVideosResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { maxResults = 20 } = options;

  const reload = useCallback(async () => {
    const membersWithYouTube = members.filter((m) => m.youtube_channel_id);
    if (membersWithYouTube.length === 0) {
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetchMembersYouTubeVideos(membersWithYouTube, {
        maxResults,
      });
      setData(response);
    } catch (err) {
      console.error("Failed to fetch YouTube videos:", err);
      setError("YouTube 동영상을 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [members, maxResults]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    videos: data?.videos ?? [],
    shorts: data?.shorts ?? [],
    loading,
    error,
    reload,
  };
}

/**
 * 특정 멤버들로 필터링된 YouTube 동영상을 반환하는 훅
 */
export function useFilteredYouTubeVideos(
  videos: YouTubeVideo[],
  shorts: YouTubeVideo[],
  selectedMemberUids: number[] | null // null이면 전체 선택
): { filteredVideos: YouTubeVideo[]; filteredShorts: YouTubeVideo[] } {
  if (!selectedMemberUids || selectedMemberUids.length === 0) {
    return { filteredVideos: videos, filteredShorts: shorts };
  }

  const uidSet = new Set(selectedMemberUids);

  return {
    filteredVideos: videos.filter(
      (v) => v.memberUid !== undefined && uidSet.has(v.memberUid)
    ),
    filteredShorts: shorts.filter(
      (v) => v.memberUid !== undefined && uidSet.has(v.memberUid)
    ),
  };
}
