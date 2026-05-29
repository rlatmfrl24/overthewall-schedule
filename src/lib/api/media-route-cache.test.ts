import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleKirinuki } from "../../../worker/routes/kirinuki";
import { handleVods } from "../../../worker/routes/vods";
import type { Env } from "../../../worker/types";

const fetchChzzkVideosMock = vi.hoisted(() => vi.fn());
const fetchChzzkClipsMock = vi.hoisted(() => vi.fn());
const fetchYouTubeVideosForChannelMock = vi.hoisted(() => vi.fn());

vi.mock("../../../worker/services/chzzk", () => ({
  fetchChzzkVideos: fetchChzzkVideosMock,
  fetchChzzkClips: fetchChzzkClipsMock,
}));

vi.mock("../../../worker/services/youtube", () => ({
  fetchYouTubeVideosForChannel: fetchYouTubeVideosForChannelMock,
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
    fetchChzzkVideosMock.mockReset();
    fetchChzzkClipsMock.mockReset();
    fetchYouTubeVideosForChannelMock.mockReset();
  });

  it("sets public cache headers for chzzk vods and clips", async () => {
    fetchChzzkVideosMock.mockResolvedValue({ data: [] });
    fetchChzzkClipsMock.mockResolvedValue({ data: [] });

    const vodResponse = await handleVods(
      new Request("https://example.com/api/vods/chzzk?channelIds=aaa"),
      makeEnv(),
    );
    const clipResponse = await handleVods(
      new Request("https://example.com/api/clips/chzzk?channelIds=aaa"),
      makeEnv(),
    );

    expect(vodResponse.headers.get("Cache-Control")).toContain("public");
    expect(clipResponse.headers.get("Cache-Control")).toContain("public");
  });

  it("sets public cache headers for youtube and kirinuki videos", async () => {
    fetchYouTubeVideosForChannelMock.mockResolvedValue({
      videos: [],
      shorts: [],
    });

    const youtubeResponse = await handleVods(
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
