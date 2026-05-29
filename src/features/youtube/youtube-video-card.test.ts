// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Member, YouTubeVideo } from "@/lib/types";
import { YouTubeVideoCard } from "./youtube-video-card";

vi.mock("@/assets/icon_youtube_shorts.svg", () => ({
  default: "youtube-shorts.svg",
}));

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

const kirinukiVideo: YouTubeVideo = {
  videoId: "kirinuki-1",
  title: "키리누키 영상",
  publishedAt: "2026-05-29T00:00:00Z",
  thumbnailUrl: "https://example.com/kirinuki.jpg",
  duration: 90,
  viewCount: 1234,
  channelId: "clipper-channel",
  channelTitle: "클리퍼 채널",
  isShort: false,
};

describe("YouTubeVideoCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("키리누키 카드는 좌측 상단 칩에 채널명을 표시하고 채널 아바타는 숨긴다", () => {
    const { container } = render(
      React.createElement(YouTubeVideoCard, {
        video: kirinukiVideo,
        member,
        isKirinuki: true,
        layout: "grid",
      }),
    );

    expect(screen.getAllByText("클리퍼 채널")).toHaveLength(1);
    expect(container.querySelector('img[src="/profile/m1.webp"]')).toBeNull();
  });
});
