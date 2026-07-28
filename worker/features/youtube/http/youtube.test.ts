import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildYouTubeApplication,
  createYouTubeHandler,
} from "../index";
import type { Env } from "../../../platform/types";

type AdminResult =
  | { ok: true; user: { id: string } }
  | { ok: false; response: Response };
const requireAdminUserMock = vi.hoisted(() =>
  vi.fn(async (): Promise<AdminResult> => ({
    ok: true,
    user: { id: "admin" },
  })),
);
const fetchYouTubeVideosForChannelMock = vi.hoisted(() => vi.fn());
const getYouTubeCacheStatusMock = vi.hoisted(() => vi.fn());
const getYouTubeWarmupStatusMock = vi.hoisted(() => vi.fn());
const runYouTubeWarmupMock = vi.hoisted(() => vi.fn());
const auditValuesMock = vi.hoisted(() => vi.fn(async () => ({ success: true })));
const youtubeChannelA = `UC${"A".repeat(22)}`;
const youtubeChannelB = `UC${"B".repeat(22)}`;

vi.mock("../../../platform/auth", () => ({
  requireAdminUser: requireAdminUserMock,
}));

vi.mock("../infrastructure/youtube-api", () => ({
  fetchYouTubeVideosForChannel: fetchYouTubeVideosForChannelMock,
  getYouTubeCacheStatus: getYouTubeCacheStatusMock,
}));

vi.mock("../infrastructure/youtube-warmup", () => ({
  getYouTubeWarmupStatus: getYouTubeWarmupStatusMock,
  runYouTubeWarmup: runYouTubeWarmupMock,
}));

vi.mock("../../../platform/db", () => ({
  getDb: () => ({
    insert: () => ({
      values: auditValuesMock,
    }),
  }),
}));

const makeEnv = (): Env =>
  ({
    YOUTUBE_API_KEY: "youtube-key",
    X_BEARER_TOKEN: "x-token",
    otw_db: {
      prepare: () => ({
        all: async () => ({
          results: [
            { youtube_channel_id: youtubeChannelA },
            { youtube_channel_id: youtubeChannelB },
          ],
        }),
      }),
    } as unknown as D1Database,
  }) as Env;

const handleYouTube = createYouTubeHandler(buildYouTubeApplication);

describe("youtube worker route", () => {
  beforeEach(() => {
    requireAdminUserMock.mockReset();
    requireAdminUserMock.mockResolvedValue({ ok: true, user: { id: "admin" } });
    fetchYouTubeVideosForChannelMock.mockReset();
    getYouTubeCacheStatusMock.mockReset();
    getYouTubeWarmupStatusMock.mockReset();
    runYouTubeWarmupMock.mockReset();
    auditValuesMock.mockClear();
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
              channelId === youtubeChannelA
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
        `https://example.com/api/youtube/videos?channelIds=${youtubeChannelA},${youtubeChannelB}&maxResults=5`,
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
      `${youtubeChannelB}-v`,
      `${youtubeChannelA}-v`,
    ]);
    expect(body.shorts).toEqual([]);
    expect(body.byChannel).toHaveLength(2);
    expect(fetchYouTubeVideosForChannelMock).toHaveBeenCalledWith(
      youtubeChannelA,
      "youtube-key",
      5,
      expect.anything(),
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
    expect(getYouTubeCacheStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({ prepare: expect.any(Function) }),
      12,
    );
    expect(getYouTubeWarmupStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({ prepare: expect.any(Function) }),
      12,
    );
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
    expect(auditValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "manual_collection.youtube_warmup",
        resource_type: "youtube_warmup",
        action: "run_now",
        status: "success",
        actor_id: "admin",
        target_count: 2,
        success_count: 1,
        failure_count: 0,
      }),
    );
  });

  it("잘못된 channelIds와 maxResults를 외부 호출 전에 거부한다", async () => {
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
    expect(fetchYouTubeVideosForChannelMock).not.toHaveBeenCalled();
  });

  it("활성 멤버에 없는 YouTube 채널을 400으로 거부한다", async () => {
    const unapproved = `UC${"C".repeat(22)}`;
    const response = await handleYouTube(
      new Request(
        `https://example.com/api/youtube/videos?channelIds=${unapproved}`,
      ),
      makeEnv(),
    );

    expect(response.status).toBe(400);
    expect(fetchYouTubeVideosForChannelMock).not.toHaveBeenCalled();
  });

  it("YouTube allowlist 조회 실패를 503으로 반환한다", async () => {
    const env = makeEnv();
    env.otw_db = {
      prepare: () => ({
        all: async () => {
          throw new Error("D1 unavailable");
        },
      }),
    } as unknown as D1Database;

    const response = await handleYouTube(
      new Request(
        `https://example.com/api/youtube/videos?channelIds=${youtubeChannelA}`,
      ),
      env,
    );

    expect(response.status).toBe(503);
    expect(fetchYouTubeVideosForChannelMock).not.toHaveBeenCalled();
  });
});
