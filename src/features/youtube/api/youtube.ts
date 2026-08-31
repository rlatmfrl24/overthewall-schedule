import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import { apiFetch } from "@/shared/api/client";
import type { MemberDto } from "@contracts/members";
import type { YouTubeVideosResponseDto } from "@contracts/youtube";
import type { YouTubeVideosResponse } from "../model/types";

interface FetchYouTubeVideosOptions {
  maxResults?: number;
}

/**
 * 여러 채널의 YouTube 동영상 조회
 */
async function fetchYouTubeVideos(
  channelIds: string[],
  options: FetchYouTubeVideosOptions = {},
): Promise<YouTubeVideosResponse | null> {
  if (channelIds.length === 0) return null;

  const { maxResults = 20 } = options;
  const sortedChannelIds = [...new Set(channelIds)].sort();
  const params = new URLSearchParams({
    channelIds: sortedChannelIds.join(","),
    maxResults: String(maxResults),
  });

  const response = await apiFetch<YouTubeVideosResponseDto>(
    withRouteSearch(apiRoutes.youtube.videos.build(), params),
  );

  return {
    videos: response.videos,
    shorts: response.shorts,
    updatedAt: response.updatedAt,
    cache: response.cache,
  };
}

/**
 * 멤버들의 YouTube 동영상 조회 (멤버 uid 매핑 포함)
 */
export async function fetchMembersYouTubeVideos(
  members: MemberDto[],
  options: FetchYouTubeVideosOptions = {},
): Promise<YouTubeVideosResponse | null> {
  const channelToMember = new Map<string, number>();
  members.forEach((m) => {
    if (m.youtube_channel_id) {
      channelToMember.set(m.youtube_channel_id, m.uid);
    }
  });

  const channelIds = Array.from(channelToMember.keys());
  if (channelIds.length === 0) return null;

  const response = await fetchYouTubeVideos(channelIds, options);
  if (!response) return null;

  // 각 동영상에 memberUid 매핑
  const videosWithMember = response.videos.map((video) => ({
    ...video,
    memberUid: channelToMember.get(video.channelId),
  }));

  const shortsWithMember = response.shorts.map((video) => ({
    ...video,
    memberUid: channelToMember.get(video.channelId),
  }));

  return {
    ...response,
    videos: videosWithMember,
    shorts: shortsWithMember,
  };
}
