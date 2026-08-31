import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearYouTubeServiceCachesForTests,
  fetchYouTubeVideosForChannel,
  getYouTubeCacheStatus,
} from "./youtube-api";
import {
  reserveYouTubeQuota,
  YouTubeQuotaAdmissionError,
} from "./youtube-quota";

vi.mock("./youtube-quota", () => ({
  reserveYouTubeQuota: vi.fn(async () => undefined),
  YouTubeQuotaAdmissionError: class YouTubeQuotaAdmissionError extends Error {},
}));

type FakeCacheRecord = {
  key: string;
  type: "uploads_playlist" | "channel_videos";
  value: string;
  fetched_at: number;
  expires_at: number;
  stale_until: number;
  refresh_after: number;
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
  request_origin: string;
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
            const until = Number(args[1] ?? Number.POSITIVE_INFINITY);
            const grouped = new Map<
              string,
              {
                operation: string;
                request_origin: string;
                api_calls: number;
                quota_units: number;
                success_count: number;
                failure_count: number;
                rate_limit_count: number;
                quota_error_count: number;
              }
            >();
            for (const event of usageEvents.filter(
              (candidate) =>
                candidate.created_at >= since && candidate.created_at <= until,
            )) {
              const key = `${event.operation}:${event.request_origin}`;
              const row = grouped.get(key) ?? {
                operation: event.operation,
                request_origin: event.request_origin,
                api_calls: 0,
                quota_units: 0,
                success_count: 0,
                failure_count: 0,
                rate_limit_count: 0,
                quota_error_count: 0,
              };
              if (event.quota_units > 0) row.api_calls += 1;
              row.quota_units += event.quota_units;
              if (event.status >= 200 && event.status < 300) {
                row.success_count += 1;
              } else {
                row.failure_count += 1;
              }
              if (event.status === 429) row.rate_limit_count += 1;
              if (event.status === 403 && /quota/i.test(event.error ?? "")) {
                row.quota_error_count += 1;
              }
              grouped.set(key, row);
            }
            return {
              results: Array.from(grouped.values()) as T[],
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
              refresh_after: 0,
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
              requestOrigin,
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
              request_origin: String(requestOrigin ?? "legacy_unknown"),
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
    vi.mocked(reserveYouTubeQuota).mockResolvedValue(undefined);
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
        refresh_after: 0,
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
        refresh_after: 0,
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

  it("성공한 빈 playlist 결과는 기존 콘텐츠를 유지하지 않고 empty cache로 갱신한다", async () => {
    const timestamp = Date.now();
    const db = makeYouTubeCacheDb({
      "playlist:UC_A": {
        key: "playlist:UC_A",
        type: "uploads_playlist",
        value: JSON.stringify({ playlistId: "UU_A" }),
        fetched_at: timestamp,
        expires_at: timestamp + 60_000,
        stale_until: timestamp + 600_000,
        refresh_after: 0,
        last_status: 200,
        last_error: null,
      },
      "videos:UC_A:20": {
        key: "videos:UC_A:20",
        type: "channel_videos",
        value: JSON.stringify({
          videos: [{ videoId: "removed-video", isShort: false }],
          shorts: [],
        }),
        fetched_at: timestamp - 10 * 60_000,
        expires_at: timestamp - 60_000,
        stale_until: timestamp + 60 * 60_000,
        refresh_after: 0,
        last_status: 200,
        last_error: null,
      },
    });
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [] }));

    const result = await fetchYouTubeVideosForChannel(
      "UC_A",
      "api-key",
      20,
      db,
      { forceRefresh: true, requestOrigin: "demand" },
    );

    expect(result).toEqual({ videos: [], shorts: [] });
    expect(JSON.parse(db.cache.get("videos:UC_A:20")!.value)).toEqual({
      videos: [],
      shorts: [],
    });
    expect(db.cache.get("videos:UC_A:20")?.fetched_at).toBe(timestamp);
  });

  it("stale cache가 없고 API가 실패하면 null을 반환한다", async () => {
    const db = makeYouTubeCacheDb();
    fetchMock.mockResolvedValueOnce(new Response("error", { status: 500 }));

    const result = await fetchYouTubeVideosForChannel("UC_A", "api-key", 20, db);

    expect(result).toBeNull();
  });

  it("quota admission 거절은 외부 호출과 quota 사용량 0으로 기록한다", async () => {
    const db = makeYouTubeCacheDb();
    vi.mocked(reserveYouTubeQuota).mockRejectedValueOnce(
      new YouTubeQuotaAdmissionError("core"),
    );

    const result = await fetchYouTubeVideosForChannel(
      "UC_A",
      "api-key",
      20,
      db,
      { forceRefresh: true, requestOrigin: "demand" },
    );

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.usageEvents).toEqual([
      expect.objectContaining({
        operation: "channels.list",
        status: 403,
        quota_units: 0,
        request_origin: "demand",
      }),
    ]);
  });

  it("cache status 집계를 반환한다", async () => {
    const timestamp = Date.now();
    const db = makeYouTubeCacheDb({
      "videos:UC_MISSING:20": {
        key: "videos:UC_MISSING:20",
        type: "channel_videos",
        value: "null",
        fetched_at: 0,
        expires_at: 0,
        stale_until: 0,
        refresh_after: timestamp + 90_000,
        last_status: null,
        last_error: null,
      },
      "playlist:UC_A": {
        key: "playlist:UC_A",
        type: "uploads_playlist",
        value: JSON.stringify({ playlistId: "UU_A" }),
        fetched_at: timestamp,
        expires_at: timestamp + 60_000,
        stale_until: timestamp + 600_000,
        refresh_after: 0,
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
        refresh_after: 0,
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
        request_origin: "demand",
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
        request_origin: "manual",
      },
      {
        operation: "videos.list",
        channel_id: "UC_A",
        cache_key: "videos:UC_A:20",
        quota_units: 1,
        status: 200,
        duration_ms: 5,
        created_at: timestamp + 1,
        error: null,
        request_origin: "demand",
      },
    );

    const prepareSpy = vi.spyOn(db, "prepare");
    const status = await getYouTubeCacheStatus(db, 24, timestamp);

    expect(status.cache).toMatchObject({ total: 2, fresh: 1, stale: 1 });
    expect(status.usage).toMatchObject({
      apiCalls: 2,
      quotaUnits: 2,
      successCount: 1,
      failureCount: 1,
      quotaErrorCount: 1,
    });
    expect(status.window.until).toBe(timestamp);
    expect(status.channels.find((row) => row.cacheKey === "videos:UC_A:20"))
      .toMatchObject({ channelId: "UC_A", maxResults: 20, status: "stale" });
    expect(
      status.channels.find(
        (row) => row.cacheKey === "videos:UC_MISSING:20",
      ),
    ).toBeUndefined();
    const usageSql = prepareSpy.mock.calls
      .map(([sql]) => sql)
      .find((sql) => sql.includes("FROM youtube_api_usage_events"));
    expect(usageSql).toContain("GROUP BY operation, request_origin");
    expect(usageSql).toContain("created_at >= ? AND created_at <= ?");
    expect(usageSql).not.toContain("LIMIT 5000");
  });
});
