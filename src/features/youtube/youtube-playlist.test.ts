// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Member, YouTubeVideo } from "@/lib/types";
import { YouTubePlaylist } from "./youtube-playlist";

vi.mock("@/assets/icon_youtube_shorts.svg", () => ({
  default: "youtube-shorts.svg",
}));

const members: Member[] = [];

const makeKirinukiVideo = (
  videoId: string,
  channelId: string,
  channelTitle: string,
): YouTubeVideo => ({
  videoId,
  title: `키리누키 ${videoId}`,
  publishedAt: "2026-05-29T00:00:00Z",
  thumbnailUrl: `https://example.com/${videoId}.jpg`,
  duration: 90,
  viewCount: 1000,
  channelId,
  channelTitle,
  isShort: false,
});

describe("YouTubePlaylist", () => {
  afterEach(() => {
    cleanup();
  });

  it("키리누키 안내에 현재 참여한 채널 리스트를 표시한다", () => {
    render(
      React.createElement(YouTubePlaylist, {
        title: "최신 키리누키",
        videos: [
          makeKirinukiVideo("clip-1", "UC1", "클리퍼 A"),
          makeKirinukiVideo("clip-3", "UC1", "클리퍼 A"),
        ],
        members,
        isKirinuki: true,
        kirinukiChannels: [
          { channelId: "UC1", channelTitle: "클리퍼 A" },
          { channelId: "UC2", channelTitle: "클리퍼 B" },
        ],
        layout: "feed-grid",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "키리누키 게시에 대한 안내" }),
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("현재 참여 채널")).toBeTruthy();
    expect(within(dialog).getByText("클리퍼 A")).toBeTruthy();
    expect(within(dialog).getByText("클리퍼 B")).toBeTruthy();
    expect(within(dialog).getAllByText("클리퍼 A")).toHaveLength(1);
  });
});
