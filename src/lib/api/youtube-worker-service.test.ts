import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearYouTubeServiceCachesForTests,
  fetchYouTubeVideosForChannel,
  getYouTubeCacheStatus,
} from "../../../worker/services/youtube";

type FakeCacheRecord = {
  key: string;
  type: "uploads_playlist" | "channel_videos";
  value: string;
  fetched_at: number;
  expires_at: number;
  stale_until: number;
  last_status: number | null;
  last_error: string | null;
};

type FakeUsageEvent = {
  operation: string;
  channel_id: string | null;
  cache_key: string | null;
  quota_units: number;
  status: number;
  duration_ms: number;
  created_at: number;
  error: string | null;
};

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const makeYouTubeCacheDb = (
  initial: Record<string, FakeCacheRecord> = {},
) => {
  const cache = new Map(Object.entries(initial));
  const usageEvents: FakeUsageEvent[] = [];
  const db = {
    prepare(sql: string) {
      const execute = (args: unknown[]) => ({
        async first<T>() {
          if (sql.includes("FROM youtube_api_cache")) {
            const [key, type] = args;
            const record = cache.get(String(key));
            if (!record || record.type !== type) return null as T | null;
            return record as T;
          }
          return null as T | null;
        },
        async all<T>() {
          if (sql.includes("FROM youtube_api_cache")) {
            return { results: Array.from(cache.values()) as T[] };
          }
          if (sql.includes("FROM youtube_api_usage_events")) {
            const since = Number(args[0] ?? 0);
            return {
              results: usageEvents.filter((event) => event.created_at >= since) as T[],
            };
          }
          return { results: [] as T[] };
        },
        async run() {
          if (sql.includes("INSERT INTO youtube_api_cache")) {
            const [
              key,
              type,
              value,
              fetchedAt,
              expiresAt,
              staleUntil,
              lastStatus,
              lastError,
            ] = args;
            cache.set(String(key), {
              key: String(key),
              type: type as FakeCacheRecord["type"],
              value: String(value),
              fetched_at: Number(fetchedAt),
              expires_at: Number(expiresAt),
              stale_until: Number(staleUntil),
              last_status: lastStatus === null ? null : Number(lastStatus),
              last_error: lastError === null ? null : String(lastError),
            });
          }
          if (sql.includes("UPDATE youtube_api_cache")) {
            const [lastStatus, lastError, key] = args;
            const record = cache.get(String(key));
            if (record) {
              cache.set(String(key), {
                ...record,
                last_status: Number(lastStatus),
                last_error: lastError === null ? null : String(lastError),
              });
            }
          }
          if (sql.includes("INSERT INTO youtube_api_usage_events")) {
            const [
              operation,
              channelId,
              cacheKey,
              quotaUnits,
              status,
              durationMs,
              createdAt,
              error,
            ] = args;
            usageEvents.push({
              operation: String(operation),
              channel_id: channelId === null ? null : String(channelId),
              cache_key: cacheKey === null ? null : String(cacheKey),
              quota_units: Number(quotaUnits),
              status: Number(status),
              duration_ms: Number(durationMs),
              created_at: Number(createdAt),
              error: error === null ? null : String(error),
            });
          }
        },
      });

      return {
        bind: (...args: unknown[]) => execute(args),
        first: execute([]).first,
        all: execute([]).all,
        run: execute([]).run,
      };
    },
    cache,
    usageEvents,
  };

  return db as typeof db & Pick<D1Database, "prepare">;
};

describe("YouTube worker service cache", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-09T00:00:00Z"));
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    clearYouTubeServiceCachesForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("D1 fresh cache가 있으면 외부 YouTube API를 호출하지 않는다", async () => {
    const timestamp = Date.now();
    const db = makeYouTubeCacheDb({
      "videos:UC_A:20": {
        key: "videos:UC_A:20",
        type: "channel_videos",
        value: JSON.stringify({
          videos: [{ videoId: "cached", isShort: false }],
          shorts: [],
        }),
        fetched_at: timestamp,
        expires_at: timestamp + 60_000,
        stale_until: timestamp + 600_000,
        last_status: 200,
        last_error: null,
      },
    });

    const result = await fetchYouTubeVideosForChannel("UC_A", "api-key", 20, db);

    expect(result?.videos[0]?.videoId).toBe("cached");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.usageEvents).toEqual([]);
  });

  it("cache miss에서는 API 호출 후 D1 cache와 usage event를 기록한다", async () => {
    const db = makeYouTubeCacheDb();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              contentDetails: {
                relatedPlaylists: { uploads: "UU_A" },
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [{ contentDetails: { videoId: "v1" } }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: "v1",
              snippet: {
                title: "Video 1",
                publishedAt: "2026-07-08T12:00:00Z",
                thumbnails: { high: { url: "https://img.example/v1.jpg" } },
                channelId: "UC_A",
                channelTitle: "Channel A",
              },
              contentDetails: { duration: "PT2M" },
              statistics: { viewCount: "100" },
            },
          ],
        }),
      );

    const result = await fetchYouTubeVideosForChannel("UC_A", "api-key", 20, db);

    expect(result?.videos[0]?.videoId).toBe("v1");
    expect(db.cache.has("playlist:UC_A")).toBe(true);
    expect(db.cache.has("videos:UC_A:20")).toBe(true);
    expect(db.usageEvents.map((event) => event.operation)).toEqual([
      "channels.list",
      "playlistItems.list",
      "videos.list",
    ]);
    expect(db.usageEvents.every((event) => event.quota_units === 1)).toBe(true);
  });

  it("API 실패 시 D1 stale cache를 반환한다", async () => {
    const timestamp = Date.now();
    const db = makeYouTubeCacheDb({
      "videos:UC_A:20": {
        key: "videos:UC_A:20",
        type: "channel_videos",
        value: JSON.stringify({
          videos: [{ videoId: "stale", isShort: false }],
          shorts: [],
        }),
        fetched_at: timestamp - 10 * 60_000,
        expires_at: timestamp - 60_000,
        stale_until: timestamp + 60 * 60_000,
        last_status: 200,
        last_error: null,
      },
    });
    fetchMock.mockResolvedValueOnce(new Response("quotaExceeded", { status: 403 }));

    const result = await fetchYouTubeVideosForChannel("UC_A", "api-key", 20, db);

    expect(result?.videos[0]?.videoId).toBe("stale");
    expect(db.usageEvents).toHaveLength(1);
    expect(db.usageEvents[0]).toMatchObject({
      operation: "channels.list",
      status: 403,
    });
  });

  it("stale cache가 없고 API가 실패하면 null을 반환한다", async () => {
    const db = makeYouTubeCacheDb();
    fetchMock.mockResolvedValueOnce(new Response("error", { status: 500 }));

    const result = await fetchYouTubeVideosForChannel("UC_A", "api-key", 20, db);

    expect(result).toBeNull();
  });

  it("cache status 집계를 반환한다", async () => {
    const timestamp = Date.now();
    const db = makeYouTubeCacheDb({
      "playlist:UC_A": {
        key: "playlist:UC_A",
        type: "uploads_playlist",
        value: JSON.stringify({ playlistId: "UU_A" }),
        fetched_at: timestamp,
        expires_at: timestamp + 60_000,
        stale_until: timestamp + 600_000,
        last_status: 200,
        last_error: null,
      },
      "videos:UC_A:20": {
        key: "videos:UC_A:20",
        type: "channel_videos",
        value: JSON.stringify({ videos: [], shorts: [] }),
        fetched_at: timestamp - 10 * 60_000,
        expires_at: timestamp - 60_000,
        stale_until: timestamp + 60_000,
        last_status: 403,
        last_error: "quotaExceeded",
      },
    });
    db.usageEvents.push(
      {
        operation: "channels.list",
        channel_id: "UC_A",
        cache_key: "playlist:UC_A",
        quota_units: 1,
        status: 200,
        duration_ms: 5,
        created_at: timestamp,
        error: null,
      },
      {
        operation: "videos.list",
        channel_id: "UC_A",
        cache_key: "videos:UC_A:20",
        quota_units: 1,
        status: 403,
        duration_ms: 5,
        created_at: timestamp,
        error: "quotaExceeded",
      },
    );

    const status = await getYouTubeCacheStatus(db, 24);

    expect(status.cache).toMatchObject({ total: 2, fresh: 1, stale: 1 });
    expect(status.usage).toMatchObject({
      apiCalls: 2,
      quotaUnits: 2,
      successCount: 1,
      failureCount: 1,
      quotaErrorCount: 1,
    });
    expect(status.channels.find((row) => row.cacheKey === "videos:UC_A:20"))
      .toMatchObject({ channelId: "UC_A", maxResults: 20, status: "stale" });
  });
});
