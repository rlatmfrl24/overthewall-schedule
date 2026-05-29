import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMembersYouTubeVideos } from "@/lib/api/youtube";
import { MEDIA_QUERY_STALE_TIME_MS } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import type { YouTubeVideo, YouTubeVideosResponse, Member } from "@/lib/types";

interface UseYouTubeVideosReturn {
  videos: YouTubeVideo[];
  shorts: YouTubeVideo[];
  loading: boolean;
  error: string | null;
  hasLoaded: boolean;
  reload: () => Promise<void>;
}

const EMPTY_YOUTUBE_RESPONSE: YouTubeVideosResponse = {
  videos: [],
  shorts: [],
  updatedAt: "",
};

export function useYouTubeVideos(
  members: Member[],
  options: { maxResults?: number } = {},
): UseYouTubeVideosReturn {
  const { maxResults = 20 } = options;
  const membersWithYouTube = useMemo(
    () => members.filter((member) => member.youtube_channel_id),
    [members],
  );
  const channelIdsKey = useMemo(
    () =>
      membersWithYouTube
        .map((member) => member.youtube_channel_id)
        .sort()
        .join(","),
    [membersWithYouTube],
  );
  const enabled = membersWithYouTube.length > 0;

  const query = useQuery({
    queryKey: queryKeys.media.youtube(channelIdsKey, maxResults),
    queryFn: async () =>
      (await fetchMembersYouTubeVideos(membersWithYouTube, {
        maxResults,
      })) ?? EMPTY_YOUTUBE_RESPONSE,
    enabled,
    staleTime: MEDIA_QUERY_STALE_TIME_MS,
  });

  const reload = useCallback(async () => {
    if (!enabled) return;
    await query.refetch();
  }, [enabled, query]);

  const data = enabled ? query.data : EMPTY_YOUTUBE_RESPONSE;

  return {
    videos: data?.videos ?? [],
    shorts: data?.shorts ?? [],
    loading: enabled ? query.isFetching : false,
    error:
      query.error && !query.data
        ? "YouTube 동영상을 불러오는데 실패했습니다."
        : null,
    hasLoaded: enabled ? query.isFetched : true,
    reload,
  };
}

export function useFilteredYouTubeVideos(
  videos: YouTubeVideo[],
  shorts: YouTubeVideo[],
  selectedMemberUids: number[] | null,
): { filteredVideos: YouTubeVideo[]; filteredShorts: YouTubeVideo[] } {
  return useMemo(() => {
    return filterYouTubeVideosByMembers(videos, shorts, selectedMemberUids);
  }, [videos, shorts, selectedMemberUids]);
}

export function filterYouTubeVideosByMembers(
  videos: YouTubeVideo[],
  shorts: YouTubeVideo[],
  selectedMemberUids: number[] | null,
): { filteredVideos: YouTubeVideo[]; filteredShorts: YouTubeVideo[] } {
  if (!selectedMemberUids || selectedMemberUids.length === 0) {
    return { filteredVideos: videos, filteredShorts: shorts };
  }

  const uidSet = new Set(selectedMemberUids);

  return {
    filteredVideos: videos.filter(
      (video) => video.memberUid !== undefined && uidSet.has(video.memberUid),
    ),
    filteredShorts: shorts.filter(
      (video) => video.memberUid !== undefined && uidSet.has(video.memberUid),
    ),
  };
}
