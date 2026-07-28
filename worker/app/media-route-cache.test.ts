import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../platform/types";
import { workerRouteRegistry } from "./routes";

const fetchChzzkVideosBatchMock = vi.hoisted(() => vi.fn());
const fetchChzzkClipsBatchMock = vi.hoisted(() => vi.fn());
const fetchYouTubeVideosForChannelMock = vi.hoisted(() => vi.fn());
const chzzkChannelId = "a".repeat(32);
const youtubeChannelId = `UC${"A".repeat(22)}`;

vi.mock("../features/chzzk/infrastructure/chzzk-api", () => ({
  fetchChzzkVideosBatch: fetchChzzkVideosBatchMock,
  fetchChzzkClipsBatch: fetchChzzkClipsBatchMock,
  isChzzkVideoD1CacheProfile: () => false,
  isChzzkClipD1CacheProfile: () => false,
}));

vi.mock("../features/youtube/infrastructure/youtube-api", () => ({
  fetchYouTubeVideosForChannel: fetchYouTubeVideosForChannelMock,
  getYouTubeCacheStatus: vi.fn(),
}));

vi.mock("../platform/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        orderBy: () => [],
      }),
    }),
  }),
}));

const makeEnv = (): Env =>
  ({
    YOUTUBE_API_KEY: "youtube-key",
    X_BEARER_TOKEN: "x-token",
    otw_db: {
      prepare: (sql: string) => ({
        all: async () => ({
          results: sql.includes("youtube_channel_id")
            ? [{ youtube_channel_id: youtubeChannelId }]
            : [
                {
                  url_chzzk: `https://chzzk.naver.com/${chzzkChannelId}`,
                },
              ],
        }),
      }),
    } as unknown as D1Database,
  }) as Env;
const dispatch = async (request: Request) => {
  const response = await workerRouteRegistry.dispatch(request, makeEnv());
  if (!response) throw new Error("Expected a Worker API response");
  return response;
};

describe("media route cache headers", () => {
  beforeEach(() => {
    fetchChzzkVideosBatchMock.mockReset();
    fetchChzzkClipsBatchMock.mockReset();
    fetchYouTubeVideosForChannelMock.mockReset();
  });

  it("sets public cache headers for chzzk vods and clips", async () => {
    const channelId = chzzkChannelId;
    fetchChzzkVideosBatchMock.mockResolvedValue([
      { channelId, content: { data: [] } },
    ]);
    fetchChzzkClipsBatchMock.mockResolvedValue([
      { channelId, content: { data: [] } },
    ]);

    const vodResponse = await dispatch(
      new Request(`https://example.com/api/vods/chzzk?channelIds=${channelId}`),
    );
    const clipResponse = await dispatch(
      new Request(`https://example.com/api/clips/chzzk?channelIds=${channelId}`),
    );

    const expectedCacheControl =
      "public, max-age=60, s-maxage=300, stale-while-revalidate=600";
    expect(vodResponse.headers.get("Cache-Control")).toBe(expectedCacheControl);
    expect(clipResponse.headers.get("Cache-Control")).toBe(expectedCacheControl);
    expect(await vodResponse.json()).toMatchObject({
      updatedAt: expect.any(String),
      items: [{ channelId, content: { data: [] } }],
    });
    expect(await clipResponse.json()).toMatchObject({
      updatedAt: expect.any(String),
      items: [{ channelId, content: { data: [] } }],
    });
  });

  it("sets public cache headers for youtube and kirinuki videos", async () => {
    fetchYouTubeVideosForChannelMock.mockResolvedValue({
      videos: [],
      shorts: [],
    });

    const youtubeResponse = await dispatch(
      new Request(
        `https://example.com/api/youtube/videos?channelIds=${youtubeChannelId}`,
      ),
    );
    const kirinukiResponse = await dispatch(
      new Request("https://example.com/api/kirinuki/videos"),
    );

    expect(youtubeResponse.headers.get("Cache-Control")).toContain("public");
    expect(kirinukiResponse.headers.get("Cache-Control")).toContain("public");
  });
});
