import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import {
  getYouTubeWarmupStatus,
  runManualYouTubeCacheRefresh,
} from "./youtube-warmup";
import { YouTubeCacheRefreshInProgressError } from "../application/youtube-service";

type CacheContent = {
  videos: Array<{ videoId: string; title?: string }>;
  shorts: Array<{ videoId: string; title?: string }>;
};

type CacheRow = {
  key: string;
  type: "channel_videos";
  value: string;
  fetched_at: number;
  expires_at: number;
  stale_until: number;
  refresh_after: number;
  last_status: number | null;
  last_error: string | null;
};

type UsageEvent = {
  quota_units: number;
  created_at: number;
  request_origin: "demand" | "manual" | "scheduled" | "legacy_unknown";
};

type WarmupRunRow = {
  id: number;
  source: "scheduled" | "manual";
  status: "success" | "skipped" | "partial" | "failed";
  target_count: number;
  skipped_fresh_count: number;
  refreshed_count: number;
  failed_count: number;
  stale_fallback_count: number;
  baseline_count: number;
  changed_count: number;
  unchanged_count: number;
  api_calls: number;
  quota_units: number;
  duration_ms: number;
  started_at: number;
  finished_at: number;
  error: string | null;
};

type RefreshFailure = {
  status: number;
  error: string;
  retryAfterMs: number | null;
  quotaRejected: boolean;
};

type RefreshOptions = {
  forceRefresh: boolean;
  quotaPriority: "critical";
  requestOrigin: "manual";
  freshTtlMs: number;
  staleTtlMs: number;
  signal: AbortSignal;
  onFailure: (failure: RefreshFailure) => void;
};

const fetchYouTubeVideosForChannelMock = vi.hoisted(() => vi.fn());

vi.mock("./youtube-api", () => ({
  fetchYouTubeVideosForChannel: fetchYouTubeVideosForChannelMock,
  getYouTubeVideosCacheKey: (channelId: string, maxResults: number) =>
    `videos:${channelId}:${maxResults}`,
}));

const makeCacheRow = (
  key: string,
  content: CacheContent,
  overrides: Partial<CacheRow> = {},
): CacheRow => ({
  key,
  type: "channel_videos",
  value: JSON.stringify(content),
  fetched_at: Date.now() - 60_000,
  expires_at: Date.now() + 60_000,
  stale_until: Date.now() + 7 * 24 * 60 * 60_000,
  refresh_after: 0,
  last_status: 200,
  last_error: null,
  ...overrides,
});

const makeWarmupDb = () => {
  const state = {
    settings: new Map<string, string | null>(),
    members: [] as string[],
    kirinuki: [] as string[],
    cache: new Map<string, CacheRow>(),
    usageEvents: [] as UsageEvent[],
    quotaLedgerUsed: 0,
    quotaLedgerLimit: 1_000,
    runs: [] as WarmupRunRow[],
    leaseClaims: [] as Array<{ key: string; value: string; at: number }>,
  };

  const db = {
    prepare(sql: string) {
      const execute = (args: unknown[]) => ({
        async first<T>() {
          if (
            sql.includes("INSERT INTO settings") &&
            sql.includes("RETURNING value")
          ) {
            const [keyValue, leaseValue, updatedAt, threshold] = args;
            const key = String(keyValue);
            const existing = state.settings.get(key);
            if (existing !== undefined && Number(existing) > Number(threshold)) {
              return null as T | null;
            }
            state.settings.set(key, String(leaseValue));
            state.leaseClaims.push({
              key,
              value: String(leaseValue),
              at: Number(updatedAt),
            });
            return { value: String(leaseValue) } as T;
          }
          if (
            sql.includes("INSERT INTO youtube_api_cache") &&
            sql.includes("RETURNING key")
          ) {
            const [keyValue, leaseUntil, threshold] = args;
            const key = String(keyValue);
            const existing = state.cache.get(key);
            if (existing && existing.refresh_after > Number(threshold)) {
              return null as T | null;
            }
            if (existing) {
              existing.refresh_after = Number(leaseUntil);
            } else {
              state.cache.set(key, {
                key,
                type: "channel_videos",
                value: "null",
                fetched_at: 0,
                expires_at: 0,
                stale_until: 0,
                refresh_after: Number(leaseUntil),
                last_status: null,
                last_error: null,
              });
            }
            return { key } as T;
          }
          if (sql.includes("SELECT value FROM settings")) {
            const key = String(args[0]);
            if (!state.settings.has(key)) return null as T | null;
            return { value: state.settings.get(key) ?? null } as T;
          }
          if (
            sql.includes("FROM youtube_api_cache") &&
            sql.includes("WHERE key = ?")
          ) {
            const key = String(args[0]);
            return (state.cache.get(key) ?? null) as T | null;
          }
          if (sql.includes("FROM youtube_api_usage_events")) {
            const since = Number(args[0] ?? 0);
            const events = state.usageEvents.filter(
              (event) =>
                event.created_at >= since &&
                (!sql.includes("request_origin = 'manual'") ||
                  event.request_origin === "manual"),
            );
            return {
              apiCalls: events.filter((event) => event.quota_units > 0).length,
              quotaUnits: events.reduce(
                (sum, event) => sum + event.quota_units,
                0,
              ),
            } as T;
          }
          if (sql.includes("FROM scheduled_usage_daily")) {
            return {
              used: state.quotaLedgerUsed,
              limitValue: state.quotaLedgerLimit,
            } as T;
          }
          return null as T | null;
        },
        async all<T>() {
          if (sql.includes("FROM members")) {
            return {
              results: state.members.map((channelId) => ({ channelId })) as T[],
            };
          }
          if (sql.includes("FROM kirinuki_channels")) {
            return {
              results: state.kirinuki.map((channelId) => ({ channelId })) as T[],
            };
          }
          if (sql.includes("FROM youtube_api_cache")) {
            return { results: Array.from(state.cache.values()) as T[] };
          }
          if (sql.includes("FROM youtube_warmup_runs")) {
            const since = Number(args[0] ?? 0);
            const limit = Number(args[1] ?? 20);
            return {
              results: state.runs
                .filter((run) => run.started_at >= since)
                .sort((left, right) => right.started_at - left.started_at)
                .slice(0, limit) as T[],
            };
          }
          return { results: [] as T[] };
        },
        async run() {
          if (sql.includes("UPDATE settings SET value = '0'")) {
            const [, keyValue, expectedLease] = args;
            const key = String(keyValue);
            if (state.settings.get(key) === String(expectedLease)) {
              state.settings.set(key, "0");
            }
            return { meta: {} };
          }
          if (sql.includes("UPDATE youtube_api_cache")) {
            const [refreshAfter, lastStatus, lastError, keyValue] = args;
            const row = state.cache.get(String(keyValue));
            if (row) {
              row.refresh_after = Number(refreshAfter);
              row.last_status = Number(lastStatus);
              row.last_error = String(lastError);
            }
            return { meta: {} };
          }
          if (sql.includes("INSERT INTO youtube_warmup_runs")) {
            const [
              source,
              status,
              targetCount,
              skippedFreshCount,
              refreshedCount,
              failedCount,
              staleFallbackCount,
              baselineCount,
              changedCount,
              unchangedCount,
              apiCalls,
              quotaUnits,
              durationMs,
              startedAt,
              finishedAt,
              error,
            ] = args;
            const id = state.runs.length + 1;
            state.runs.push({
              id,
              source: source as WarmupRunRow["source"],
              status: status as WarmupRunRow["status"],
              target_count: Number(targetCount),
              skipped_fresh_count: Number(skippedFreshCount),
              refreshed_count: Number(refreshedCount),
              failed_count: Number(failedCount),
              stale_fallback_count: Number(staleFallbackCount),
              baseline_count: Number(baselineCount),
              changed_count: Number(changedCount),
              unchanged_count: Number(unchangedCount),
              api_calls: Number(apiCalls),
              quota_units: Number(quotaUnits),
              duration_ms: Number(durationMs),
              started_at: Number(startedAt),
              finished_at: Number(finishedAt),
              error: error === null ? null : String(error),
            });
            return { meta: { last_row_id: id } };
          }
          return { meta: {} };
        },
      });

      return {
        bind: (...args: unknown[]) => execute(args),
        first: execute([]).first,
        all: execute([]).all,
        run: execute([]).run,
      };
    },
    state,
  };

  return db as typeof db & Pick<D1Database, "prepare">;
};

const makeEnv = (
  db: Pick<D1Database, "prepare">,
  analytics?: AnalyticsEngineDataset,
): Env =>
  ({
    YOUTUBE_API_KEY: "youtube-key",
    X_BEARER_TOKEN: "x-token",
    otw_db: db as D1Database,
    YOUTUBE_CACHE_ANALYTICS: analytics,
  }) as Env;

const makeFailure = (
  overrides: Partial<RefreshFailure> = {},
): RefreshFailure => ({
  status: 500,
  error: "upstream_failed",
  retryAfterMs: null,
  quotaRejected: false,
  ...overrides,
});

describe("YouTube demand cache manual refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-09T00:00:00Z"));
    fetchYouTubeVideosForChannelMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("공식 20개와 키리누키 40개 canonical 키를 강제 갱신하고 영상 ID 집합만으로 변경을 판정한다", async () => {
    const db = makeWarmupDb();
    const analyticsPoints: Array<{ blobs?: string[] }> = [];
    const analytics = {
      writeDataPoint(point: unknown) {
        analyticsPoints.push(point as { blobs?: string[] });
      },
    } as AnalyticsEngineDataset;
    db.state.members.push("UC_BASELINE", "UC_UNCHANGED");
    db.state.kirinuki.push("UC_CHANGED");
    db.state.settings.set("youtube_warmup_last_run", "legacy-last-run");
    db.state.cache.set(
      "videos:UC_UNCHANGED:20",
      makeCacheRow("videos:UC_UNCHANGED:20", {
        videos: [
          { videoId: "same-a", title: "old title" },
          { videoId: "same-b" },
        ],
        shorts: [],
      }),
    );
    db.state.cache.set(
      "videos:UC_CHANGED:40",
      makeCacheRow("videos:UC_CHANGED:40", {
        videos: [{ videoId: "old-id" }],
        shorts: [],
      }),
    );
    fetchYouTubeVideosForChannelMock.mockImplementation(
      async (channelId: string) => {
        if (channelId === "UC_BASELINE") {
          return { videos: [{ videoId: "first-id" }], shorts: [] };
        }
        if (channelId === "UC_UNCHANGED") {
          return {
            videos: [
              { videoId: "same-b", title: "new metadata" },
              { videoId: "same-a", title: "changed title" },
            ],
            shorts: [],
          };
        }
        return { videos: [{ videoId: "new-id" }], shorts: [] };
      },
    );
    db.state.usageEvents.push(
      {
        quota_units: 7,
        created_at: Date.now(),
        request_origin: "demand",
      },
      {
        quota_units: 3,
        created_at: Date.now(),
        request_origin: "manual",
      },
    );

    const result = await runManualYouTubeCacheRefresh(makeEnv(db, analytics));

    expect(result).toMatchObject({
      id: 1,
      source: "manual",
      status: "success",
      targetCount: 3,
      refreshedCount: 3,
      baselineCount: 1,
      changedCount: 1,
      unchangedCount: 1,
      apiCalls: 1,
      quotaUnits: 3,
    });
    expect(
      fetchYouTubeVideosForChannelMock.mock.calls.map(
        ([channelId, , maxResults]) => [channelId, maxResults],
      ),
    ).toEqual(
      expect.arrayContaining([
        ["UC_BASELINE", 20],
        ["UC_UNCHANGED", 20],
        ["UC_CHANGED", 40],
      ]),
    );
    for (const call of fetchYouTubeVideosForChannelMock.mock.calls) {
      expect(call[4]).toMatchObject({
        forceRefresh: true,
        quotaPriority: "critical",
        requestOrigin: "manual",
      });
    }
    expect(db.state.cache.has("videos:UC_BASELINE:20")).toBe(true);
    expect(db.state.cache.has("videos:UC_CHANGED:40")).toBe(true);
    expect(db.state.runs[0]).toMatchObject({
      baseline_count: 1,
      changed_count: 1,
      unchanged_count: 1,
    });
    expect(db.state.settings.get("youtube_warmup_last_run")).toBe(
      "legacy-last-run",
    );
    expect(analyticsPoints.map((point) => point.blobs?.[4])).toEqual(
      expect.arrayContaining(["baseline", "changed", "unchanged"]),
    );
    expect(db.state.runs[0]).toMatchObject({ api_calls: 1, quota_units: 3 });
  });

  it("5분 전역 lease가 살아 있으면 동시 수동 실행을 409용 오류로 거부한다", async () => {
    const db = makeWarmupDb();
    db.state.members.push("UC_A");
    let resolveRefresh: ((content: CacheContent) => void) | undefined;
    let markRefreshStarted: (() => void) | undefined;
    const refreshStarted = new Promise<void>((resolve) => {
      markRefreshStarted = resolve;
    });
    fetchYouTubeVideosForChannelMock.mockImplementation(
      () =>
        new Promise<CacheContent>((resolve) => {
          resolveRefresh = resolve;
          markRefreshStarted?.();
        }),
    );

    const firstRun = runManualYouTubeCacheRefresh(makeEnv(db));
    await refreshStarted;

    await expect(runManualYouTubeCacheRefresh(makeEnv(db))).rejects.toBeInstanceOf(
      YouTubeCacheRefreshInProgressError,
    );
    await expect(runManualYouTubeCacheRefresh(makeEnv(db))).rejects.toThrow(
      "youtube_cache_refresh_in_progress",
    );
    expect(db.state.leaseClaims[0]).toMatchObject({
      key: "youtube_cache_manual_refresh_lease_until",
      at: Date.now(),
      value: String(Date.now() + 5 * 60_000),
    });

    resolveRefresh?.({ videos: [{ videoId: "v1" }], shorts: [] });
    await expect(firstRun).resolves.toMatchObject({ status: "success" });
    expect(
      db.state.settings.get("youtube_cache_manual_refresh_lease_until"),
    ).toBe("0");
  });

  it("일부 갱신 실패는 stale fallback을 보존하고 partial로 기록한다", async () => {
    const db = makeWarmupDb();
    db.state.members.push("UC_OK");
    db.state.kirinuki.push("UC_STALE");
    const staleContent = {
      videos: [{ videoId: "old-id" }],
      shorts: [],
    };
    db.state.cache.set(
      "videos:UC_STALE:40",
      makeCacheRow("videos:UC_STALE:40", staleContent, {
        expires_at: Date.now() - 1,
      }),
    );
    fetchYouTubeVideosForChannelMock.mockImplementation(
      async (channelId: string, ...args: unknown[]) => {
        if (channelId === "UC_OK") {
          return { videos: [{ videoId: "fresh-id" }], shorts: [] };
        }
        const options = args[3] as RefreshOptions;
        options.onFailure(makeFailure());
        return staleContent;
      },
    );

    const result = await runManualYouTubeCacheRefresh(makeEnv(db));

    expect(result).toMatchObject({
      status: "partial",
      refreshedCount: 1,
      failedCount: 1,
      staleFallbackCount: 1,
      baselineCount: 1,
      error: null,
    });
  });

  it("모든 대상이 quota admission에서 거절되면 호출 결과를 skipped로 기록한다", async () => {
    const db = makeWarmupDb();
    db.state.members.push("UC_A");
    db.state.kirinuki.push("UC_K");
    fetchYouTubeVideosForChannelMock.mockImplementation(
      async (...args: unknown[]) => {
        const options = args[4] as RefreshOptions;
        options.onFailure(
          makeFailure({
            status: 403,
            error: "daily_quota_limit_reached",
            quotaRejected: true,
          }),
        );
        db.state.usageEvents.push({
          quota_units: 0,
          created_at: Date.now(),
          request_origin: "manual",
        });
        return null;
      },
    );

    const result = await runManualYouTubeCacheRefresh(makeEnv(db));

    expect(result).toMatchObject({
      status: "skipped",
      targetCount: 2,
      refreshedCount: 0,
      failedCount: 2,
      apiCalls: 0,
      quotaUnits: 0,
      error: "daily_quota_limit_reached",
    });
  });

  it("상태 조회는 canonical quota를 우선하고 legacy quota를 fallback으로 사용한다", async () => {
    const canonicalDb = makeWarmupDb();
    canonicalDb.state.settings.set("youtube_api_daily_quota_units", "250");
    canonicalDb.state.settings.set("youtube_warmup_daily_quota_units", "999");
    canonicalDb.state.settings.set("youtube_warmup_last_run", "123456");
    canonicalDb.state.members.push("UC_A");
    canonicalDb.state.kirinuki.push("UC_K");
    canonicalDb.state.cache.set(
      "videos:UC_A:20",
      makeCacheRow("videos:UC_A:20", { videos: [], shorts: [] }),
    );
    canonicalDb.state.usageEvents.push({
      quota_units: 99,
      created_at: Date.now(),
      request_origin: "demand",
    });
    canonicalDb.state.quotaLedgerUsed = 3;
    canonicalDb.state.quotaLedgerLimit = 250;

    const canonicalStatus = await getYouTubeWarmupStatus(canonicalDb, 24);

    expect(canonicalStatus.settings).toMatchObject({
      enabled: false,
      intervalHours: 0,
      dailyQuotaUnits: 250,
      officialEnabled: true,
      kirinukiEnabled: true,
      lastRun: null,
    });
    expect(canonicalStatus.targets).toEqual({
      total: 2,
      official: 1,
      kirinuki: 1,
      fresh: 1,
      stale: 0,
      expired: 0,
      missing: 1,
    });
    expect(canonicalStatus.quota).toMatchObject({
      limit: 250,
      used: 3,
      remaining: 247,
    });

    const fallbackDb = makeWarmupDb();
    fallbackDb.state.settings.set("youtube_warmup_daily_quota_units", "333");

    const fallbackStatus = await getYouTubeWarmupStatus(fallbackDb, 24);

    expect(fallbackStatus.settings.dailyQuotaUnits).toBe(333);
  });
});
