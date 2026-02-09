import type { CachedYouTubeVideos, YouTubeVideoItem } from "../types";
import { parseISO8601Duration } from "../utils/helpers";

const YOUTUBE_VIDEOS_CACHE = new Map<string, CachedYouTubeVideos>();
const YOUTUBE_VIDEOS_TTL_MS = 5 * 60_000; // 5분 캐시 (YouTube API 쿼터 절약)

// uploads 플레이리스트 ID 캐싱 (채널별로 거의 변하지 않으므로 긴 TTL)
const YOUTUBE_PLAYLIST_ID_CACHE = new Map<
  string,
  { fetchedAt: number; playlistId: string | null }
>();
const YOUTUBE_PLAYLIST_ID_TTL_MS = 24 * 60 * 60_000; // 24시간 캐시

// YouTube API: 채널의 uploads 플레이리스트 ID 가져오기 (캐싱 포함)
const fetchYouTubeUploadsPlaylistId = async (
  channelId: string,
  apiKey: string,
): Promise<string | null> => {
  const cached = YOUTUBE_PLAYLIST_ID_CACHE.get(channelId);
  const now = Date.now();

  if (cached && now - cached.fetchedAt < YOUTUBE_PLAYLIST_ID_TTL_MS) {
    return cached.playlistId;
  }

  const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${apiKey}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(
        "Failed to fetch YouTube channel details",
        channelId,
        res.status,
      );
      return null;
    }
    const data = (await res.json()) as any;
    const playlistId =
      data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || null;

    YOUTUBE_PLAYLIST_ID_CACHE.set(channelId, {
      fetchedAt: now,
      playlistId,
    });
    return playlistId;
  } catch (error) {
    console.error("Failed to fetch YouTube channel details", channelId, error);
    return null;
  }
};

// YouTube API: 플레이리스트 아이템 조회 (재시도 로직 포함)
const fetchYouTubePlaylistItems = async (
  playlistId: string,
  apiKey: string,
  maxResults = 20,
  retryCount = 0,
): Promise<string[]> => {
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${playlistId}&maxResults=${maxResults}&key=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 429 || res.status >= 500) {
        if (retryCount < 3) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return fetchYouTubePlaylistItems(
            playlistId,
            apiKey,
            maxResults,
            retryCount + 1,
          );
        }
      }
      console.error(
        "Failed to fetch YouTube playlist items",
        playlistId,
        res.status,
      );
      return [];
    }
    const data = (await res.json()) as any;
    return (
      data.items?.map((item: any) => item.contentDetails.videoId as string) ||
      []
    );
  } catch (error) {
    console.error("Failed to fetch YouTube playlist items", playlistId, error);
    return [];
  }
};

// YouTube API: 동영상 상세 정보 조회 (배치 처리 최적화)
const fetchYouTubeVideoDetails = async (
  videoIds: string[],
  apiKey: string,
): Promise<YouTubeVideoItem[]> => {
  if (videoIds.length === 0) return [];

  // YouTube API는 한 번에 최대 50개의 비디오 조회 가능
  const chunks = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50));
  }

  const allVideos: YouTubeVideoItem[] = [];

  for (const chunk of chunks) {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${chunk.join(
      ",",
    )}&key=${apiKey}`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error("Failed to fetch YouTube video details", res.status);
        continue;
      }
      const data = (await res.json()) as any;

      const videos =
        data.items?.map((item: any) => {
          const duration = parseISO8601Duration(item.contentDetails.duration);
          const isShort = duration <= 60; // 60초 이하는 쇼츠로 간주

          return {
            videoId: item.id,
            title: item.snippet.title,
            publishedAt: item.snippet.publishedAt,
            thumbnailUrl:
              item.snippet.thumbnails?.high?.url ||
              item.snippet.thumbnails?.default?.url,
            duration,
            viewCount: parseInt(item.statistics.viewCount || "0", 10),
            channelId: item.snippet.channelId,
            channelTitle: item.snippet.channelTitle,
            isShort,
          } satisfies YouTubeVideoItem;
        }) || [];

      allVideos.push(...videos);
    } catch (error) {
      console.error("Failed to fetch YouTube video details", error);
    }
  }

  return allVideos;
};

// YouTube API: 채널의 동영상 조회 (캐싱 포함)
export const fetchYouTubeVideosForChannel = async (
  channelId: string,
  apiKey: string,
  maxResults = 20,
): Promise<CachedYouTubeVideos["content"]> => {
  const cacheKey = `${channelId}:${maxResults}`;
  const cached = YOUTUBE_VIDEOS_CACHE.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.fetchedAt < YOUTUBE_VIDEOS_TTL_MS) {
    return cached.content;
  }

  try {
    const playlistId = await fetchYouTubeUploadsPlaylistId(channelId, apiKey);
    if (!playlistId) return null;

    const videoIds = await fetchYouTubePlaylistItems(
      playlistId,
      apiKey,
      maxResults,
    );
    if (videoIds.length === 0) return null;

    const allItems = await fetchYouTubeVideoDetails(videoIds, apiKey);

    const result = {
      videos: allItems.filter((v) => !v.isShort),
      shorts: allItems.filter((v) => v.isShort),
    };

    YOUTUBE_VIDEOS_CACHE.set(cacheKey, {
      fetchedAt: now,
      content: result,
    });
    return result;
  } catch (error) {
    console.error(
      "Failed to fetch YouTube videos for channel",
      channelId,
      error,
    );
    return null;
  }
};
