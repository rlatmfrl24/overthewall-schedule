import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleKirinuki } from "../../../worker/routes/kirinuki";
import { handleVods } from "../../../worker/routes/vods";
import { handleYouTube } from "../../../worker/routes/youtube";
import type { Env } from "../../../worker/types";

const fetchChzzkVideosBatchMock = vi.hoisted(() => vi.fn());
const fetchChzzkClipsBatchMock = vi.hoisted(() => vi.fn());
const fetchYouTubeVideosForChannelMock = vi.hoisted(() => vi.fn());

vi.mock("../../../worker/services/chzzk", () => ({
  fetchChzzkVideosBatch: fetchChzzkVideosBatchMock,
  fetchChzzkClipsBatch: fetchChzzkClipsBatchMock,
  isChzzkVideoD1CacheProfile: () => false,
  isChzzkClipD1CacheProfile: () => false,
}));

vi.mock("../../../worker/services/youtube", () => ({
  fetchYouTubeVideosForChannel: fetchYouTubeVideosForChannelMock,
  getYouTubeCacheStatus: vi.fn(),
}));

vi.mock("../../../worker/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => [],
    }),
  }),
}));

const makeEnv = (): Env =>
  ({
    YOUTUBE_API_KEY: "youtube-key",
    X_BEARER_TOKEN: "x-token",
    otw_db: {} as D1Database,
  }) as Env;

describe("media route cache headers", () => {
  beforeEach(() => {
    fetchChzzkVideosBatchMock.mockReset();
    fetchChzzkClipsBatchMock.mockReset();
    fetchYouTubeVideosForChannelMock.mockReset();
  });

  it("sets public cache headers for chzzk vods and clips", async () => {
    const channelId = "a".repeat(32);
    fetchChzzkVideosBatchMock.mockResolvedValue([
      { channelId, content: { data: [] } },
    ]);
    fetchChzzkClipsBatchMock.mockResolvedValue([
      { channelId, content: { data: [] } },
    ]);

    const vodResponse = await handleVods(
      new Request(`https://example.com/api/vods/chzzk?channelIds=${channelId}`),
      makeEnv(),
    );
    const clipResponse = await handleVods(
      new Request(`https://example.com/api/clips/chzzk?channelIds=${channelId}`),
      makeEnv(),
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

    const youtubeResponse = await handleYouTube(
      new Request("https://example.com/api/youtube/videos?channelIds=UC_A"),
      makeEnv(),
    );
    const kirinukiResponse = await handleKirinuki(
      new Request("https://example.com/api/kirinuki/videos"),
      makeEnv(),
    );

    expect(youtubeResponse.headers.get("Cache-Control")).toContain("public");
    expect(kirinukiResponse.headers.get("Cache-Control")).toContain("public");
  });
});
