import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { YouTubeRefreshFailure } from "./youtube-api";
import { readYouTubeChannelsWithSWR } from "./youtube-cache-swr";

const fetchChannelMock = vi.hoisted(() => vi.fn());

vi.mock("./youtube-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./youtube-api")>();
  return {
    ...actual,
    fetchYouTubeVideosForChannel: fetchChannelMock,
  };
});

type CacheRow = {
  key: string;
  value: string;
  fetched_at: number;
  expires_at: number;
  stale_until: number;
  refresh_after: number;
  last_status: number | null;
  last_error: string | null;
};

const content = (videoId: string) => ({
  videos: [{ videoId }],
  shorts: [],
});

const makeRow = (
  key: string,
  overrides: Partial<CacheRow> = {},
): CacheRow => ({
  key,
  value: JSON.stringify(content(key)),
  fetched_at: Date.now() - 60_000,
  expires_at: Date.now() + 60_000,
  stale_until: Date.now() + 7 * 24 * 60 * 60_000,
  refresh_after: 0,
  last_status: 200,
  last_error: null,
  ...overrides,
});

const makeDb = (initial: CacheRow[] = []) => {
  const rows = new Map(initial.map((row) => [row.key, row]));
  const db = {
    prepare(sql: string) {
      const execute = (args: unknown[]) => ({
        async first<T>() {
          if (sql.includes("SELECT key, value")) {
            return (rows.get(String(args[0])) ?? null) as T | null;
          }
          if (sql.includes("INSERT INTO youtube_api_cache")) {
            const [keyValue, leaseUntil, timestamp] = args;
            const key = String(keyValue);
            const existing = rows.get(key);
            if (existing && existing.refresh_after > Number(timestamp)) {
              return null as T | null;
            }
            rows.set(
              key,
              existing ??
                makeRow(key, {
                  value: "null",
                  fetched_at: 0,
                  expires_at: 0,
                  stale_until: 0,
                  refresh_after: Number(leaseUntil),
                  last_status: null,
                }),
            );
            rows.get(key)!.refresh_after = Number(leaseUntil);
            return { key } as T;
          }
          if (
            sql.includes("UPDATE youtube_api_cache") &&
            sql.includes("RETURNING key")
          ) {
            const [leaseUntil, keyValue, timestamp] = args;
            const key = String(keyValue);
            const existing = rows.get(key);
            if (!existing || existing.refresh_after > Number(timestamp)) {
              return null as T | null;
            }
            existing.refresh_after = Number(leaseUntil);
            return { key } as T;
          }
          return null as T | null;
        },
        async run() {
          if (
            sql.includes("UPDATE youtube_api_cache") &&
            !sql.includes("RETURNING key")
          ) {
            const [refreshAfter, lastStatus, lastError, keyValue] = args;
            const row = rows.get(String(keyValue));
            if (row) {
              row.refresh_after = Number(refreshAfter);
              row.last_status = Number(lastStatus);
              row.last_error = String(lastError);
            }
          }
        },
      });
      return {
        bind: (...args: unknown[]) => execute(args),
        first: execute([]).first,
        run: execute([]).run,
      };
    },
  };
  return { db: db as unknown as D1Database, rows };
};

const makeContext = () => {
  const promises: Promise<unknown>[] = [];
  return {
    ctx: {
      waitUntil(promise: Promise<unknown>) {
        promises.push(promise);
      },
    } as ExecutionContext,
    promises,
  };
};

const telemetry = { write: vi.fn() };

describe("YouTube demand SWR", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T00:00:00Z"));
    fetchChannelMock.mockReset();
    telemetry.write.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("official 12시간과 kirinuki 6시간 fresh 경계 및 canonical 20/40 키를 사용한다", async () => {
    const timestamp = Date.now();
    const officialKey = "videos:UC_OFFICIAL:20";
    const kirinukiKey = "videos:UC_KIRINUKI:40";
    const { db, rows } = makeDb([
      makeRow(officialKey, {
        fetched_at: timestamp - 12 * 60 * 60_000,
        expires_at: timestamp,
      }),
      makeRow(kirinukiKey, {
        fetched_at: timestamp - 6 * 60 * 60_000,
        expires_at: timestamp,
      }),
    ]);

    const result = await readYouTubeChannelsWithSWR({
      db,
      apiKey: "key",
      targets: [
        { channelId: "UC_OFFICIAL", source: "official" },
        { channelId: "UC_KIRINUKI", source: "kirinuki" },
      ],
      telemetry,
    });

    expect(result.cache.state).toBe("fresh");
    expect(fetchChannelMock).not.toHaveBeenCalled();
    expect(Array.from(rows.keys()).sort()).toEqual(
      [kirinukiKey, officialKey].sort(),
    );
    expect(telemetry.write).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "youtube.cache.request",
        outcome: "served_non_blocking",
        targetCount: 1,
        availableCount: 1,
      }),
    );
  });

  it("stale 콘텐츠를 upstream 완료 전에 반환하고 waitUntil 대상은 최대 2개다", async () => {
    const timestamp = Date.now();
    const deferred: Array<(value: ReturnType<typeof content>) => void> = [];
    fetchChannelMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          deferred.push(resolve);
        }),
    );
    const rows = ["A", "B", "C"].map((id) =>
      makeRow(`videos:UC_${id}:20`, {
        expires_at: timestamp - 1,
        stale_until: timestamp + 7 * 24 * 60 * 60_000,
      }),
    );
    const { db } = makeDb(rows);
    const { ctx, promises } = makeContext();

    const result = await readYouTubeChannelsWithSWR({
      db,
      apiKey: "key",
      targets: ["A", "B", "C"].map((id) => ({
        channelId: `UC_${id}`,
        source: "official" as const,
      })),
      ctx,
      telemetry,
    });

    expect(result.byChannel).toHaveLength(3);
    expect(result.cache).toMatchObject({
      state: "refreshing",
      refreshScheduledCount: 2,
      pendingCount: 3,
      revalidateAfterMs: 15000,
    });
    expect(promises).toHaveLength(2);
    expect(fetchChannelMock).toHaveBeenCalledTimes(2);
    expect(telemetry.write).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "youtube.cache.request",
        outcome: "served_non_blocking",
        targetCount: 3,
        availableCount: 3,
      }),
    );

    deferred.forEach((resolve, index) => resolve(content(`new-${index}`)));
    await Promise.all(promises);
  });

  it("missing은 두 대상만 동기 갱신하고 나머지는 partial로 남긴다", async () => {
    fetchChannelMock.mockImplementation(async (channelId: string) =>
      content(`new-${channelId}`),
    );
    const { db } = makeDb();

    const result = await readYouTubeChannelsWithSWR({
      db,
      apiKey: "key",
      targets: ["A", "B", "C"].map((id) => ({
        channelId: `UC_${id}`,
        source: "official" as const,
      })),
      telemetry,
    });

    expect(fetchChannelMock).toHaveBeenCalledTimes(2);
    expect(result.byChannel.filter((item) => item.content)).toHaveLength(2);
    expect(result.cache).toMatchObject({
      state: "partial",
      pendingCount: 1,
      refreshScheduledCount: 0,
    });
    expect(telemetry.write).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "youtube.cache.request",
        outcome: "served_after_refresh",
        targetCount: 3,
        availableCount: 0,
      }),
    );
    expect(telemetry.write).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "youtube.cache.refresh",
        outcome: "baseline",
      }),
    );
  });

  it("Demand 변경률은 제목이나 조회수가 아닌 영상 ID 집합만 비교한다", async () => {
    const timestamp = Date.now();
    const key = "videos:UC_A:20";
    const { db } = makeDb([
      makeRow(key, {
        value: JSON.stringify({
          videos: [{ videoId: "stable", title: "old", viewCount: 1 }],
          shorts: [],
        }),
        expires_at: timestamp - 1,
        stale_until: timestamp + 60_000,
      }),
    ]);
    fetchChannelMock.mockResolvedValue({
      videos: [{ videoId: "stable", title: "new", viewCount: 999 }],
      shorts: [],
    });
    const { ctx, promises } = makeContext();

    await readYouTubeChannelsWithSWR({
      db,
      apiKey: "key",
      targets: [{ channelId: "UC_A", source: "official" }],
      ctx,
      telemetry,
    });
    await Promise.all(promises);

    expect(telemetry.write).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "youtube.cache.refresh",
        outcome: "unchanged",
      }),
    );
  });

  it("동시 stale 요청에서는 D1 lease 승자 하나만 갱신한다", async () => {
    fetchChannelMock.mockResolvedValue(content("new"));
    const timestamp = Date.now();
    const { db } = makeDb([
      makeRow("videos:UC_A:20", {
        expires_at: timestamp - 1,
        stale_until: timestamp + 60_000,
      }),
    ]);
    const first = makeContext();
    const second = makeContext();

    await Promise.all([
      readYouTubeChannelsWithSWR({
        db,
        apiKey: "key",
        targets: [{ channelId: "UC_A", source: "official" }],
        ctx: first.ctx,
        telemetry,
      }),
      readYouTubeChannelsWithSWR({
        db,
        apiKey: "key",
        targets: [{ channelId: "UC_A", source: "official" }],
        ctx: second.ctx,
        telemetry,
      }),
    ]);

    expect(first.promises.length + second.promises.length).toBe(1);
    await Promise.all([...first.promises, ...second.promises]);
    expect(fetchChannelMock).toHaveBeenCalledOnce();
  });

  it.each([
    [
      "429",
      { status: 429, error: "rate limited", retryAfterMs: 10 * 60_000, quotaRejected: false },
      10 * 60_000,
    ],
    [
      "quota admission",
      { status: 403, error: "youtube_quota_admission_denied", retryAfterMs: null, quotaRejected: true },
      6 * 60 * 60_000,
    ],
    [
      "5xx",
      { status: 503, error: "upstream", retryAfterMs: null, quotaRejected: false },
      5 * 60_000,
    ],
  ])("%s 실패 backoff를 refresh_after에 기록한다", async (_label, failure, expectedDelay) => {
    const timestamp = Date.now();
    fetchChannelMock.mockImplementation(
      async (
        _channelId: string,
        _apiKey: string,
        _maxResults: number,
        _db: D1Database,
        options: { onFailure?: (value: YouTubeRefreshFailure) => void },
      ) => {
        options.onFailure?.(failure);
        return null;
      },
    );
    const { db, rows } = makeDb();

    await readYouTubeChannelsWithSWR({
      db,
      apiKey: "key",
      targets: [{ channelId: "UC_A", source: "official" }],
      telemetry,
    });

    expect(rows.get("videos:UC_A:20")?.refresh_after).toBe(
      timestamp + Number(expectedDelay),
    );
  });
});
