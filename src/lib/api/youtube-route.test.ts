import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleYouTube } from "../../../worker/routes/youtube";
import type { Env } from "../../../worker/types";

const requireAdminUserMock = vi.hoisted(() =>
  vi.fn(async () => ({ ok: true, user: { id: "admin" } })),
);
const fetchYouTubeVideosForChannelMock = vi.hoisted(() => vi.fn());
const getYouTubeCacheStatusMock = vi.hoisted(() => vi.fn());
const getYouTubeWarmupStatusMock = vi.hoisted(() => vi.fn());
const runYouTubeWarmupMock = vi.hoisted(() => vi.fn());

vi.mock("../../../worker/auth", () => ({
  requireAdminUser: requireAdminUserMock,
}));

vi.mock("../../../worker/services/youtube", () => ({
  fetchYouTubeVideosForChannel: fetchYouTubeVideosForChannelMock,
  getYouTubeCacheStatus: getYouTubeCacheStatusMock,
}));

vi.mock("../../../worker/services/youtube-warmup", () => ({
  getYouTubeWarmupStatus: getYouTubeWarmupStatusMock,
  runYouTubeWarmup: runYouTubeWarmupMock,
}));

const makeEnv = (): Env =>
  ({
    YOUTUBE_API_KEY: "youtube-key",
    X_BEARER_TOKEN: "x-token",
    otw_db: {} as D1Database,
  }) as Env;

describe("youtube worker route", () => {
  beforeEach(() => {
    requireAdminUserMock.mockReset();
    requireAdminUserMock.mockResolvedValue({ ok: true, user: { id: "admin" } });
    fetchYouTubeVideosForChannelMock.mockReset();
    getYouTubeCacheStatusMock.mockReset();
    getYouTubeWarmupStatusMock.mockReset();
    runYouTubeWarmupMock.mockReset();
    getYouTubeWarmupStatusMock.mockResolvedValue({
      settings: {
        enabled: true,
        intervalHours: 1,
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
      targets: { total: 0, official: 0, kirinuki: 0 },
      latestRun: null,
      recentRuns: [],
    });
  });

  it("/api/youtube/videos는 기존 응답 shape와 public cache header를 유지한다", async () => {
    fetchYouTubeVideosForChannelMock.mockImplementation(
      async (channelId: string) => ({
        videos: [
          {
            videoId: `${channelId}-v`,
            title: "Video",
            publishedAt:
              channelId === "UC_A"
                ? "2026-07-08T12:00:00Z"
                : "2026-07-09T12:00:00Z",
            thumbnailUrl: "",
            duration: 120,
            viewCount: 0,
            channelId,
            channelTitle: channelId,
            isShort: false,
          },
        ],
        shorts: [],
      }),
    );

    const response = await handleYouTube(
      new Request(
        "https://example.com/api/youtube/videos?channelIds=UC_A,UC_B&maxResults=5",
      ),
      makeEnv(),
    );
    const body = (await response.json()) as {
      videos: Array<{ videoId: string }>;
      shorts: unknown[];
      byChannel: Array<{ channelId: string; content: unknown }>;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("public");
    expect(body.videos.map((video) => video.videoId)).toEqual([
      "UC_B-v",
      "UC_A-v",
    ]);
    expect(body.shorts).toEqual([]);
    expect(body.byChannel).toHaveLength(2);
    expect(fetchYouTubeVideosForChannelMock).toHaveBeenCalledWith(
      "UC_A",
      "youtube-key",
      5,
      {},
    );
  });

  it("/api/youtube/cache/status는 관리자 인증을 요구한다", async () => {
    requireAdminUserMock.mockResolvedValueOnce({
      ok: false,
      response: new Response("Unauthorized", { status: 401 }),
    });

    const response = await handleYouTube(
      new Request("https://example.com/api/youtube/cache/status"),
      makeEnv(),
    );

    expect(response.status).toBe(401);
    expect(getYouTubeCacheStatusMock).not.toHaveBeenCalled();
    expect(getYouTubeWarmupStatusMock).not.toHaveBeenCalled();
  });

  it("windowHours 범위를 벗어나면 400을 반환한다", async () => {
    const response = await handleYouTube(
      new Request("https://example.com/api/youtube/cache/status?windowHours=999"),
      makeEnv(),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe(
      "windowHours must be an integer between 1 and 168",
    );
    expect(getYouTubeCacheStatusMock).not.toHaveBeenCalled();
    expect(getYouTubeWarmupStatusMock).not.toHaveBeenCalled();
  });

  it("/api/youtube/cache/status는 no-store 모니터링 응답을 반환한다", async () => {
    getYouTubeCacheStatusMock.mockResolvedValueOnce({
      updatedAt: "2026-07-09T00:00:00.000Z",
      window: { hours: 12, since: 1 },
      cache: {
        total: 1,
        fresh: 1,
        stale: 0,
        expired: 0,
        byType: [],
      },
      usage: {
        apiCalls: 0,
        quotaUnits: 0,
        successCount: 0,
        failureCount: 0,
        rateLimitCount: 0,
        quotaErrorCount: 0,
        byOperation: [],
      },
      channels: [],
    });

    const response = await handleYouTube(
      new Request("https://example.com/api/youtube/cache/status?windowHours=12"),
      makeEnv(),
    );
    const body = (await response.json()) as {
      window: { hours: number };
      warmup: { targets: { total: number } };
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Vary")).toBe("Authorization");
    expect(body.window.hours).toBe(12);
    expect(body.warmup.targets.total).toBe(0);
    expect(getYouTubeCacheStatusMock).toHaveBeenCalledWith({}, 12);
    expect(getYouTubeWarmupStatusMock).toHaveBeenCalledWith({}, 12);
  });

  it("/api/youtube/cache/warmup/run은 관리자 전용으로 수동 예열을 실행한다", async () => {
    runYouTubeWarmupMock.mockResolvedValueOnce({
      id: 1,
      source: "manual",
      status: "success",
      targetCount: 2,
      skippedFreshCount: 1,
      refreshedCount: 1,
      failedCount: 0,
      staleFallbackCount: 0,
      apiCalls: 3,
      quotaUnits: 3,
      durationMs: 50,
      startedAt: 1,
      finishedAt: 51,
      error: null,
    });

    const env = makeEnv();
    const response = await handleYouTube(
      new Request("https://example.com/api/youtube/cache/warmup/run", {
        method: "POST",
      }),
      env,
    );
    const body = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.status).toBe("success");
    expect(runYouTubeWarmupMock).toHaveBeenCalledWith(env, "manual");
  });
});
