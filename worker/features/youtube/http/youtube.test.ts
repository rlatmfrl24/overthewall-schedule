import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  YouTubeCacheRefreshRunSummaryDto,
  YouTubePublicCacheMetadataDto,
  YouTubeVideoDto,
} from "@contracts/youtube";
import type { Env } from "../../../platform/types";
import {
  createYouTubeApplication,
  createYouTubeHandler,
  type YouTubeApplicationPorts,
  YouTubeCacheRefreshInProgressError,
} from "../index";

type AdminResult =
  | { ok: true; user: { id: string } }
  | { ok: false; response: Response };

const requireAdminUserMock = vi.hoisted(() =>
  vi.fn(async (): Promise<AdminResult> => ({
    ok: true,
    user: { id: "admin" },
  })),
);

vi.mock("../../../platform/auth", () => ({
  requireAdminUser: requireAdminUserMock,
}));

const youtubeChannelA = `UC${"A".repeat(22)}`;
const youtubeChannelB = `UC${"B".repeat(22)}`;

const makeVideo = (
  channelId: string,
  publishedAt = "2026-07-09T12:00:00Z",
): YouTubeVideoDto => ({
  videoId: `${channelId}-video`,
  title: "Video",
  publishedAt,
  thumbnailUrl: "",
  duration: 120,
  viewCount: 0,
  channelId,
  channelTitle: channelId,
  isShort: false,
});

const makeCache = (
  state: YouTubePublicCacheMetadataDto["state"],
  overrides: Partial<YouTubePublicCacheMetadataDto> = {},
): YouTubePublicCacheMetadataDto => ({
  state,
  oldestFetchedAt: "2026-07-09T00:00:00.000Z",
  refreshScheduledCount: 0,
  pendingCount: state === "fresh" ? 0 : 1,
  revalidateAfterMs: state === "fresh" ? null : 15000,
  ...overrides,
});

const manualRefreshResult: YouTubeCacheRefreshRunSummaryDto = {
  id: 17,
  source: "manual",
  status: "success",
  targetCount: 2,
  skippedFreshCount: 0,
  refreshedCount: 2,
  failedCount: 0,
  staleFallbackCount: 0,
  baselineCount: 2,
  changedCount: 1,
  unchangedCount: 1,
  apiCalls: 6,
  quotaUnits: 6,
  durationMs: 1200,
  startedAt: 1_000,
  finishedAt: 2_200,
  error: null,
};

const makeExecutionContext = () =>
  ({
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  }) as unknown as ExecutionContext;

const createHarness = () => {
  const emptyBatch: Awaited<
    ReturnType<YouTubeApplicationPorts["readChannelsWithSWR"]>
  > = {
    byChannel: [],
    cache: makeCache("empty", {
      oldestFetchedAt: null,
      pendingCount: 0,
      revalidateAfterMs: null,
    }),
  };
  const readChannelsWithSWR = vi.fn(async () => emptyBatch);
  const readCacheTargets = vi.fn(async () => []);
  const makeAnalytics = (windowHours = 24) => ({
    status: "available" as const,
    generatedAt: "2026-07-09T00:00:00.000Z",
    windowHours,
    observedSince: "2026-07-08T00:00:00.000Z",
    coverageHours: Math.min(windowHours, 24),
    schemaVersion: "v2" as const,
    sampled: true as const,
    summary: {
      requestCount: 10,
      nonBlockingServeCount: 8,
      requestedTargetCount: 20,
      immediateAvailableCount: 18,
      refreshCount: 9,
      baselineCount: 1,
      changedCount: 2,
      unchangedCount: 6,
    },
    bySource: [],
    byOrigin: [],
    reasonCode: null,
  });
  const readCacheAnalytics = vi.fn(async (windowHours = 24) =>
    makeAnalytics(windowHours),
  );
  const readCacheStatus = vi.fn(async (windowHours = 24, usageEndAt = 2) => ({
    updatedAt: "2026-07-09T00:00:00.000Z",
    window: { hours: windowHours, since: 1, until: usageEndAt },
    cache: { total: 0, fresh: 0, stale: 0, expired: 0, byType: [] },
    usage: {
      apiCalls: 14,
      quotaUnits: 14,
      successCount: 14,
      failureCount: 0,
      rateLimitCount: 0,
      quotaErrorCount: 0,
      byOperation: [],
      byOrigin: [
        { origin: "demand" as const, apiCalls: 3, quotaUnits: 3, failureCount: 0 },
        { origin: "manual" as const, apiCalls: 2, quotaUnits: 2, failureCount: 0 },
        { origin: "scheduled" as const, apiCalls: 9, quotaUnits: 9, failureCount: 0 },
      ],
    },
    channels: [],
    analytics: makeAnalytics(windowHours),
    effectiveness: {
      requestCount: 0,
      nonBlockingServeCount: 0,
      nonBlockingServeRate: null,
      externalApiCalls: 14,
      activeQuotaUnits: 14,
      baselineCount: 0,
      changedCount: 0,
      unchangedCount: 0,
      changeRate: null,
      quotaPerChange: null,
    },
    targetStates: {
      official: { total: 0, fresh: 0, stale: 0, expired: 0, missing: 0 },
      kirinuki: { total: 0, fresh: 0, stale: 0, expired: 0, missing: 0 },
    },
    legacyScheduledRuns: [],
  }));
  const readWarmupStatus = vi.fn(async () => ({
    settings: {
      enabled: false,
      intervalHours: 0,
      dailyQuotaUnits: 1000,
      officialEnabled: true,
      kirinukiEnabled: true,
      lastRun: null,
    },
    quota: {
      limit: 1000,
      used: 0,
      remaining: 1000,
      windowHours: 24,
      since: 1,
    },
    targets: {
      total: 0,
      official: 0,
      kirinuki: 0,
      fresh: 0,
      stale: 0,
      expired: 0,
      missing: 0,
    },
    latestRun: null,
    recentRuns: [],
  }));
  const runCacheRefresh = vi.fn(async () => manualRefreshResult);
  const writeWarmupAudit = vi.fn(async () => undefined);
  const ports = {
    isApiConfigured: () => true,
    readAllowedChannelIds: vi.fn(
      async () => new Set([youtubeChannelA, youtubeChannelB]),
    ),
    readChannelsWithSWR,
    readCacheTargets,
    readCacheStatus,
    readCacheAnalytics,
    readWarmupStatus,
    runCacheRefresh,
    writeWarmupAudit,
    listKirinukiChannels: vi.fn(async () => []),
    createKirinukiChannel: vi.fn(async () => true),
    updateKirinukiChannel: vi.fn(async () => true),
    deleteKirinukiChannel: vi.fn(async () => true),
  } as unknown as YouTubeApplicationPorts;
  const application = createYouTubeApplication(ports);

  return {
    handleYouTube: createYouTubeHandler(() => application),
    ports,
    readChannelsWithSWR,
    readCacheTargets,
    readCacheStatus,
    readCacheAnalytics,
    readWarmupStatus,
    runCacheRefresh,
    writeWarmupAudit,
  };
};

const makeEnv = (): Env =>
  ({
    YOUTUBE_API_KEY: "youtube-key",
  }) as Env;

describe("youtube worker route", () => {
  beforeEach(() => {
    requireAdminUserMock.mockReset();
    requireAdminUserMock.mockResolvedValue({
      ok: true,
      user: { id: "admin" },
    });
  });

  it("fresh 공개 응답은 cache metadata와 public cache header를 반환하고 ExecutionContext를 전달한다", async () => {
    const { handleYouTube, readChannelsWithSWR } = createHarness();
    const cache = makeCache("fresh");
    readChannelsWithSWR.mockResolvedValueOnce({
      byChannel: [
        {
          channelId: youtubeChannelA,
          source: "official",
          content: {
            videos: [makeVideo(youtubeChannelA, "2026-07-08T12:00:00Z")],
            shorts: [],
          },
        },
        {
          channelId: youtubeChannelB,
          source: "official",
          content: {
            videos: [makeVideo(youtubeChannelB, "2026-07-09T12:00:00Z")],
            shorts: [],
          },
        },
      ],
      cache,
    });
    const ctx = makeExecutionContext();

    const response = await handleYouTube(
      new Request(
        `https://example.com/api/youtube/videos?channelIds=${youtubeChannelA},${youtubeChannelB}&maxResults=5`,
      ),
      makeEnv(),
      ctx,
    );
    const body = (await response.json()) as {
      videos: Array<{ videoId: string }>;
      shorts: unknown[];
      cache: YouTubePublicCacheMetadataDto;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("public");
    expect(body.videos.map((video) => video.videoId)).toEqual([
      `${youtubeChannelB}-video`,
      `${youtubeChannelA}-video`,
    ]);
    expect(body.shorts).toEqual([]);
    expect(body.cache).toEqual(cache);
    expect(readChannelsWithSWR).toHaveBeenCalledWith(
      [
        { channelId: youtubeChannelA, source: "official" },
        { channelId: youtubeChannelB, source: "official" },
      ],
      ctx,
    );
  });

  it("API 키가 없어도 fresh D1 cache를 반환한다", async () => {
    const { handleYouTube, readChannelsWithSWR } = createHarness();
    readChannelsWithSWR.mockResolvedValueOnce({
      byChannel: [{
        channelId: youtubeChannelA,
        source: "official",
        content: { videos: [makeVideo(youtubeChannelA)], shorts: [] },
      }],
      cache: makeCache("fresh"),
    });

    const response = await handleYouTube(
      new Request(
        `https://example.com/api/youtube/videos?channelIds=${youtubeChannelA}`,
      ),
      { YOUTUBE_API_KEY: "" } as Env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("public");
    expect(readChannelsWithSWR).toHaveBeenCalledOnce();
  });

  it("일부 채널만 사용 가능하면 200 partial과 no-store를 반환한다", async () => {
    const { handleYouTube, readChannelsWithSWR } = createHarness();
    const cache = makeCache("partial", {
      refreshScheduledCount: 1,
      pendingCount: 1,
    });
    readChannelsWithSWR.mockResolvedValueOnce({
      byChannel: [
        {
          channelId: youtubeChannelA,
          source: "official",
          content: { videos: [makeVideo(youtubeChannelA)], shorts: [] },
        },
        {
          channelId: youtubeChannelB,
          source: "official",
          content: null,
        },
      ],
      cache,
    });

    const response = await handleYouTube(
      new Request(
        `https://example.com/api/youtube/videos?channelIds=${youtubeChannelA},${youtubeChannelB}`,
      ),
      makeEnv(),
    );
    const body = (await response.json()) as {
      videos: Array<{ videoId: string }>;
      cache: YouTubePublicCacheMetadataDto;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Retry-After")).toBeNull();
    expect(body.videos).toHaveLength(1);
    expect(body.cache).toEqual(cache);
  });

  it("모든 대상이 비어 있으면 503 empty, Retry-After 15, no-store를 반환한다", async () => {
    const { handleYouTube, readChannelsWithSWR } = createHarness();
    const cache = makeCache("empty", {
      oldestFetchedAt: null,
      pendingCount: 1,
    });
    readChannelsWithSWR.mockResolvedValueOnce({
      byChannel: [
        {
          channelId: youtubeChannelA,
          source: "official",
          content: null,
        },
      ],
      cache,
    });

    const response = await handleYouTube(
      new Request(
        `https://example.com/api/youtube/videos?channelIds=${youtubeChannelA}`,
      ),
      makeEnv(),
    );
    const body = (await response.json()) as {
      cache: YouTubePublicCacheMetadataDto;
    };

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Retry-After")).toBe("15");
    expect(body.cache).toEqual(cache);
  });

  it("/api/youtube/cache/status는 관리자 인증을 요구한다", async () => {
    const { handleYouTube, readCacheStatus, readWarmupStatus } =
      createHarness();
    requireAdminUserMock.mockResolvedValueOnce({
      ok: false,
      response: new Response("Unauthorized", { status: 401 }),
    });

    const response = await handleYouTube(
      new Request("https://example.com/api/youtube/cache/status"),
      makeEnv(),
    );

    expect(response.status).toBe(401);
    expect(readCacheStatus).not.toHaveBeenCalled();
    expect(readWarmupStatus).not.toHaveBeenCalled();
  });

  it("windowHours 범위를 벗어나면 400을 반환한다", async () => {
    const { handleYouTube, readCacheStatus, readWarmupStatus } =
      createHarness();

    const response = await handleYouTube(
      new Request("https://example.com/api/youtube/cache/status?windowHours=999"),
      makeEnv(),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe(
      "windowHours must be an integer between 1 and 168",
    );
    expect(readCacheStatus).not.toHaveBeenCalled();
    expect(readWarmupStatus).not.toHaveBeenCalled();
  });

  it("/api/youtube/cache/status는 no-store 모니터링 응답을 반환한다", async () => {
    const {
      handleYouTube,
      readCacheTargets,
      readCacheStatus,
      readCacheAnalytics,
      readWarmupStatus,
    } = createHarness();

    const response = await handleYouTube(
      new Request("https://example.com/api/youtube/cache/status?windowHours=12"),
      makeEnv(),
    );
    const body = (await response.json()) as {
      window: { hours: number };
      warmup: { targets: { total: number } };
      targetStates: { official: { missing: number } };
      analytics: { status: string; sampled: boolean };
      effectiveness: {
        nonBlockingServeRate: number | null;
        externalApiCalls: number;
        activeQuotaUnits: number;
        changeRate: number | null;
        quotaPerChange: number | null;
      };
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Vary")).toBe("Authorization");
    expect(body.window.hours).toBe(12);
    expect(body.warmup.targets.total).toBe(0);
    expect(body.targetStates.official.missing).toBe(0);
    expect(body.analytics).toMatchObject({ status: "available", sampled: true });
    expect(body.effectiveness).toMatchObject({
      nonBlockingServeRate: 0.8,
      externalApiCalls: 5,
      activeQuotaUnits: 5,
      changeRate: 0.25,
      quotaPerChange: 2.5,
    });
    expect(readCacheStatus).toHaveBeenCalledWith(
      12,
      Date.parse("2026-07-09T00:00:00.000Z"),
    );
    expect(readCacheAnalytics).toHaveBeenCalledWith(12);
    expect(readWarmupStatus).toHaveBeenCalledWith(12);
    expect(readCacheTargets).toHaveBeenCalledOnce();
  });

  it.each([
    "/api/youtube/cache/refresh",
    "/api/youtube/cache/warmup/run",
  ])("%s은 같은 동기 200 수동 갱신 결과를 반환한다", async (pathname) => {
    const { handleYouTube, runCacheRefresh, writeWarmupAudit } = createHarness();

    const response = await handleYouTube(
      new Request(`https://example.com${pathname}`, { method: "POST" }),
      makeEnv(),
    );
    const body = (await response.json()) as YouTubeCacheRefreshRunSummaryDto;

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Vary")).toBe("Authorization");
    expect(body).toEqual(manualRefreshResult);
    expect(runCacheRefresh).toHaveBeenCalledOnce();
    expect(writeWarmupAudit).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "admin", result: manualRefreshResult }),
    );
  });

  it("수동 갱신 lease 충돌은 409 에러 계약으로 반환한다", async () => {
    const { handleYouTube, runCacheRefresh, writeWarmupAudit } = createHarness();
    runCacheRefresh.mockRejectedValueOnce(
      new YouTubeCacheRefreshInProgressError(),
    );

    const response = await handleYouTube(
      new Request("https://example.com/api/youtube/cache/refresh", {
        method: "POST",
      }),
      makeEnv(),
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "youtube_cache_refresh_in_progress",
    });
    expect(writeWarmupAudit).not.toHaveBeenCalled();
  });

  it("잘못된 channelIds와 maxResults를 SWR 조회 전에 거부한다", async () => {
    const { handleYouTube, readChannelsWithSWR } = createHarness();
    const invalidChannelResponse = await handleYouTube(
      new Request(
        "https://example.com/api/youtube/videos?channelIds=UC_INVALID",
      ),
      makeEnv(),
    );
    const invalidLimitResponse = await handleYouTube(
      new Request(
        `https://example.com/api/youtube/videos?channelIds=${youtubeChannelA}&maxResults=21`,
      ),
      makeEnv(),
    );

    expect(invalidChannelResponse.status).toBe(400);
    expect(invalidLimitResponse.status).toBe(400);
    expect(readChannelsWithSWR).not.toHaveBeenCalled();
  });

  it("활성 멤버에 없는 YouTube 채널을 400으로 거부한다", async () => {
    const { handleYouTube, readChannelsWithSWR } = createHarness();
    const unapproved = `UC${"C".repeat(22)}`;
    const response = await handleYouTube(
      new Request(
        `https://example.com/api/youtube/videos?channelIds=${unapproved}`,
      ),
      makeEnv(),
    );

    expect(response.status).toBe(400);
    expect(readChannelsWithSWR).not.toHaveBeenCalled();
  });

  it("YouTube allowlist 조회 실패를 503으로 반환한다", async () => {
    const { handleYouTube, ports, readChannelsWithSWR } = createHarness();
    vi.mocked(ports.readAllowedChannelIds).mockRejectedValueOnce(
      new Error("D1 unavailable"),
    );

    const response = await handleYouTube(
      new Request(
        `https://example.com/api/youtube/videos?channelIds=${youtubeChannelA}`,
      ),
      makeEnv(),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(readChannelsWithSWR).not.toHaveBeenCalled();
  });
});
