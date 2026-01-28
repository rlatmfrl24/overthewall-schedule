import { SQL, and, between, eq } from "drizzle-orm";
import { getDb } from "./db";
import {
  members,
  schedules,
  notices,
  type NewSchedule,
  ddays,
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
const CHZZK_VIDEOS_TTL_MS = 60_000;

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
const CHZZK_CLIPS_TTL_MS = 60_000;

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

      const apiKey = env.YOUTUBE_API_KEY;
      if (!apiKey) {
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
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      );
      allShorts.sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      );

      return json({
        updatedAt: new Date().toISOString(),
        videos: allVideos,
        shorts: allShorts,
        byChannel: items,
      });
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

    if (url.pathname.startsWith("/api/")) {
      return Response.json({
        name: "Cloudflare",
      });
    }
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
