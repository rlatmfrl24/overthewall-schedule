import { apiFetch } from "./client";
import type { YouTubeVideo, YouTubeVideosResponse, Member } from "@/lib/types";

interface YouTubeVideosApiResponse {
  updatedAt: string;
  videos: YouTubeVideo[];
  shorts: YouTubeVideo[];
  byChannel: {
    channelId: string;
    content: { videos: YouTubeVideo[]; shorts: YouTubeVideo[] } | null;
  }[];
}

export interface FetchYouTubeVideosOptions {
  maxResults?: number;
}

const YOUTUBE_VIDEOS_CACHE_TTL_MS = 5 * 60_000; // 5분 캐시
const youtubeVideosCache = new Map<
  string,
  { fetchedAt: number; content: YouTubeVideosResponse | null }
>();

const isCacheFresh = (fetchedAt: number) =>
  Date.now() - fetchedAt < YOUTUBE_VIDEOS_CACHE_TTL_MS;

const makeCacheKey = (channelIds: string[], maxResults: number) =>
  `${channelIds.sort().join(",")}:${maxResults}`;

/**
 * 여러 채널의 YouTube 동영상 조회
 */
export async function fetchYouTubeVideos(
  channelIds: string[],
  options: FetchYouTubeVideosOptions = {}
): Promise<YouTubeVideosResponse | null> {
  if (channelIds.length === 0) return null;

  const { maxResults = 20 } = options;
  const cacheKey = makeCacheKey(channelIds, maxResults);
  const cached = youtubeVideosCache.get(cacheKey);
  if (cached && isCacheFresh(cached.fetchedAt)) {
    return cached.content;
  }

  const params = new URLSearchParams({
    channelIds: channelIds.join(","),
    maxResults: String(maxResults),
  });

  try {
    const response = await apiFetch<YouTubeVideosApiResponse>(
      `/api/youtube/videos?${params}`
    );

    const content: YouTubeVideosResponse = {
      videos: response.videos,
      shorts: response.shorts,
      updatedAt: response.updatedAt,
    };

    youtubeVideosCache.set(cacheKey, { fetchedAt: Date.now(), content });
    return content;
  } catch (error) {
    console.error("Failed to fetch YouTube videos:", error);
    return null;
  }
}

/**
 * 멤버 목록에서 YouTube 채널 ID 추출
 */
export function extractYouTubeChannelIds(members: Member[]): string[] {
  return members
    .map((m) => m.youtube_channel_id)
    .filter((id): id is string => !!id);
}

/**
 * 멤버들의 YouTube 동영상 조회 (멤버 uid 매핑 포함)
 */
export async function fetchMembersYouTubeVideos(
  members: Member[],
  options: FetchYouTubeVideosOptions = {}
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

/**
 * 캐시 초기화 (디버깅/테스트용)
 */
export function clearYouTubeCache() {
  youtubeVideosCache.clear();
}
