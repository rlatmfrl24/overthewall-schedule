import { SQL, and, between, eq, inArray } from "drizzle-orm";
import { getDb, type DbInstance } from "./db";
import {
  members,
  schedules,
  notices,
  type NewSchedule,
  ddays,
  settings,
} from "../src/db/schema";

type CachedLiveStatus = {
  fetchedAt: number;
  content: {
    status: "OPEN" | "CLOSE";
    liveTitle: string;
    concurrentUserCount: number;
    liveImageUrl: string;
    defaultThumbnailImageUrl: string;
    channelId: string;
    channelName: string;
    channelImageUrl: string;
  } | null;
};

const LIVE_STATUS_CACHE = new Map<string, CachedLiveStatus>();
const LIVE_STATUS_TTL_MS = 60_000;

// Chzzk VOD Cache
type CachedChzzkVideos = {
  fetchedAt: number;
  content: {
    page: number;
    size: number;
    totalCount: number;
    totalPages: number;
    data: Array<{
      videoNo: number;
      videoId: string;
      videoTitle: string;
      videoType: string;
      publishDate: string;
      thumbnailImageUrl: string | null;
      duration: number;
      readCount: number;
      publishDateAt: number;
      categoryType: string | null;
      videoCategory: string | null;
      videoCategoryValue: string;
      channel: {
        channelId: string;
        channelName: string;
        channelImageUrl: string;
      };
    }>;
  } | null;
};

const CHZZK_VIDEOS_CACHE = new Map<string, CachedChzzkVideos>();
const CHZZK_VIDEOS_TTL_MS = 300_000;

// Chzzk Clips Cache
type CachedChzzkClips = {
  fetchedAt: number;
  content: {
    size: number;
    page: {
      next: { clipUID: string } | null;
      prev: { clipUID: string } | null;
    };
    data: Array<{
      clipUID: string;
      videoId: string;
      clipTitle: string;
      ownerChannelId: string;
      thumbnailImageUrl: string | null;
      categoryType: string;
      clipCategory: string;
      duration: number;
      adult: boolean;
      createdDate: string;
      readCount: number;
      blindType: string | null;
    }>;
    hasStreamerClips: boolean;
  } | null;
};

const CHZZK_CLIPS_CACHE = new Map<string, CachedChzzkClips>();
const CHZZK_CLIPS_TTL_MS = 300_000;

// YouTube API Types and Cache
type YouTubeVideoItem = {
  videoId: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string;
  duration: number;
  viewCount: number;
  channelId: string;
  channelTitle: string;
  isShort: boolean;
};

type CachedYouTubeVideos = {
  fetchedAt: number;
  content: {
    videos: YouTubeVideoItem[];
    shorts: YouTubeVideoItem[];
  } | null;
};

const YOUTUBE_VIDEOS_CACHE = new Map<string, CachedYouTubeVideos>();
const YOUTUBE_VIDEOS_TTL_MS = 5 * 60_000; // 5분 캐시 (YouTube API 쿼터 절약)

// uploads 플레이리스트 ID 캐싱 (채널별로 거의 변하지 않으므로 긴 TTL)
const YOUTUBE_PLAYLIST_ID_CACHE = new Map<
  string,
  { fetchedAt: number; playlistId: string | null }
>();
const YOUTUBE_PLAYLIST_ID_TTL_MS = 24 * 60 * 60_000; // 24시간 캐시

// ISO 8601 duration (PT1H2M3S) 을 초 단위로 변환
const parseISO8601Duration = (duration: string): number => {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
};

// YouTube API: 채널의 uploads 플레이리스트 ID 가져오기 (캐싱 포함)
const fetchYouTubeUploadsPlaylistId = async (
  channelId: string,
  apiKey: string,
): Promise<string | null> => {
  // 캐시 확인
  const cached = YOUTUBE_PLAYLIST_ID_CACHE.get(channelId);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < YOUTUBE_PLAYLIST_ID_TTL_MS) {
    return cached.playlistId;
  }

  const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      // 쿼터 에러(403) 또는 rate limit(429) 처리
      if (res.status === 403 || res.status === 429) {
        console.error(
          `YouTube API quota exceeded or rate limited for channel ${channelId}`,
        );
        // 이전 캐시가 있으면 재사용 (TTL 무시)
        if (cached) {
          return cached.playlistId;
        }
      }
      console.error("Failed to fetch YouTube channel", channelId, res.status);
      return null;
    }

    const data = (await res.json()) as {
      items?: Array<{
        contentDetails?: {
          relatedPlaylists?: {
            uploads?: string;
          };
        };
      }>;
    };

    const playlistId =
      data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null;

    // 캐시 저장
    YOUTUBE_PLAYLIST_ID_CACHE.set(channelId, {
      fetchedAt: now,
      playlistId,
    });

    return playlistId;
  } catch (error) {
    console.error("Error fetching YouTube playlist ID:", error);
    // 네트워크 에러 시 이전 캐시 재사용
    if (cached) {
      return cached.playlistId;
    }
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
      // rate limit 에러 시 재시도
      if (res.status === 429 && retryCount < 2) {
        const retryAfter = parseInt(res.headers.get("Retry-After") || "1", 10);
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
        return fetchYouTubePlaylistItems(
          playlistId,
          apiKey,
          maxResults,
          retryCount + 1,
        );
      }
      console.error("Failed to fetch YouTube playlist", playlistId, res.status);
      return [];
    }

    const data = (await res.json()) as {
      items?: Array<{
        contentDetails?: {
          videoId?: string;
        };
      }>;
    };

    return (
      data.items
        ?.map((item) => item.contentDetails?.videoId)
        .filter((id): id is string => !!id) ?? []
    );
  } catch (error) {
    console.error("Error fetching YouTube playlist items:", error);
    return [];
  }
};

// YouTube API: 동영상 상세 정보 조회 (배치 처리 최적화)
const fetchYouTubeVideoDetails = async (
  videoIds: string[],
  apiKey: string,
): Promise<YouTubeVideoItem[]> => {
  if (videoIds.length === 0) return [];

  // YouTube API는 한 번에 최대 50개까지 조회 가능
  const BATCH_SIZE = 50;
  const batches: string[][] = [];

  for (let i = 0; i < videoIds.length; i += BATCH_SIZE) {
    batches.push(videoIds.slice(i, i + BATCH_SIZE));
  }

  try {
    // 배치를 병렬로 처리
    const results = await Promise.all(
      batches.map(async (batch) => {
        const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${batch.join(",")}&key=${apiKey}`;
        const res = await fetch(url);

        if (!res.ok) {
          console.error("Failed to fetch YouTube videos batch", res.status);
          return [];
        }

        const data = (await res.json()) as {
          items?: Array<{
            id: string;
            snippet?: {
              title?: string;
              publishedAt?: string;
              channelId?: string;
              channelTitle?: string;
              thumbnails?: {
                high?: { url?: string };
                medium?: { url?: string };
                default?: { url?: string };
              };
            };
            contentDetails?: {
              duration?: string;
            };
            statistics?: {
              viewCount?: string;
            };
          }>;
        };

        return (
          data.items?.map((item) => {
            const duration = parseISO8601Duration(
              item.contentDetails?.duration || "PT0S",
            );
            const thumbnails = item.snippet?.thumbnails;
            const thumbnailUrl =
              thumbnails?.high?.url ||
              thumbnails?.medium?.url ||
              thumbnails?.default?.url ||
              "";

            return {
              videoId: item.id,
              title: item.snippet?.title || "",
              publishedAt: item.snippet?.publishedAt || "",
              thumbnailUrl,
              duration,
              viewCount: parseInt(item.statistics?.viewCount || "0", 10),
              channelId: item.snippet?.channelId || "",
              channelTitle: item.snippet?.channelTitle || "",
              isShort: duration <= 60,
            };
          }) ?? []
        );
      }),
    );

    return results.flat();
  } catch (error) {
    console.error("Error fetching YouTube video details:", error);
    return [];
  }
};

// YouTube API: 채널의 동영상 조회 (캐싱 포함)
const fetchYouTubeVideosForChannel = async (
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

  // 1. uploads 플레이리스트 ID 조회
  const uploadsPlaylistId = await fetchYouTubeUploadsPlaylistId(
    channelId,
    apiKey,
  );
  if (!uploadsPlaylistId) {
    YOUTUBE_VIDEOS_CACHE.set(cacheKey, { fetchedAt: now, content: null });
    return null;
  }

  // 2. 플레이리스트 아이템 조회
  const videoIds = await fetchYouTubePlaylistItems(
    uploadsPlaylistId,
    apiKey,
    maxResults,
  );
  if (videoIds.length === 0) {
    YOUTUBE_VIDEOS_CACHE.set(cacheKey, {
      fetchedAt: now,
      content: { videos: [], shorts: [] },
    });
    return { videos: [], shorts: [] };
  }

  // 3. 동영상 상세 정보 조회
  const allVideos = await fetchYouTubeVideoDetails(videoIds, apiKey);

  // 4. 일반 동영상과 쇼츠 분리
  const videos = allVideos.filter((v) => !v.isShort);
  const shorts = allVideos.filter((v) => v.isShort);

  const content = { videos, shorts };
  YOUTUBE_VIDEOS_CACHE.set(cacheKey, { fetchedAt: now, content });
  return content;
};

const json = (data: unknown, status = 200) => Response.json(data, { status });
const badRequest = (message: string) => new Response(message, { status: 400 });
const methodNotAllowed = () =>
  new Response("Method not allowed", { status: 405 });

const parseNumericId = (value?: string | number | null) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const fetchChzzkLiveStatus = async (channelId: string) => {
  const cached = LIVE_STATUS_CACHE.get(channelId);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < LIVE_STATUS_TTL_MS) {
    return cached.content;
  }

  const url = `https://api.chzzk.naver.com/polling/v2/channels/${channelId}/live-status`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error("Failed to fetch chzzk live status", channelId, res.status);
    return null;
  }

  const data = (await res.json()) as {
    code: number;
    content: CachedLiveStatus["content"];
  };

  const content = data?.content ?? null;
  LIVE_STATUS_CACHE.set(channelId, {
    fetchedAt: now,
    content,
  });
  return content;
};

const fetchChzzkVideos = async (
  channelId: string,
  page = 0,
  size = 24,
): Promise<CachedChzzkVideos["content"]> => {
  const cacheKey = `${channelId}:${page}:${size}`;
  const cached = CHZZK_VIDEOS_CACHE.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < CHZZK_VIDEOS_TTL_MS) {
    return cached.content;
  }

  const url = `https://api.chzzk.naver.com/service/v1/channels/${channelId}/videos?sortType=LATEST&pagingType=PAGE&page=${page}&size=${size}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error("Failed to fetch chzzk videos", channelId, res.status);
    return null;
  }

  const data = (await res.json()) as {
    code: number;
    content: CachedChzzkVideos["content"];
  };

  const content = data?.content ?? null;
  CHZZK_VIDEOS_CACHE.set(cacheKey, {
    fetchedAt: now,
    content,
  });
  return content;
};

const fetchChzzkClips = async (
  channelId: string,
  size = 30,
): Promise<CachedChzzkClips["content"]> => {
  const cacheKey = `${channelId}:${size}`;
  const cached = CHZZK_CLIPS_CACHE.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < CHZZK_CLIPS_TTL_MS) {
    return cached.content;
  }

  const url = `https://api.chzzk.naver.com/service/v1/channels/${channelId}/clips?size=${size}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error("Failed to fetch chzzk clips", channelId, res.status);
    return null;
  }

  const data = (await res.json()) as {
    code: number;
    content: CachedChzzkClips["content"];
  };

  const content = data?.content ?? null;
  CHZZK_CLIPS_CACHE.set(cacheKey, {
    fetchedAt: now,
    content,
  });
  return content;
};

const NOTICE_TYPES = ["notice", "event"] as const;
type NoticeType = (typeof NOTICE_TYPES)[number];

const normalizeNoticeType = (value?: string): NoticeType => {
  if (value && NOTICE_TYPES.includes(value as NoticeType)) {
    return value as NoticeType;
  }
  return "notice";
};

const normalizeIsActive = (value?: string | number | boolean): "1" | "0" => {
  if (value === "0" || value === 0 || value === false || value === "false") {
    return "0";
  }
  return "1";
};

type NoticePayload = {
  id?: number | string;
  content?: string;
  url?: string;
  type?: string;
  is_active?: string | number | boolean;
  started_at?: string;
  ended_at?: string;
};

type SchedulePayload = Pick<
  NewSchedule,
  "member_uid" | "date" | "start_time" | "title" | "status"
>;
type UpdateSchedulePayload = SchedulePayload & { id: number | string };

type DDayPayload = {
  id?: number | string;
  title?: string;
  date?: string;
  description?: string;
  color?: string;
  type?: string;
};

const DDAY_TYPES = ["debut", "birthday", "event"] as const;
type DDayType = (typeof DDAY_TYPES)[number];

const normalizeDDayType = (value?: string): DDayType => {
  if (value && DDAY_TYPES.includes(value as DDayType)) {
    return value as DDayType;
  }
  return "event";
};

// 치지직 URL에서 채널 ID 추출
const extractChzzkChannelId = (urlChzzk?: string | null): string | null => {
  if (!urlChzzk) return null;
  // https://chzzk.naver.com/CHANNEL_ID 형식
  const match = urlChzzk.match(/chzzk\.naver\.com\/([a-f0-9]+)/i);
  return match ? match[1] : null;
};

// KST 기준 오늘 날짜 반환 (YYYY-MM-DD)
const getKSTDateString = (date: Date = new Date()): string => {
  const kstOffset = 9 * 60 * 60 * 1000; // UTC+9
  const kstDate = new Date(date.getTime() + kstOffset);
  return kstDate.toISOString().split("T")[0];
};

// ISO 날짜 문자열에서 HH:mm 추출 (KST 기준)
const extractKSTTime = (isoString: string): string => {
  const date = new Date(isoString);
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstDate = new Date(date.getTime() + kstOffset);
  const hours = kstDate.getUTCHours().toString().padStart(2, "0");
  const minutes = kstDate.getUTCMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
};

// 설정 값 조회 헬퍼
const getSetting = async (
  db: DbInstance,
  key: string,
): Promise<string | null> => {
  const result = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  return result[0]?.value ?? null;
};

// 설정 값 업데이트 헬퍼
const updateSetting = async (
  db: DbInstance,
  key: string,
  value: string,
): Promise<void> => {
  await db
    .insert(settings)
    .values({ key, value, updated_at: Date.now().toString() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updated_at: Date.now().toString() },
    });
};

// 자동 업데이트 대상 상태
const AUTO_UPDATE_TARGET_STATUSES = ["미정", "휴방", "게릴라"] as const;

// 자동 업데이트 핵심 로직
const autoUpdateSchedules = async (
  db: DbInstance,
): Promise<{
  updated: number;
  checked: number;
  details: Array<{ memberUid: number; action: string; title?: string }>;
}> => {
  const today = getKSTDateString();
  const details: Array<{ memberUid: number; action: string; title?: string }> =
    [];

  // 1. 오늘 날짜의 미정/휴방/게릴라 상태 스케줄 조회
  const targetSchedules = await db
    .select({
      id: schedules.id,
      member_uid: schedules.member_uid,
      status: schedules.status,
    })
    .from(schedules)
    .where(
      and(
        eq(schedules.date, today),
        inArray(schedules.status, [...AUTO_UPDATE_TARGET_STATUSES]),
      ),
    );

  if (targetSchedules.length === 0) {
    return { updated: 0, checked: 0, details };
  }

  // 2. 해당 멤버들의 정보 조회 (치지직 URL 포함)
  const memberUids = [...new Set(targetSchedules.map((s) => s.member_uid))];
  const membersData = await db
    .select({
      uid: members.uid,
      url_chzzk: members.url_chzzk,
      name: members.name,
    })
    .from(members)
    .where(inArray(members.uid, memberUids));

  const memberMap = new Map(membersData.map((m) => [m.uid, m]));

  let updated = 0;

  // 3. 각 스케줄에 대해 라이브/VOD 상태 확인 및 업데이트
  for (const schedule of targetSchedules) {
    const member = memberMap.get(schedule.member_uid);
    if (!member) continue;

    const channelId = extractChzzkChannelId(member.url_chzzk);
    if (!channelId) {
      details.push({
        memberUid: schedule.member_uid,
        action: "skipped_no_channel",
      });
      continue;
    }

    // 라이브 상태 확인
    const liveStatus = await fetchChzzkLiveStatus(channelId);

    if (liveStatus && liveStatus.status === "OPEN") {
      // 라이브 중 - 스케줄 업데이트
      const liveTitle = liveStatus.liveTitle || "라이브 방송";
      // openDate는 liveStatus에 없으므로 현재 시간 사용
      const startTime =
        getKSTDateString() === today
          ? extractKSTTime(new Date().toISOString())
          : null;

      await db
        .update(schedules)
        .set({
          status: "방송",
          title: liveTitle,
          start_time: startTime,
        })
        .where(eq(schedules.id, schedule.id));

      updated++;
      details.push({
        memberUid: schedule.member_uid,
        action: "updated_live",
        title: liveTitle,
      });
      continue;
    }

    // 라이브 아님 - VOD 확인
    const videos = await fetchChzzkVideos(channelId, 0, 5);
    if (!videos || !videos.data || videos.data.length === 0) {
      details.push({
        memberUid: schedule.member_uid,
        action: "no_vod",
      });
      continue;
    }

    // 오늘 날짜의 VOD가 있는지 확인
    const todayVideo = videos.data.find((video) => {
      const publishDate = getKSTDateString(new Date(video.publishDate));
      return publishDate === today;
    });

    if (todayVideo) {
      // 오늘 VOD 있음 - 스케줄 업데이트
      const startTime = extractKSTTime(todayVideo.publishDate);

      await db
        .update(schedules)
        .set({
          status: "방송",
          title: todayVideo.videoTitle,
          start_time: startTime,
        })
        .where(eq(schedules.id, schedule.id));

      updated++;
      details.push({
        memberUid: schedule.member_uid,
        action: "updated_vod",
        title: todayVideo.videoTitle,
      });
    } else {
      details.push({
        memberUid: schedule.member_uid,
        action: "no_today_vod",
      });
    }
  }

  return { updated, checked: targetSchedules.length, details };
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const db = getDb(env);

    if (url.pathname.startsWith("/api/live-status")) {
      if (request.method !== "GET") {
        return methodNotAllowed();
      }

      const channelIdsParam = url.searchParams.get("channelIds");
      if (!channelIdsParam) {
        return badRequest("channelIds query required");
      }

      const channelIds = channelIdsParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);

      if (channelIds.length === 0) {
        return badRequest("No valid channelIds");
      }

      const items = await Promise.all(
        channelIds.map(async (channelId) => ({
          channelId,
          content: await fetchChzzkLiveStatus(channelId),
        })),
      );

      return json({
        updatedAt: new Date().toISOString(),
        items,
      });
    }

    if (url.pathname.startsWith("/api/vods/chzzk")) {
      if (request.method !== "GET") {
        return methodNotAllowed();
      }

      const channelIdsParam = url.searchParams.get("channelIds");
      const channelId = url.searchParams.get("channelId");
      const page = parseInt(url.searchParams.get("page") || "0", 10);
      const size = parseInt(url.searchParams.get("size") || "24", 10);

      if (channelIdsParam) {
        const channelIds = channelIdsParam
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);

        if (channelIds.length === 0) {
          return badRequest("No valid channelIds");
        }

        const items = await Promise.all(
          channelIds.map(async (id) => ({
            channelId: id,
            content: await fetchChzzkVideos(id, page, size),
          })),
        );

        return json({
          updatedAt: new Date().toISOString(),
          items,
        });
      }

      if (!channelId) {
        return badRequest("channelId query required");
      }

      const content = await fetchChzzkVideos(channelId, page, size);
      return json({
        updatedAt: new Date().toISOString(),
        content,
      });
    }

    // Chzzk Clips API
    if (url.pathname.startsWith("/api/clips/chzzk")) {
      if (request.method !== "GET") {
        return methodNotAllowed();
      }

      const channelIdsParam = url.searchParams.get("channelIds");
      const channelId = url.searchParams.get("channelId");
      const size = parseInt(url.searchParams.get("size") || "30", 10);

      if (channelIdsParam) {
        const channelIds = channelIdsParam
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);

        if (channelIds.length === 0) {
          return badRequest("No valid channelIds");
        }

        const items = await Promise.all(
          channelIds.map(async (id) => ({
            channelId: id,
            content: await fetchChzzkClips(id, size),
          })),
        );

        return json({
          updatedAt: new Date().toISOString(),
          items,
        });
      }

      if (!channelId) {
        return badRequest("channelId query required");
      }

      const content = await fetchChzzkClips(channelId, size);
      return json({
        updatedAt: new Date().toISOString(),
        content,
      });
    }

    // YouTube Videos API
    if (url.pathname.startsWith("/api/youtube/videos")) {
      if (request.method !== "GET") {
        return methodNotAllowed();
      }

      const apiKey = env.YOUTUBE_API_KEY?.trim();
      if (!apiKey) {
        console.error("YouTube API key not configured for this worker");
        return new Response("YouTube API key not configured", { status: 500 });
      }

      const channelIdsParam = url.searchParams.get("channelIds");
      if (!channelIdsParam) {
        return badRequest("channelIds query required");
      }

      const channelIds = channelIdsParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);

      if (channelIds.length === 0) {
        return badRequest("No valid channelIds");
      }

      const maxResults = parseInt(
        url.searchParams.get("maxResults") || "20",
        10,
      );

      try {
        const items = await Promise.all(
          channelIds.map(async (channelId) => ({
            channelId,
            content: await fetchYouTubeVideosForChannel(
              channelId,
              apiKey,
              maxResults,
            ),
          })),
        );

        // 모든 채널의 동영상을 합쳐서 최신순 정렬
        const allVideos: YouTubeVideoItem[] = [];
        const allShorts: YouTubeVideoItem[] = [];

        for (const item of items) {
          if (item.content) {
            allVideos.push(...item.content.videos);
            allShorts.push(...item.content.shorts);
          }
        }

        // 최신순 정렬
        allVideos.sort(
          (a, b) =>
            new Date(b.publishedAt).getTime() -
            new Date(a.publishedAt).getTime(),
        );
        allShorts.sort(
          (a, b) =>
            new Date(b.publishedAt).getTime() -
            new Date(a.publishedAt).getTime(),
        );

        return json({
          updatedAt: new Date().toISOString(),
          videos: allVideos,
          shorts: allShorts,
          byChannel: items,
        });
      } catch (error) {
        console.error("Failed to handle /api/youtube/videos", error);
        return new Response("Failed to fetch YouTube videos", { status: 502 });
      }
    }

    if (url.pathname.startsWith("/api/members")) {
      const pathParts = url.pathname.split("/");
      const code = pathParts[3]; // /api/members/:code

      if (code) {
        const data = await db
          .select()
          .from(members)
          .where(eq(members.code, code))
          .limit(1);

        if (data.length === 0) {
          return new Response("Member not found", { status: 404 });
        }

        return Response.json(data[0]);
      }

      const data = await db.select().from(members);
      return Response.json(data);
    }

    if (url.pathname.startsWith("/api/schedules")) {
      if (request.method === "GET") {
        const date = url.searchParams.get("date");
        const startDate = url.searchParams.get("startDate");
        const endDate = url.searchParams.get("endDate");

        if (startDate && endDate) {
          const data = await db
            .select()
            .from(schedules)
            .where(between(schedules.date, startDate, endDate));
          return Response.json(data);
        }

        if (!date) {
          return badRequest("Date parameter is required");
        }

        const data = await db
          .select()
          .from(schedules)
          .where(eq(schedules.date, date));
        return Response.json(data);
      }

      if (request.method === "POST") {
        const body = (await request.json()) as Partial<SchedulePayload>;
        const { member_uid, date, start_time, title, status } = body;

        if (!member_uid || !date || !status) {
          return badRequest("Missing required fields");
        }

        const result = await db.insert(schedules).values({
          member_uid,
          date,
          start_time,
          title,
          status,
        });

        if (result.success) {
          return new Response("Created", { status: 201 });
        } else {
          return new Response("Failed to create", { status: 500 });
        }
      }

      if (request.method === "PUT") {
        const body = (await request.json()) as Partial<UpdateSchedulePayload>;
        const { id, member_uid, date, start_time, title, status } = body;

        if (!id || !member_uid || !date || !status) {
          return badRequest("Missing required fields");
        }

        const numericId = parseNumericId(id);
        if (numericId === null) return badRequest("Invalid id");

        const result = await db
          .update(schedules)
          .set({
            member_uid,
            date,
            start_time,
            title,
            status,
          })
          .where(eq(schedules.id, numericId));

        if (result.success) {
          return new Response("Updated", { status: 200 });
        } else {
          return new Response("Failed to update", { status: 500 });
        }
      }

      if (request.method === "DELETE") {
        const id = url.searchParams.get("id");
        if (!id) {
          return badRequest("ID parameter is required");
        }
        const numericId = parseNumericId(id);
        if (numericId === null) return badRequest("Invalid id");

        const result = await db
          .delete(schedules)
          .where(eq(schedules.id, numericId));

        if (result.success) {
          return new Response("Deleted", { status: 200 });
        } else {
          return new Response("Failed to delete", { status: 500 });
        }
      }
    }

    if (url.pathname.startsWith("/api/notices")) {
      if (request.method === "GET") {
        const typeFilter = url.searchParams.get("type");
        const includeInactive = url.searchParams.get("includeInactive") === "1";
        const filters: SQL[] = [];
        if (!includeInactive) {
          filters.push(eq(notices.is_active, "1"));
        }
        if (typeFilter) {
          if (!NOTICE_TYPES.includes(typeFilter as NoticeType)) {
            return badRequest("Invalid type filter");
          }
          filters.push(eq(notices.type, typeFilter));
        }

        const baseStatement = db.select().from(notices);
        const filteredStatement =
          filters.length > 0
            ? baseStatement.where(and(...filters))
            : baseStatement;

        const data = await filteredStatement.orderBy(notices.id);
        return Response.json(data);
      }

      if (request.method === "POST") {
        const body = (await request.json()) as NoticePayload;
        const {
          content,
          url: noticeUrl,
          type,
          is_active,
          started_at,
          ended_at,
        } = body;
        if (!content?.trim()) {
          return badRequest("Content is required");
        }

        const result = await db.insert(notices).values({
          content: content.trim(),
          url: noticeUrl?.trim() || null,
          type: normalizeNoticeType(type),
          is_active: normalizeIsActive(is_active),
          started_at: started_at?.trim() || null,
          ended_at: ended_at?.trim() || null,
        });

        if (result.success) {
          return new Response("Created", { status: 201 });
        }
        return new Response("Failed to create", { status: 500 });
      }

      if (request.method === "PUT") {
        const body = (await request.json()) as NoticePayload;
        const id = body.id;
        if (!id) {
          return badRequest("ID is required for update");
        }
        const numericId = parseNumericId(id);
        if (numericId === null) return badRequest("Invalid id");

        if (!body.content?.trim()) {
          return badRequest("Content is required");
        }

        const result = await db
          .update(notices)
          .set({
            content: body.content.trim(),
            url: body.url?.trim() || null,
            type: normalizeNoticeType(body.type),
            is_active: normalizeIsActive(body.is_active),
            started_at: body.started_at?.trim() || null,
            ended_at: body.ended_at?.trim() || null,
          })
          .where(eq(notices.id, numericId));

        if (result.success) {
          return new Response("Updated", { status: 200 });
        }
        return new Response("Failed to update", { status: 500 });
      }

      if (request.method === "DELETE") {
        const id = url.searchParams.get("id");
        if (!id) {
          return badRequest("ID parameter is required");
        }
        const numericId = parseNumericId(id);
        if (numericId === null) return badRequest("Invalid id");

        const result = await db
          .delete(notices)
          .where(eq(notices.id, numericId));

        if (result.success) {
          return new Response("Deleted", { status: 200 });
        }
        return new Response("Failed to delete", { status: 500 });
      }
    }

    if (url.pathname.startsWith("/api/ddays")) {
      if (request.method === "GET") {
        const data = await db.select().from(ddays).orderBy(ddays.date);
        return Response.json(data);
      }

      if (request.method === "POST") {
        const body = (await request.json()) as DDayPayload;
        if (!body.title?.trim() || !body.date?.trim()) {
          return badRequest("title and date are required");
        }
        const type = normalizeDDayType(body.type);

        const result = await db.insert(ddays).values({
          title: body.title.trim(),
          date: body.date.trim(),
          description: body.description?.trim() || null,
          color: body.color?.trim() || null,
          type,
        });

        if (result.success) {
          return new Response("Created", { status: 201 });
        }
        return new Response("Failed to create", { status: 500 });
      }

      if (request.method === "PUT") {
        const body = (await request.json()) as DDayPayload;
        if (!body.id) {
          return badRequest("ID is required");
        }

        const numericId = parseNumericId(body.id);
        if (numericId === null) return badRequest("Invalid id");

        if (!body.title?.trim() || !body.date?.trim()) {
          return badRequest("title and date are required");
        }
        const type = normalizeDDayType(body.type);

        const result = await db
          .update(ddays)
          .set({
            title: body.title.trim(),
            date: body.date.trim(),
            description: body.description?.trim() || null,
            color: body.color?.trim() || null,
            type,
          })
          .where(eq(ddays.id, numericId));

        if (result.success) {
          return new Response("Updated", { status: 200 });
        }
        return new Response("Failed to update", { status: 500 });
      }

      if (request.method === "DELETE") {
        const id = url.searchParams.get("id");
        if (!id) {
          return badRequest("ID parameter is required");
        }
        const numericId = parseNumericId(id);
        if (numericId === null) return badRequest("Invalid id");

        const result = await db.delete(ddays).where(eq(ddays.id, numericId));

        if (result.success) {
          return new Response("Deleted", { status: 200 });
        }
        return new Response("Failed to delete", { status: 500 });
      }
    }

    // 설정 API (자동 업데이트 설정 관리)
    if (url.pathname.startsWith("/api/settings")) {
      // 자동 업데이트 관련 설정 키만 허용
      const ALLOWED_SETTINGS = [
        "auto_update_enabled",
        "auto_update_interval_hours",
        "auto_update_last_run",
      ] as const;

      if (request.method === "GET") {
        const data = await db
          .select()
          .from(settings)
          .where(inArray(settings.key, [...ALLOWED_SETTINGS]));

        // 키-값 객체로 변환
        const settingsObj: Record<string, string | null> = {};
        for (const row of data) {
          settingsObj[row.key] = row.value;
        }
        return Response.json(settingsObj);
      }

      if (request.method === "PUT") {
        const body = (await request.json()) as Record<string, string>;

        // 허용된 키만 업데이트
        const updates: Promise<void>[] = [];
        for (const key of ALLOWED_SETTINGS) {
          if (key in body && key !== "auto_update_last_run") {
            // last_run은 시스템에서만 업데이트
            updates.push(updateSetting(db, key, body[key]));
          }
        }

        if (updates.length === 0) {
          return badRequest("No valid settings to update");
        }

        await Promise.all(updates);
        return new Response("Settings updated", { status: 200 });
      }

      // POST /api/settings/run-now - 수동 실행
      if (
        request.method === "POST" &&
        url.pathname === "/api/settings/run-now"
      ) {
        try {
          const result = await autoUpdateSchedules(db);
          await updateSetting(
            db,
            "auto_update_last_run",
            Date.now().toString(),
          );
          return Response.json({
            success: true,
            updated: result.updated,
            checked: result.checked,
            details: result.details,
          });
        } catch (error) {
          console.error("Manual auto update failed:", error);
          return new Response("Auto update failed", { status: 500 });
        }
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json({
        name: "Cloudflare",
      });
    }
    return new Response(null, { status: 404 });
  },

  // Cron Trigger로 실행되는 스케줄 자동 업데이트
  async scheduled(_event, env, _ctx) {
    const db = getDb(env);

    // 1. 자동 업데이트 활성화 여부 확인
    const enabled = await getSetting(db, "auto_update_enabled");
    if (enabled !== "true") {
      console.log("[scheduled] Auto update is disabled");
      return;
    }

    // 2. 마지막 실행 시간 및 주기 확인
    const intervalHoursStr = await getSetting(db, "auto_update_interval_hours");
    const intervalHours = parseInt(intervalHoursStr || "2", 10);
    const intervalMs = intervalHours * 60 * 60 * 1000;

    const lastRunStr = await getSetting(db, "auto_update_last_run");
    const lastRun = lastRunStr ? parseInt(lastRunStr, 10) : 0;
    const now = Date.now();

    if (now - lastRun < intervalMs) {
      console.log(
        `[scheduled] Skipping - last run was ${Math.round((now - lastRun) / 60000)}min ago, interval is ${intervalHours}h`,
      );
      return;
    }

    // 3. 자동 업데이트 실행
    console.log("[scheduled] Running auto update...");
    try {
      const result = await autoUpdateSchedules(db);
      console.log(
        `[scheduled] Auto update completed: ${result.updated}/${result.checked} updated`,
        result.details,
      );

      // 4. 마지막 실행 시간 업데이트
      await updateSetting(db, "auto_update_last_run", now.toString());
    } catch (error) {
      console.error("[scheduled] Auto update failed:", error);
    }
  },
} satisfies ExportedHandler<Env>;
