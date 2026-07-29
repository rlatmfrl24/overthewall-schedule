import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getYouTubeWarmupStatus,
  runYouTubeWarmup,
} from "./youtube-warmup";
import type { Env } from "../../../platform/types";

type CacheRow = {
  key: string;
  type: "channel_videos";
  value: string;
  fetched_at: number;
  expires_at: number;
  stale_until: number;
  last_status: number | null;
  last_error: string | null;
};
type UsageEvent = {
  quota_units: number;
  created_at: number;
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
  api_calls: number;
  quota_units: number;
  duration_ms: number;
  started_at: number;
  finished_at: number;
  error: string | null;
};

const fetchYouTubeVideosForChannelMock = vi.hoisted(() => vi.fn());

vi.mock("./youtube-api", () => ({
  fetchYouTubeVideosForChannel: fetchYouTubeVideosForChannelMock,
}));

const makeWarmupDb = () => {
  const state = {
    settings: new Map<string, string | null>(),
    members: [] as string[],
    kirinuki: [] as string[],
    cache: new Map<string, CacheRow>(),
    usageEvents: [] as UsageEvent[],
    runs: [] as WarmupRunRow[],
  };

  const db = {
    prepare(sql: string) {
      const execute = (args: unknown[]) => ({
        async first<T>() {
          if (sql.includes("FROM youtube_api_cache")) {
            const key = String(args[0]);
            return (state.cache.get(key) ?? null) as T | null;
          }
          if (sql.includes("FROM youtube_api_usage_events")) {
            const since = Number(args[0] ?? 0);
            const events = state.usageEvents.filter(
              (event) => event.created_at >= since,
            );
            return {
              apiCalls: events.length,
              quotaUnits: events.reduce(
                (sum, event) => sum + event.quota_units,
                0,
              ),
            } as T;
          }
          return null as T | null;
        },
        async all<T>() {
          if (sql.includes("FROM settings")) {
            return {
              results: args
                .map((key) => ({
                  key: String(key),
                  value: state.settings.get(String(key)) ?? null,
                }))
                .filter((row) => state.settings.has(row.key)) as T[],
            };
          }
          if (sql.includes("FROM members")) {
            return {
              results: state.members.map((channelId) => ({
                channelId,
              })) as T[],
            };
          }
          if (sql.includes("FROM kirinuki_channels")) {
            return {
              results: state.kirinuki.map((channelId) => ({
                channelId,
              })) as T[],
            };
          }
          if (sql.includes("FROM youtube_warmup_runs")) {
            const since = Number(args[0] ?? 0);
            const limit = Number(args[1] ?? 20);
            return {
              results: state.runs
                .filter((run) => run.started_at >= since)
                .sort((a, b) => b.started_at - a.started_at)
                .slice(0, limit) as T[],
            };
          }
          return { results: [] as T[] };
        },
        async run() {
          if (sql.includes("INSERT INTO settings")) {
            const [key, value] = args;
            state.settings.set(String(key), String(value));
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

const makeEnv = (db: Pick<D1Database, "prepare">): Env =>
  ({
    YOUTUBE_API_KEY: "youtube-key",
    X_BEARER_TOKEN: "x-token",
    otw_db: db as D1Database,
  }) as Env;

describe("YouTube warmup service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-09T00:00:00Z"));
    fetchYouTubeVideosForChannelMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("설정이 비활성화되어 있으면 이력을 남기지 않고 건너뛴다", async () => {
    const db = makeWarmupDb();
    db.state.settings.set("youtube_warmup_enabled", "false");

    const result = await runYouTubeWarmup(makeEnv(db), "scheduled");

    expect(result).toMatchObject({
      id: null,
      status: "skipped",
      error: "youtube_warmup_disabled",
    });
    expect(fetchYouTubeVideosForChannelMock).not.toHaveBeenCalled();
    expect(db.state.runs).toEqual([]);
  });

  it("D1 fresh cache 대상은 외부 API를 호출하지 않고 skippedFresh로 집계한다", async () => {
    const timestamp = Date.now();
    const db = makeWarmupDb();
    db.state.members.push("UC_A");
    db.state.cache.set("videos:UC_A:20", {
      key: "videos:UC_A:20",
      type: "channel_videos",
      value: JSON.stringify({ videos: [], shorts: [] }),
      fetched_at: timestamp,
      expires_at: timestamp + 5 * 60_000,
      stale_until: timestamp + 60 * 60_000,
      last_status: 200,
      last_error: null,
    });

    const result = await runYouTubeWarmup(makeEnv(db), "manual");

    expect(result).toMatchObject({
      status: "success",
      targetCount: 1,
      skippedFreshCount: 1,
      refreshedCount: 0,
    });
    expect(fetchYouTubeVideosForChannelMock).not.toHaveBeenCalled();
  });

  it("만료된 캐시는 API 성공 후 refreshed로 집계하고 실행 이력을 저장한다", async () => {
    const timestamp = Date.now();
    const db = makeWarmupDb();
    db.state.members.push("UC_A");
    db.state.cache.set("videos:UC_A:20", {
      key: "videos:UC_A:20",
      type: "channel_videos",
      value: JSON.stringify({ videos: [], shorts: [] }),
      fetched_at: timestamp - 10 * 60_000,
      expires_at: timestamp - 60_000,
      stale_until: timestamp + 60 * 60_000,
      last_status: 200,
      last_error: null,
    });
    fetchYouTubeVideosForChannelMock.mockImplementation(async () => {
      db.state.usageEvents.push(
        { quota_units: 1, created_at: Date.now() },
        { quota_units: 1, created_at: Date.now() },
        { quota_units: 1, created_at: Date.now() },
      );
      db.state.cache.set("videos:UC_A:20", {
        key: "videos:UC_A:20",
        type: "channel_videos",
        value: JSON.stringify({ videos: [{ videoId: "v1" }], shorts: [] }),
        fetched_at: Date.now(),
        expires_at: Date.now() + 5 * 60_000,
        stale_until: Date.now() + 60 * 60_000,
        last_status: 200,
        last_error: null,
      });
      return { videos: [{ videoId: "v1" }], shorts: [] };
    });

    const result = await runYouTubeWarmup(makeEnv(db), "manual");

    expect(result).toMatchObject({
      id: 1,
      status: "success",
      refreshedCount: 1,
      apiCalls: 3,
      quotaUnits: 3,
    });
    expect(db.state.runs).toHaveLength(1);
    expect(db.state.settings.get("youtube_warmup_last_run")).toBe(
      String(result.finishedAt),
    );
  });

  it("API가 stale fallback을 반환하면 staleFallback으로 집계한다", async () => {
    const timestamp = Date.now();
    const db = makeWarmupDb();
    db.state.members.push("UC_A");
    db.state.cache.set("videos:UC_A:20", {
      key: "videos:UC_A:20",
      type: "channel_videos",
      value: JSON.stringify({ videos: [{ videoId: "old" }], shorts: [] }),
      fetched_at: timestamp - 10 * 60_000,
      expires_at: timestamp - 60_000,
      stale_until: timestamp + 60 * 60_000,
      last_status: 403,
      last_error: "quotaExceeded",
    });
    fetchYouTubeVideosForChannelMock.mockResolvedValue({
      videos: [{ videoId: "old" }],
      shorts: [],
    });

    const result = await runYouTubeWarmup(makeEnv(db), "manual");

    expect(result).toMatchObject({
      status: "success",
      refreshedCount: 0,
      staleFallbackCount: 1,
      failedCount: 0,
    });
  });

  it("최근 쿼터 사용량이 상한 이상이면 API 호출 없이 건너뛴다", async () => {
    const db = makeWarmupDb();
    db.state.settings.set("youtube_warmup_daily_quota_units", "1");
    db.state.members.push("UC_A");
    db.state.usageEvents.push({ quota_units: 1, created_at: Date.now() });

    const result = await runYouTubeWarmup(makeEnv(db), "manual");

    expect(result).toMatchObject({
      status: "skipped",
      targetCount: 1,
      error: "daily_quota_limit_reached",
    });
    expect(fetchYouTubeVideosForChannelMock).not.toHaveBeenCalled();
  });

  it("상태 조회는 설정, 대상 수, 쿼터, 최근 실행을 반환한다", async () => {
    const db = makeWarmupDb();
    db.state.members.push("UC_A");
    db.state.kirinuki.push("UC_K");
    db.state.usageEvents.push({ quota_units: 3, created_at: Date.now() });
    db.state.runs.push({
      id: 1,
      source: "manual",
      status: "success",
      target_count: 2,
      skipped_fresh_count: 0,
      refreshed_count: 2,
      failed_count: 0,
      stale_fallback_count: 0,
      api_calls: 6,
      quota_units: 6,
      duration_ms: 10,
      started_at: Date.now(),
      finished_at: Date.now() + 10,
      error: null,
    });

    const status = await getYouTubeWarmupStatus(db, 24);

    expect(status.settings.enabled).toBe(true);
    expect(status.targets).toEqual({ total: 2, official: 1, kirinuki: 1 });
    expect(status.quota.used).toBe(3);
    expect(status.latestRun?.id).toBe(1);
  });
});
