// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Member, YouTubeVideo } from "@/lib/types";

const useYouTubeVideosMock = vi.hoisted(() => vi.fn());
const useFilteredYouTubeVideosMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-youtube-videos", () => ({
  useYouTubeVideos: useYouTubeVideosMock,
  useFilteredYouTubeVideos: useFilteredYouTubeVideosMock,
}));

vi.mock("@/assets/icon_youtube_shorts.svg", () => ({
  default: "youtube-shorts.svg",
}));

import { YouTubeSection } from "./youtube-section";

const member: Member = {
  uid: 1,
  code: "m1",
  name: "멤버1",
  main_color: "#336699",
  sub_color: "#99bbdd",
  oshi_mark: null,
  url_twitter: null,
  url_youtube: null,
  url_chzzk: null,
  youtube_channel_id: "UC1",
  birth_date: null,
  debut_date: null,
  unit_name: null,
  fan_name: null,
  introduction: null,
  is_deprecated: 0,
};

const makeVideo = (index: number, isShort = false): YouTubeVideo => ({
  videoId: `video-${index}`,
  title: isShort ? `쇼츠 ${index}` : `일반 영상 ${index}`,
  publishedAt: "2026-05-29T00:00:00Z",
  thumbnailUrl: `https://example.com/thumb-${index}.jpg`,
  duration: isShort ? 30 : 600,
  viewCount: 1000 + index,
  channelId: "UC1",
  channelTitle: "멤버1",
  isShort,
  memberUid: 1,
});

describe("YouTubeSection", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("공식 영상은 그리드 열 수만큼 표시하고 더보기마다 같은 단위로 늘린다", () => {
    const videos = Array.from({ length: 8 }, (_, index) =>
      makeVideo(index + 1),
    );
    const shorts = [makeVideo(101, true)];

    useYouTubeVideosMock.mockReturnValue({
      videos,
      shorts,
      error: null,
      hasLoaded: true,
      loading: false,
    });
    useFilteredYouTubeVideosMock.mockReturnValue({
      filteredVideos: videos,
      filteredShorts: shorts,
    });

    render(
      React.createElement(YouTubeSection, {
        members: [member],
        selectedMemberUids: null,
        loadingMembers: false,
      }),
    );

    expect(screen.getByText("일반 영상 1")).toBeTruthy();
    expect(screen.getByText("일반 영상 3")).toBeTruthy();
    expect(screen.queryByText("일반 영상 4")).toBeNull();
    expect(screen.getByText("Shorts")).toBeTruthy();
    expect(screen.getByText("쇼츠 101")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "동영상 3개 더 보기" }));

    expect(screen.getByText("일반 영상 4")).toBeTruthy();
    expect(screen.getByText("일반 영상 6")).toBeTruthy();
    expect(screen.queryByText("일반 영상 7")).toBeNull();
    expect(
      screen.getByRole("button", { name: "동영상 2개 더 보기" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "동영상 2개 더 보기" }));

    expect(screen.getByText("일반 영상 8")).toBeTruthy();
    expect(screen.getByRole("button", { name: "동영상 접기" })).toBeTruthy();
  });
});
