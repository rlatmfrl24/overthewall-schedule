import type {
  CachedChzzkClips,
  CachedChzzkVideos,
  CachedLiveStatus,
  LiveStatusDebug,
} from "../types";

const LIVE_STATUS_CACHE = new Map<string, CachedLiveStatus>();
const LIVE_STATUS_TTL_MS = 60_000;

// Chzzk VOD Cache
const CHZZK_VIDEOS_CACHE = new Map<string, CachedChzzkVideos>();
const CHZZK_VIDEOS_TTL_MS = 300_000;

// Chzzk Clips Cache
const CHZZK_CLIPS_CACHE = new Map<string, CachedChzzkClips>();
const CHZZK_CLIPS_TTL_MS = 300_000;

export const fetchChzzkLiveStatusWithDebug = async (channelId: string) => {
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
  const retryDelays = [0, 500];
  let lastStatus: number | null = null;
  let lastError: string | null = null;
  let lastErrorBody: string | null = null;

  for (const delayMs of retryDelays) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Referer: "https://chzzk.naver.com/",
          Origin: "https://chzzk.naver.com",
        },
      });
      lastStatus = res.status;

      if (!res.ok) {
        lastError = "http_error";
        const errorBody = await res.text().catch(() => "");
        lastErrorBody = errorBody.slice(0, 1000);
        console.error(
          "Failed to fetch chzzk live status",
          channelId,
          res.status,
          errorBody.slice(0, 500),
        );
        if ([500, 502, 503, 504].includes(res.status)) {
          continue;
        }
        break;
      }

      const data = (await res.json()) as {
        code: number;
        content: CachedLiveStatus["content"];
      };

      const content = data?.content ?? null;
      LIVE_STATUS_CACHE.set(channelId, {
        fetchedAt: Date.now(),
        content,
      });
      return {
        content,
        debug: {
          cacheHit: false,
          cacheAgeMs: null,
          fetchedAt: Date.now(),
          httpStatus: res.status,
          error: null,
          staleCacheUsed: false,
        } satisfies LiveStatusDebug,
      };
    } catch (error) {
      lastError = "network_error";
      console.error("Failed to fetch chzzk live status", channelId, error);
    }
  }

  return {
    content: cached?.content ?? null,
    debug: {
      cacheHit: false,
      cacheAgeMs: null,
      fetchedAt: cached?.fetchedAt ?? null,
      httpStatus: lastStatus,
      error: lastError,
      staleCacheUsed: Boolean(cached),
      errorBody: lastErrorBody,
    } as LiveStatusDebug & { errorBody?: string | null },
  };
};

export const fetchChzzkLiveStatus = async (channelId: string) => {
  const result = await fetchChzzkLiveStatusWithDebug(channelId);
  return result.content;
};

export const fetchChzzkVideos = async (
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

export const fetchChzzkClips = async (
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
