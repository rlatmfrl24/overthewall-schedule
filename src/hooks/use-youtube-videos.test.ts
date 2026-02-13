import { describe, expect, it } from "vitest";
import type { YouTubeVideo } from "@/lib/types";
import { filterYouTubeVideosByMembers } from "./use-youtube-videos";

const makeVideo = (
  partial: Partial<YouTubeVideo> & Pick<YouTubeVideo, "videoId" | "channelId">,
): YouTubeVideo => ({
  videoId: partial.videoId,
  channelId: partial.channelId,
  title: partial.title ?? "영상",
  publishedAt: partial.publishedAt ?? "2026-02-13T00:00:00Z",
  thumbnailUrl: partial.thumbnailUrl ?? "https://example.com/thumb.jpg",
  duration: partial.duration ?? 120,
  viewCount: partial.viewCount ?? 1000,
  channelTitle: partial.channelTitle ?? "채널",
  isShort: partial.isShort ?? false,
  memberUid: partial.memberUid,
});

describe("filterYouTubeVideosByMembers", () => {
  it("선택된 멤버가 없으면 원본 배열을 반환한다", () => {
    const videos = [makeVideo({ videoId: "v1", channelId: "c1", memberUid: 1 })];
    const shorts = [makeVideo({ videoId: "s1", channelId: "c2", memberUid: 2 })];

    const result = filterYouTubeVideosByMembers(videos, shorts, null);

    expect(result.filteredVideos).toBe(videos);
    expect(result.filteredShorts).toBe(shorts);
  });

  it("선택된 멤버 uid 기준으로 필터링한다", () => {
    const videos = [
      makeVideo({ videoId: "v1", channelId: "c1", memberUid: 1 }),
      makeVideo({ videoId: "v2", channelId: "c2", memberUid: 2 }),
      makeVideo({ videoId: "v3", channelId: "c3" }),
    ];
    const shorts = [
      makeVideo({
        videoId: "s1",
        channelId: "c1",
        memberUid: 1,
        isShort: true,
      }),
      makeVideo({
        videoId: "s2",
        channelId: "c2",
        memberUid: 2,
        isShort: true,
      }),
    ];

    const result = filterYouTubeVideosByMembers(videos, shorts, [2]);

    expect(result.filteredVideos.map((video) => video.videoId)).toEqual(["v2"]);
    expect(result.filteredShorts.map((video) => video.videoId)).toEqual(["s2"]);
  });
});
