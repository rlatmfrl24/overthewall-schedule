import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchMembersYouTubeVideos } from "@/lib/api/youtube";
import type { YouTubeVideo, YouTubeVideosResponse, Member } from "@/lib/types";

interface UseYouTubeVideosReturn {
  videos: YouTubeVideo[];
  shorts: YouTubeVideo[];
  loading: boolean;
  error: string | null;
  hasLoaded: boolean;
  reload: () => Promise<void>;
}

/**
 * 멤버들의 YouTube 동영상을 조회하는 훅 (최적화됨)
 */
export function useYouTubeVideos(
  members: Member[],
  options: { maxResults?: number } = {}
): UseYouTubeVideosReturn {
  const [data, setData] = useState<YouTubeVideosResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const dataRef = useRef<YouTubeVideosResponse | null>(null);

  const { maxResults = 20 } = options;

  // YouTube 채널이 있는 멤버만 필터링 (메모이제이션)
  const membersWithYouTube = useMemo(
    () => members.filter((m) => m.youtube_channel_id),
    [members]
  );

  // 채널 ID 문자열로 의존성 관리 (배열 참조 변경에 영향받지 않도록)
  const channelIdsKey = useMemo(
    () =>
      membersWithYouTube
        .map((m) => m.youtube_channel_id)
        .sort()
        .join(","),
    [membersWithYouTube]
  );

  const reload = useCallback(async () => {
    const currentData = dataRef.current;
    if (membersWithYouTube.length === 0) {
      setData(null);
      setLoading(false);
      setError(null);
      setHasLoaded(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetchMembersYouTubeVideos(membersWithYouTube, {
        maxResults,
      });

      if (response) {
        setData(response);
        setError(null);
      } else {
        // API 응답이 null인 경우 (에러가 아니라 데이터가 없는 경우)
        if (!currentData) {
          // 이전 데이터가 없으면 빈 상태로 설정
          setData({
            videos: [],
            shorts: [],
            updatedAt: new Date().toISOString(),
          });
        }
        // 이전 데이터가 있으면 유지
      }
    } catch (err) {
      console.error("Failed to fetch YouTube videos:", err);

      // 에러 발생 시 이전 데이터가 있으면 유지하고 에러만 표시
      if (!currentData) {
        setError("YouTube 동영상을 불러오는데 실패했습니다.");
      } else {
        // 이전 데이터가 있으면 에러 표시하지 않음 (stale 데이터 사용)
        console.warn("Using cached data due to fetch error");
      }
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [membersWithYouTube, maxResults]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    void reload();
  }, [channelIdsKey, reload, maxResults]); // reload 대신 channelIdsKey와 maxResults로 의존성 관리

  return {
    videos: data?.videos ?? [],
    shorts: data?.shorts ?? [],
    loading,
    error,
    hasLoaded,
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
