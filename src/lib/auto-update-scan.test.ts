import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchChzzkVideosMock = vi.hoisted(() => vi.fn());

vi.mock("../../worker/services/chzzk", () => ({
  fetchChzzkVideos: fetchChzzkVideosMock,
}));

import { scanRecentChzzkVideos } from "../../worker/services/schedule";

type VideoOverrides = {
  videoId?: string;
  videoTitle?: string;
  publishDateAt?: number;
  duration?: number;
};

const makeVideo = (date: string, overrides: VideoOverrides = {}) => ({
  videoNo: Number(overrides.videoId?.replace(/\D/g, "") || "1"),
  videoId: overrides.videoId ?? `video-${date}`,
  videoTitle: overrides.videoTitle ?? `title-${date}`,
  videoType: "REPLAY",
  publishDate: `${date}T03:00:00.000Z`,
  thumbnailImageUrl: "",
  trailerUrl: "",
  duration: overrides.duration ?? 0,
  readCount: 0,
  publishDateAt: overrides.publishDateAt ?? Date.parse(`${date}T03:00:00.000Z`),
  categoryType: null,
  videoCategory: null,
  videoCategoryValue: "",
  channel: {
    channelId: "channel",
    channelName: "channel",
    channelImageUrl: "",
  },
  channelId: "channel",
  channelName: "channel",
  channelImageUrl: "",
});

describe("scanRecentChzzkVideos", () => {
  beforeEach(() => {
    fetchChzzkVideosMock.mockReset();
  });

  it("범위를 벗어난 VOD를 만나면 다음 페이지를 조회하지 않는다", async () => {
    fetchChzzkVideosMock.mockResolvedValueOnce({
      page: 0,
      size: 5,
      totalCount: 5,
      totalPages: 1,
      data: [
        makeVideo("2026-03-16", { videoId: "video-1" }),
        makeVideo("2026-03-15", { videoId: "video-2" }),
        makeVideo("2026-03-10", { videoId: "video-3" }),
      ],
    });

    const result = await scanRecentChzzkVideos(
      "channel-a",
      "2026-03-15",
      "2026-03-16",
    );

    expect(result.map((video) => video.videoId)).toEqual(["video-1", "video-2"]);
    expect(fetchChzzkVideosMock).toHaveBeenCalledTimes(1);
    expect(fetchChzzkVideosMock).toHaveBeenCalledWith("channel-a", 0, 5);
  });

  it("첫 페이지가 가득 차고 모두 범위 안이면 다음 페이지를 조회한다", async () => {
    fetchChzzkVideosMock
      .mockResolvedValueOnce({
        page: 0,
        size: 5,
        totalCount: 10,
        totalPages: 2,
        data: [
          makeVideo("2026-03-16", { videoId: "video-1" }),
          makeVideo("2026-03-16", { videoId: "video-2" }),
          makeVideo("2026-03-15", { videoId: "video-3" }),
          makeVideo("2026-03-15", { videoId: "video-4" }),
          makeVideo("2026-03-15", { videoId: "video-5" }),
        ],
      })
      .mockResolvedValueOnce({
        page: 1,
        size: 5,
        totalCount: 10,
        totalPages: 2,
        data: [makeVideo("2026-03-14", { videoId: "video-6" })],
      });

    const result = await scanRecentChzzkVideos(
      "channel-b",
      "2026-03-14",
      "2026-03-16",
    );

    expect(result.map((video) => video.videoId)).toEqual([
      "video-1",
      "video-2",
      "video-3",
      "video-4",
      "video-5",
      "video-6",
    ]);
    expect(fetchChzzkVideosMock).toHaveBeenCalledTimes(2);
    expect(fetchChzzkVideosMock).toHaveBeenNthCalledWith(1, "channel-b", 0, 5);
    expect(fetchChzzkVideosMock).toHaveBeenNthCalledWith(2, "channel-b", 1, 5);
  });

  it("최대 3페이지까지만 조회한다", async () => {
    fetchChzzkVideosMock
      .mockResolvedValueOnce({
        page: 0,
        size: 5,
        totalCount: 20,
        totalPages: 4,
        data: Array.from({ length: 5 }, (_, index) =>
          makeVideo("2026-03-16", { videoId: `page0-${index}` }),
        ),
      })
      .mockResolvedValueOnce({
        page: 1,
        size: 5,
        totalCount: 20,
        totalPages: 4,
        data: Array.from({ length: 5 }, (_, index) =>
          makeVideo("2026-03-15", { videoId: `page1-${index}` }),
        ),
      })
      .mockResolvedValueOnce({
        page: 2,
        size: 5,
        totalCount: 20,
        totalPages: 4,
        data: Array.from({ length: 5 }, (_, index) =>
          makeVideo("2026-03-14", { videoId: `page2-${index}` }),
        ),
      });

    const result = await scanRecentChzzkVideos(
      "channel-c",
      "2026-03-14",
      "2026-03-16",
    );

    expect(result).toHaveLength(15);
    expect(fetchChzzkVideosMock).toHaveBeenCalledTimes(3);
    expect(fetchChzzkVideosMock).toHaveBeenNthCalledWith(3, "channel-c", 2, 5);
  });
});
