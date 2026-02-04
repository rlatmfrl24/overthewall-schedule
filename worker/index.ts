import {
  SQL,
  and,
  between,
  eq,
  gte,
  inArray,
  lte,
  desc,
  isNull,
  sql,
} from "drizzle-orm";
import { getDb, type DbInstance } from "./db";
import {
  members,
  schedules,
  notices,
  type NewSchedule,
  ddays,
  settings,
  updateLogs,
  pendingSchedules,
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

type LiveStatusDebug = {
  cacheHit: boolean;
  cacheAgeMs: number | null;
  fetchedAt: number | null;
  httpStatus: number | null;
  error: string | null;
  staleCacheUsed: boolean | null;
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
  apiKey: string
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
          `YouTube API quota exceeded or rate limited for channel ${channelId}`
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
  retryCount = 0
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
          retryCount + 1
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
  apiKey: string
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
        const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${batch.join(
          ","
        )}&key=${apiKey}`;
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
              item.contentDetails?.duration || "PT0S"
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
      })
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
  maxResults = 20
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
    apiKey
  );
  if (!uploadsPlaylistId) {
    YOUTUBE_VIDEOS_CACHE.set(cacheKey, { fetchedAt: now, content: null });
    return null;
  }

  // 2. 플레이리스트 아이템 조회
  const videoIds = await fetchYouTubePlaylistItems(
    uploadsPlaylistId,
    apiKey,
    maxResults
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

const getClientIp = (request: Request): string | null => {
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp;
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || null;
  const realIp = request.headers.get("x-real-ip");
  return realIp ?? null;
};

const getActorInfo = (request: Request) => {
  const actorId = request.headers.get("x-otw-user-id")?.trim() || null;
  const actorName = request.headers.get("x-otw-user-name")?.trim() || null;
  const actorIp = getClientIp(request);
  return { actorId, actorName, actorIp };
};

type UpdateLogPayload = {
  scheduleId?: number | null;
  memberUid?: number | null;
  memberName?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  actorIp?: string | null;
  scheduleDate: string;
  action:
    | "create"
    | "update"
    | "delete"
    | "approve"
    | "reject"
    | "auto_collected"
    | "auto_updated"
    | "auto_failed";
  title?: string | null;
  previousStatus?: string | null;
};

const resolveMemberName = async (db: DbInstance, memberUid?: number | null) => {
  if (!memberUid) return null;
  const data = await db
    .select({ name: members.name })
    .from(members)
    .where(eq(members.uid, memberUid))
    .limit(1);
  return data[0]?.name ?? null;
};

const insertUpdateLog = async (db: DbInstance, payload: UpdateLogPayload) => {
  const resolvedName =
    payload.memberName ?? (await resolveMemberName(db, payload.memberUid));
  const resolvedActorName =
    payload.actorName ?? (payload.action.startsWith("auto_") ? "system" : null);
  await db.insert(updateLogs).values({
    schedule_id: payload.scheduleId ?? null,
    member_uid: payload.memberUid ?? null,
    member_name: resolvedName ?? null,
    actor_id: payload.actorId ?? null,
    actor_name: resolvedActorName,
    actor_ip: payload.actorIp ?? null,
    schedule_date: payload.scheduleDate,
    action: payload.action,
    title: payload.title ?? null,
    previous_status: payload.previousStatus ?? null,
  });
};

const fetchChzzkLiveStatusWithDebug = async (channelId: string) => {
  const cached = LIVE_STATUS_CACHE.get(channelId);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < LIVE_STATUS_TTL_MS) {
    return {
      content: cached.content,
      debug: {
        cacheHit: true,
        cacheAgeMs: now - cached.fetchedAt,
        fetchedAt: cached.fetchedAt,
        httpStatus: null,
        error: null,
        staleCacheUsed: false,
      } satisfies LiveStatusDebug,
    };
  }

  const url = `https://api.chzzk.naver.com/polling/v2/channels/${channelId}/live-status`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Referer: "https://chzzk.naver.com/",
        Origin: "https://chzzk.naver.com",
      },
      cf: {
        cacheTtl: 0,
        cacheEverything: false,
      },
    });
    if (!res.ok) {
      console.error("Failed to fetch chzzk live status", channelId, res.status);
      return {
        content: cached?.content ?? null,
        debug: {
          cacheHit: false,
          cacheAgeMs: null,
          fetchedAt: cached?.fetchedAt ?? null,
          httpStatus: res.status,
          error: "http_error",
          staleCacheUsed: Boolean(cached),
        } satisfies LiveStatusDebug,
      };
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
    return {
      content,
      debug: {
        cacheHit: false,
        cacheAgeMs: null,
        fetchedAt: now,
        httpStatus: res.status,
        error: null,
        staleCacheUsed: false,
      } satisfies LiveStatusDebug,
    };
  } catch (error) {
    console.error("Failed to fetch chzzk live status", channelId, error);
    return {
      content: cached?.content ?? null,
      debug: {
        cacheHit: false,
        cacheAgeMs: null,
        fetchedAt: cached?.fetchedAt ?? null,
        httpStatus: null,
        error: "network_error",
        staleCacheUsed: Boolean(cached),
      } satisfies LiveStatusDebug,
    };
  }
};

const fetchChzzkLiveStatus = async (channelId: string) => {
  const result = await fetchChzzkLiveStatusWithDebug(channelId);
  return result.content;
};

const fetchChzzkVideos = async (
  channelId: string,
  page = 0,
  size = 24
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
  size = 30
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
  key: string
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
  value: string
): Promise<void> => {
  await db
    .insert(settings)
    .values({ key, value, updated_at: Date.now().toString() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updated_at: Date.now().toString() },
    });
};

// 자동 업데이트 결과 타입
type AutoUpdateDetail = {
  memberUid: number;
  memberName: string;
  scheduleId: number | null;
  scheduleDate: string;
  action: string;
  title?: string;
  previousStatus: string | null;
};

// 자동 업데이트 핵심 로직 (승인 프로세스 적용)
// - VOD 수집 후 pending_schedules 테이블에 저장 (관리자 승인 대기)
// - 스케줄 없음 + VOD 있음 → pending에 action_type: "create"로 저장
// - 스케줄 있음 + (방송 상태 아니거나 제목 없음) + VOD 있음 → pending에 action_type: "update"로 저장
// - 스케줄 있음 + 방송 상태 + 제목 있음 → 변경 없음
const autoUpdateSchedules = async (
  db: DbInstance,
  rangeDays: number = 3
): Promise<{
  updated: number;
  checked: number;
  details: AutoUpdateDetail[];
}> => {
  const today = getKSTDateString();
  const startDate = getKSTDateString(
    new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000)
  );
  const details: AutoUpdateDetail[] = [];
  let collected = 0;
  let checked = 0;

  // 1. 모든 활성 멤버 조회 (is_deprecated가 아닌 것)
  const allMembers = await db
    .select({
      uid: members.uid,
      name: members.name,
      url_chzzk: members.url_chzzk,
    })
    .from(members)
    .where(
      sql`${members.is_deprecated} IS NULL OR ${members.is_deprecated} != '1'`
    );

  if (allMembers.length === 0) {
    return { updated: 0, checked: 0, details };
  }

  // 2. 날짜 범위 내의 모든 스케줄 조회 (한 번에)
  const existingSchedules = await db
    .select()
    .from(schedules)
    .where(and(gte(schedules.date, startDate), lte(schedules.date, today)));

  // 스케줄을 member_uid + date 기준으로 맵핑 (한 날짜에 여러 스케줄 가능)
  const scheduleMap = new Map<string, (typeof existingSchedules)[0][]>();
  for (const schedule of existingSchedules) {
    const key = `${schedule.member_uid}:${schedule.date}`;
    const existing = scheduleMap.get(key) || [];
    existing.push(schedule);
    scheduleMap.set(key, existing);
  }

  // 3. 기존 대기 스케줄 조회 (중복 방지용)
  const existingPending = await db.select().from(pendingSchedules);
  const pendingVodIds = new Set(
    existingPending.filter((p) => p.vod_id).map((p) => p.vod_id)
  );
  // member_uid + date + start_time 조합으로도 중복 체크
  const pendingKeys = new Set(
    existingPending.map(
      (p) => `${p.member_uid}:${p.date}:${p.start_time || ""}`
    )
  );

  // 4. 각 멤버별로 VOD 확인
  for (const member of allMembers) {
    const channelId = extractChzzkChannelId(member.url_chzzk);
    if (!channelId) {
      continue; // 치지직 채널이 없는 멤버는 건너뜀
    }

    // VOD 조회
    const videos = await fetchChzzkVideos(channelId, 0, 15);
    if (!videos || !videos.data || videos.data.length === 0) {
      continue; // VOD가 없으면 건너뜀
    }

    // 각 VOD에 대해 처리
    for (const video of videos.data) {
      // VOD ID로 중복 체크 (이미 pending에 있는 VOD는 건너뜀)
      const vodId = `chzzk:${video.videoId}`;
      if (pendingVodIds.has(vodId)) {
        continue;
      }

      // 실제 스트리밍 시작 시간 계산 (publishDateAt - duration)
      const startTimestamp = video.publishDateAt - video.duration * 1000;
      const videoDate = getKSTDateString(new Date(startTimestamp));

      // 날짜 범위 체크
      if (videoDate < startDate || videoDate > today) {
        continue;
      }

      checked++;

      const scheduleKey = `${member.uid}:${videoDate}`;
      const memberSchedules = scheduleMap.get(scheduleKey) || [];
      const startTime = extractKSTTime(new Date(startTimestamp).toISOString());

      // pending 중복 체크 (member_uid + date + start_time)
      const pendingKey = `${member.uid}:${videoDate}:${startTime}`;
      if (pendingKeys.has(pendingKey)) {
        continue;
      }

      // 시작 시간을 분 단위로 변환하여 비교 (±30분 이내면 같은 방송으로 간주)
      const videoMinutes =
        parseInt(startTime.split(":")[0]) * 60 +
        parseInt(startTime.split(":")[1]);

      // VOD와 매칭되는 기존 스케줄 찾기
      const matchingSchedule = memberSchedules.find((schedule) => {
        if (!schedule.start_time) return false;
        const scheduleMinutes =
          parseInt(schedule.start_time.split(":")[0]) * 60 +
          parseInt(schedule.start_time.split(":")[1]);
        return Math.abs(videoMinutes - scheduleMinutes) <= 30;
      });

      if (!matchingSchedule) {
        // 매칭되는 스케줄 없음 → pending에 신규 생성으로 저장
        await db.insert(pendingSchedules).values({
          member_uid: member.uid,
          member_name: member.name,
          date: videoDate,
          start_time: startTime,
          title: video.videoTitle,
          status: "방송",
          action_type: "create",
          existing_schedule_id: null,
          previous_status: null,
          previous_title: null,
          vod_id: vodId,
        });

        // 중복 방지를 위해 Set에 추가
        pendingVodIds.add(vodId);
        pendingKeys.add(pendingKey);

        await insertUpdateLog(db, {
          scheduleId: null,
          memberUid: member.uid,
          memberName: member.name,
          scheduleDate: videoDate,
          action: "auto_collected",
          title: video.videoTitle,
          previousStatus: null,
        });

        collected++;
        details.push({
          memberUid: member.uid,
          memberName: member.name,
          scheduleId: null,
          scheduleDate: videoDate,
          action: "auto_collected",
          title: video.videoTitle,
          previousStatus: null,
        });
      } else if (
        matchingSchedule.status !== "방송" ||
        !matchingSchedule.title?.trim()
      ) {
        // 매칭되는 스케줄 있음 + (방송 상태 아니거나 제목 없음) → pending에 업데이트로 저장
        const previousStatus = matchingSchedule.status;
        const previousTitle = matchingSchedule.title;

        await db.insert(pendingSchedules).values({
          member_uid: member.uid,
          member_name: member.name,
          date: videoDate,
          start_time: startTime,
          title: video.videoTitle,
          status: "방송",
          action_type: "update",
          existing_schedule_id: matchingSchedule.id,
          previous_status: previousStatus,
          previous_title: previousTitle,
          vod_id: vodId,
        });

        // 중복 방지를 위해 Set에 추가
        pendingVodIds.add(vodId);
        pendingKeys.add(pendingKey);

        await insertUpdateLog(db, {
          scheduleId: matchingSchedule.id,
          memberUid: member.uid,
          memberName: member.name,
          scheduleDate: videoDate,
          action: "auto_updated",
          title: video.videoTitle,
          previousStatus,
        });

        collected++;
        details.push({
          memberUid: member.uid,
          memberName: member.name,
          scheduleId: matchingSchedule.id,
          scheduleDate: videoDate,
          action: "auto_updated",
          title: video.videoTitle,
          previousStatus,
        });
      }
      // 매칭되는 스케줄 있음 + 방송 상태 + 제목 있음 → 변경 없음 (아무것도 안 함)
    }
  }

  return { updated: collected, checked, details };
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
      const debug = url.searchParams.get("debug") === "1";
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
        channelIds.map(async (channelId) => {
          if (debug) {
            const result = await fetchChzzkLiveStatusWithDebug(channelId);
            return { channelId, content: result.content, debug: result.debug };
          }
          return {
            channelId,
            content: await fetchChzzkLiveStatus(channelId),
          };
        })
      );

      return Response.json(
        {
          updatedAt: new Date().toISOString(),
          items,
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
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
          }))
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
          }))
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
        10
      );

      try {
        const items = await Promise.all(
          channelIds.map(async (channelId) => ({
            channelId,
            content: await fetchYouTubeVideosForChannel(
              channelId,
              apiKey,
              maxResults
            ),
          }))
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
            new Date(a.publishedAt).getTime()
        );
        allShorts.sort(
          (a, b) =>
            new Date(b.publishedAt).getTime() -
            new Date(a.publishedAt).getTime()
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
      const actor = getActorInfo(request);
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
          await insertUpdateLog(db, {
            scheduleId: null,
            memberUid: member_uid,
            scheduleDate: date,
            action: "create",
            title: title ?? null,
            previousStatus: null,
            actorId: actor.actorId,
            actorName: actor.actorName,
            actorIp: actor.actorIp,
          });
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

        const existing = await db
          .select()
          .from(schedules)
          .where(eq(schedules.id, numericId))
          .limit(1);

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
          if (existing.length > 0) {
            await insertUpdateLog(db, {
              scheduleId: numericId,
              memberUid: member_uid,
              scheduleDate: date,
              action: "update",
              title: title ?? null,
              previousStatus: existing[0].status,
              actorId: actor.actorId,
              actorName: actor.actorName,
              actorIp: actor.actorIp,
            });
          }
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

        const existing = await db
          .select()
          .from(schedules)
          .where(eq(schedules.id, numericId))
          .limit(1);

        const result = await db
          .delete(schedules)
          .where(eq(schedules.id, numericId));

        if (result.success) {
          if (existing.length > 0) {
            const target = existing[0];
            await insertUpdateLog(db, {
              scheduleId: numericId,
              memberUid: target.member_uid,
              scheduleDate: target.date,
              action: "delete",
              title: target.title ?? null,
              previousStatus: target.status,
              actorId: actor.actorId,
              actorName: actor.actorName,
              actorIp: actor.actorIp,
            });
          }
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
      const actor = getActorInfo(request);
      // 자동 업데이트 관련 설정 키만 허용
      const ALLOWED_SETTINGS = [
        "auto_update_enabled",
        "auto_update_interval_hours",
        "auto_update_last_run",
        "auto_update_range_days",
      ] as const;

      // GET /api/settings/logs - 로그 조회 (더 구체적인 경로를 먼저 처리)
      if (request.method === "GET" && url.pathname === "/api/settings/logs") {
        const limit = parseInt(url.searchParams.get("limit") || "50", 10);
        const action = url.searchParams.get("action");
        const member = url.searchParams.get("member");
        const dateFrom = url.searchParams.get("dateFrom");
        const dateTo = url.searchParams.get("dateTo");
        const query = url.searchParams.get("query");

        const filters: SQL[] = [];
        if (action && action !== "all") {
          filters.push(eq(updateLogs.action, action));
        }
        if (member) {
          const memberQuery = `%${member.toLowerCase()}%`;
          filters.push(
            sql`lower(coalesce(${updateLogs.member_name}, '')) like ${memberQuery}`
          );
        }
        if (dateFrom && dateTo) {
          filters.push(between(updateLogs.schedule_date, dateFrom, dateTo));
        } else if (dateFrom) {
          filters.push(gte(updateLogs.schedule_date, dateFrom));
        } else if (dateTo) {
          filters.push(lte(updateLogs.schedule_date, dateTo));
        }
        if (query) {
          const searchQuery = `%${query.toLowerCase()}%`;
          filters.push(
            sql`(
              lower(coalesce(${updateLogs.title}, '')) like ${searchQuery}
              or lower(coalesce(${updateLogs.member_name}, '')) like ${searchQuery}
            )`
          );
        }

        let logQuery = db.select().from(updateLogs).$dynamic();
        if (filters.length > 0) {
          logQuery = logQuery.where(and(...filters));
        }

        const logsData = await logQuery
          .orderBy(desc(updateLogs.created_at))
          .limit(limit);
        return Response.json(logsData);
      }

      // GET /api/settings - 설정 조회
      if (request.method === "GET" && url.pathname === "/api/settings") {
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
          // 날짜 범위 설정 가져오기
          const rangeDaysStr = await getSetting(db, "auto_update_range_days");
          const rangeDays = parseInt(rangeDaysStr || "3", 10);

          const result = await autoUpdateSchedules(db, rangeDays);
          await updateSetting(
            db,
            "auto_update_last_run",
            Date.now().toString()
          );
          return Response.json({
            success: true,
            updated: result.updated,
            checked: result.checked,
            details: result.details,
          });
        } catch (error) {
          console.error("Manual auto update failed:", error);
          const today = new Date().toISOString().slice(0, 10);
          await insertUpdateLog(db, {
            scheduleId: null,
            memberUid: null,
            memberName: null,
            scheduleDate: today,
            action: "auto_failed",
            title: "manual auto update failed",
            previousStatus: null,
            actorId: actor.actorId,
            actorName: actor.actorName,
            actorIp: actor.actorIp,
          });
          return new Response("Auto update failed", { status: 500 });
        }
      }

      // DELETE /api/settings/logs/:id - 로그만 삭제 (스케줄 연동 제외)
      if (
        request.method === "DELETE" &&
        url.pathname.startsWith("/api/settings/logs/")
      ) {
        const logId = url.pathname.split("/").pop();
        if (!logId) {
          return badRequest("Log ID is required");
        }
        const numericId = parseNumericId(logId);
        if (numericId === null) {
          return badRequest("Invalid log ID");
        }

        // 로그 삭제 (스케줄 삭제 연동 제외)
        await db.delete(updateLogs).where(eq(updateLogs.id, numericId));

        return Response.json({ success: true });
      }

      // GET /api/settings/pending - 대기 스케줄 목록 조회
      if (
        request.method === "GET" &&
        url.pathname === "/api/settings/pending"
      ) {
        const pendingList = await db
          .select()
          .from(pendingSchedules)
          .orderBy(desc(pendingSchedules.created_at));
        return Response.json(pendingList);
      }

      // POST /api/settings/pending/:id/approve - 개별 승인
      if (
        request.method === "POST" &&
        url.pathname.match(/^\/api\/settings\/pending\/\d+\/approve$/)
      ) {
        const pathParts = url.pathname.split("/");
        const pendingId = parseNumericId(pathParts[4]);
        if (pendingId === null) {
          return badRequest("Invalid pending ID");
        }

        // 대기 스케줄 조회
        const pending = await db
          .select()
          .from(pendingSchedules)
          .where(eq(pendingSchedules.id, pendingId))
          .limit(1);

        if (pending.length === 0) {
          return new Response("Pending schedule not found", { status: 404 });
        }

        const item = pending[0];

        try {
          let createdScheduleId: number | null = null;
          if (item.action_type === "create") {
            // 충돌 감지: 같은 멤버, 같은 날짜에 비슷한 시간의 스케줄이 있는지 확인
            const existingSchedules = await db
              .select()
              .from(schedules)
              .where(
                and(
                  eq(schedules.member_uid, item.member_uid),
                  eq(schedules.date, item.date)
                )
              );

            // 시간 충돌 검사 (±30분 이내)
            if (item.start_time) {
              const pendingMinutes =
                parseInt(item.start_time.split(":")[0]) * 60 +
                parseInt(item.start_time.split(":")[1]);

              const conflicting = existingSchedules.find((s) => {
                if (!s.start_time) return false;
                const scheduleMinutes =
                  parseInt(s.start_time.split(":")[0]) * 60 +
                  parseInt(s.start_time.split(":")[1]);
                return Math.abs(pendingMinutes - scheduleMinutes) <= 30;
              });

              if (conflicting) {
                return Response.json(
                  {
                    success: false,
                    error: "conflict",
                    message: `이미 비슷한 시간(${conflicting.start_time})에 스케줄이 존재합니다.`,
                    conflictingScheduleId: conflicting.id,
                  },
                  { status: 409 }
                );
              }
            }

            // 신규 생성: schedules 테이블에 삽입
            await db.insert(schedules).values({
              member_uid: item.member_uid,
              date: item.date,
              start_time: item.start_time,
              title: item.title,
              status: item.status,
            });
            const created = await db
              .select({ id: schedules.id })
              .from(schedules)
              .where(
                and(
                  eq(schedules.member_uid, item.member_uid),
                  eq(schedules.date, item.date),
                  item.start_time
                    ? eq(schedules.start_time, item.start_time)
                    : isNull(schedules.start_time),
                  item.title
                    ? eq(schedules.title, item.title)
                    : isNull(schedules.title)
                )
              )
              .orderBy(desc(schedules.id))
              .limit(1);
            createdScheduleId = created[0]?.id ?? null;
          } else if (
            item.action_type === "update" &&
            item.existing_schedule_id
          ) {
            // 정합성 검사: 대상 스케줄이 아직 존재하는지 확인
            const targetSchedule = await db
              .select()
              .from(schedules)
              .where(eq(schedules.id, item.existing_schedule_id))
              .limit(1);

            if (targetSchedule.length === 0) {
              return Response.json(
                {
                  success: false,
                  error: "not_found",
                  message: "수정 대상 스케줄이 이미 삭제되었습니다.",
                },
                { status: 404 }
              );
            }

            // 업데이트: 기존 스케줄 수정
            await db
              .update(schedules)
              .set({
                start_time: item.start_time,
                title: item.title,
                status: item.status,
              })
              .where(eq(schedules.id, item.existing_schedule_id));
          }

          await insertUpdateLog(db, {
            scheduleId: item.existing_schedule_id ?? createdScheduleId,
            memberUid: item.member_uid,
            memberName: item.member_name,
            scheduleDate: item.date,
            action: "approve",
            title: item.title,
            previousStatus: item.previous_status,
            actorId: actor.actorId,
            actorName: actor.actorName,
            actorIp: actor.actorIp,
          });

          // 대기 스케줄 삭제
          await db
            .delete(pendingSchedules)
            .where(eq(pendingSchedules.id, pendingId));

          return Response.json({ success: true, action: item.action_type });
        } catch (error) {
          console.error("Failed to approve pending schedule:", error);
          return new Response("Failed to approve", { status: 500 });
        }
      }

      // POST /api/settings/pending/:id/reject - 개별 거부
      if (
        request.method === "POST" &&
        url.pathname.match(/^\/api\/settings\/pending\/\d+\/reject$/)
      ) {
        const pathParts = url.pathname.split("/");
        const pendingId = parseNumericId(pathParts[4]);
        if (pendingId === null) {
          return badRequest("Invalid pending ID");
        }

        // 대기 스케줄 조회
        const pending = await db
          .select()
          .from(pendingSchedules)
          .where(eq(pendingSchedules.id, pendingId))
          .limit(1);

        if (pending.length === 0) {
          return new Response("Pending schedule not found", { status: 404 });
        }

        const item = pending[0];

        await insertUpdateLog(db, {
          scheduleId: item.existing_schedule_id,
          memberUid: item.member_uid,
          memberName: item.member_name,
          scheduleDate: item.date,
          action: "reject",
          title: item.title,
          previousStatus: item.previous_status,
          actorId: actor.actorId,
          actorName: actor.actorName,
          actorIp: actor.actorIp,
        });

        // 대기 스케줄 삭제
        await db
          .delete(pendingSchedules)
          .where(eq(pendingSchedules.id, pendingId));

        return Response.json({ success: true });
      }

      // POST /api/settings/pending/approve-all - 전체 승인
      if (
        request.method === "POST" &&
        url.pathname === "/api/settings/pending/approve-all"
      ) {
        const allPending = await db.select().from(pendingSchedules);

        let approvedCount = 0;
        let skippedCount = 0;
        const skippedItems: { id: number; reason: string }[] = [];

        for (const item of allPending) {
          try {
            let createdScheduleId: number | null = null;
            if (item.action_type === "create") {
              // 충돌 감지
              const existingSchedules = await db
                .select()
                .from(schedules)
                .where(
                  and(
                    eq(schedules.member_uid, item.member_uid),
                    eq(schedules.date, item.date)
                  )
                );

              let hasConflict = false;
              if (item.start_time) {
                const pendingMinutes =
                  parseInt(item.start_time.split(":")[0]) * 60 +
                  parseInt(item.start_time.split(":")[1]);

                hasConflict = existingSchedules.some((s) => {
                  if (!s.start_time) return false;
                  const scheduleMinutes =
                    parseInt(s.start_time.split(":")[0]) * 60 +
                    parseInt(s.start_time.split(":")[1]);
                  return Math.abs(pendingMinutes - scheduleMinutes) <= 30;
                });
              }

              if (hasConflict) {
                skippedCount++;
                skippedItems.push({ id: item.id, reason: "conflict" });
                continue;
              }

              await db.insert(schedules).values({
                member_uid: item.member_uid,
                date: item.date,
                start_time: item.start_time,
                title: item.title,
                status: item.status,
              });
              const created = await db
                .select({ id: schedules.id })
                .from(schedules)
                .where(
                  and(
                    eq(schedules.member_uid, item.member_uid),
                    eq(schedules.date, item.date),
                    item.start_time
                      ? eq(schedules.start_time, item.start_time)
                      : isNull(schedules.start_time),
                    item.title
                      ? eq(schedules.title, item.title)
                      : isNull(schedules.title)
                  )
                )
                .orderBy(desc(schedules.id))
                .limit(1);
              createdScheduleId = created[0]?.id ?? null;
            } else if (
              item.action_type === "update" &&
              item.existing_schedule_id
            ) {
              // 정합성 검사
              const targetSchedule = await db
                .select()
                .from(schedules)
                .where(eq(schedules.id, item.existing_schedule_id))
                .limit(1);

              if (targetSchedule.length === 0) {
                skippedCount++;
                skippedItems.push({ id: item.id, reason: "not_found" });
                continue;
              }

              await db
                .update(schedules)
                .set({
                  start_time: item.start_time,
                  title: item.title,
                  status: item.status,
                })
                .where(eq(schedules.id, item.existing_schedule_id));
            }

            await insertUpdateLog(db, {
              scheduleId: item.existing_schedule_id ?? createdScheduleId,
              memberUid: item.member_uid,
              memberName: item.member_name,
              scheduleDate: item.date,
              action: "approve",
              title: item.title,
              previousStatus: item.previous_status,
              actorId: actor.actorId,
              actorName: actor.actorName,
              actorIp: actor.actorIp,
            });

            // 승인된 항목 삭제
            await db
              .delete(pendingSchedules)
              .where(eq(pendingSchedules.id, item.id));

            approvedCount++;
          } catch (error) {
            console.error(`Failed to approve pending ${item.id}:`, error);
            skippedCount++;
            skippedItems.push({ id: item.id, reason: "error" });
          }
        }

        return Response.json({
          success: true,
          approvedCount,
          skippedCount,
          skippedItems: skippedItems.length > 0 ? skippedItems : undefined,
        });
      }

      // POST /api/settings/pending/reject-all - 전체 거부
      if (
        request.method === "POST" &&
        url.pathname === "/api/settings/pending/reject-all"
      ) {
        const allPending = await db.select().from(pendingSchedules);

        for (const item of allPending) {
          await insertUpdateLog(db, {
            scheduleId: item.existing_schedule_id,
            memberUid: item.member_uid,
            memberName: item.member_name,
            scheduleDate: item.date,
            action: "reject",
            title: item.title,
            previousStatus: item.previous_status,
            actorId: actor.actorId,
            actorName: actor.actorName,
            actorIp: actor.actorIp,
          });
        }

        // 모든 대기 스케줄 삭제
        await db.delete(pendingSchedules);

        return Response.json({
          success: true,
          rejectedCount: allPending.length,
        });
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
  async scheduled(_event, env) {
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
        `[scheduled] Skipping - last run was ${Math.round(
          (now - lastRun) / 60000
        )}min ago, interval is ${intervalHours}h`
      );
      return;
    }

    // 3. 날짜 범위 설정 가져오기
    const rangeDaysStr = await getSetting(db, "auto_update_range_days");
    const rangeDays = parseInt(rangeDaysStr || "3", 10);

    // 4. 자동 업데이트 실행
    console.log(
      `[scheduled] Running auto update (range: ${rangeDays} days)...`
    );
    try {
      const result = await autoUpdateSchedules(db, rangeDays);
      console.log(
        `[scheduled] Auto update completed: ${result.updated}/${result.checked} updated`,
        result.details
      );

      // 5. 마지막 실행 시간 업데이트
      await updateSetting(db, "auto_update_last_run", now.toString());
    } catch (error) {
      console.error("[scheduled] Auto update failed:", error);
      const today = new Date().toISOString().slice(0, 10);
      await insertUpdateLog(db, {
        scheduleId: null,
        memberUid: null,
        memberName: null,
        scheduleDate: today,
        action: "auto_failed",
        title: "scheduled auto update failed",
        previousStatus: null,
      });
    }
  },
} satisfies ExportedHandler<Env>;
