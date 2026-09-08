// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemberDto } from "@contracts/members";
import type { YouTubeVideo } from "../model/types";

const useYouTubeVideosMock = vi.hoisted(() => vi.fn());
const useFilteredYouTubeVideosMock = vi.hoisted(() => vi.fn());
const useYouTubeShortsMock = vi.hoisted(() => vi.fn());

vi.mock("../queries/use-youtube-videos", () => ({
  useYouTubeVideos: useYouTubeVideosMock,
  useFilteredYouTubeVideos: useFilteredYouTubeVideosMock,
}));

vi.mock("../queries/use-youtube-shorts", () => ({
  useYouTubeShorts: useYouTubeShortsMock,
}));

vi.mock("@/assets/icon_youtube_shorts.svg", () => ({
  default: "youtube-shorts.svg",
}));

import { YouTubeSection } from "./youtube-section";

const member: MemberDto = {
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

  it("Shorts 실패를 빈 결과로 표시하지 않고 현재 목록을 유지하며 재시도한다", () => {
    const retry = vi.fn();
    const videos = [makeVideo(1)];
    useYouTubeVideosMock.mockReturnValue({ videos, error: null, hasLoaded: true, loading: false });
    useFilteredYouTubeVideosMock.mockReturnValue({ filteredVideos: videos });
    useYouTubeShortsMock.mockReturnValue({ shorts: [], collection: { state: "ready" }, error: "Shorts 조회 실패", hasLoaded: true, hasMore: false, loading: false, loadingMore: false, retry });
    render(React.createElement(YouTubeSection, { members: [member], selectedMemberUids: null, loadingMembers: false }));
    expect(screen.getByText("일반 영상 1")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Shorts 조회 실패");
    expect(screen.queryByText("업로드된 Shorts가 없습니다.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("Shorts 로딩이 끝나지 않아도 조회된 일반 동영상을 보여준다", () => {
    const videos = [makeVideo(1)];
    useYouTubeVideosMock.mockReturnValue({ videos, error: null, hasLoaded: true, loading: false });
    useFilteredYouTubeVideosMock.mockReturnValue({ filteredVideos: videos });
    useYouTubeShortsMock.mockReturnValue({ shorts: [], collection: { state: "refreshing" }, error: null, hasLoaded: false, loading: true });
    render(React.createElement(YouTubeSection, { members: [member], selectedMemberUids: null, loadingMembers: false }));
    expect(screen.getByText("일반 영상 1")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Shorts를 불러오고 있습니다.");
    expect(screen.queryByText("업로드된 Shorts가 없습니다.")).toBeNull();
  });

  it("Shorts 갱신 실패 시 기존 카드와 재시도를 함께 표시한다", () => {
    const retry = vi.fn();
    useYouTubeVideosMock.mockReturnValue({ videos: [], error: null, hasLoaded: true, loading: false });
    useFilteredYouTubeVideosMock.mockReturnValue({ filteredVideos: [] });
    useYouTubeShortsMock.mockReturnValue({ shorts: [makeVideo(2, true)], collection: { state: "ready" },
      error: null, refreshError: "Shorts 목록을 갱신하지 못했습니다.", hasLoaded: true, loading: false, retry });
    render(React.createElement(YouTubeSection, { members: [member], selectedMemberUids: null, loadingMembers: false }));
    expect(screen.getByText("쇼츠 2")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("이전에 불러온 Shorts");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("일반 영상 실패가 조회된 Shorts를 숨기지 않는다", () => {
    useYouTubeVideosMock.mockReturnValue({ videos: [], error: "동영상 조회 실패", hasLoaded: true, loading: false });
    useFilteredYouTubeVideosMock.mockReturnValue({ filteredVideos: [] });
    useYouTubeShortsMock.mockReturnValue({ shorts: [makeVideo(2, true)], collection: { state: "ready" }, error: null, hasLoaded: true, loading: false });
    render(React.createElement(YouTubeSection, { members: [member], selectedMemberUids: null, loadingMembers: false }));
    expect(screen.getByRole("alert").textContent).toContain("동영상 조회 실패");
    expect(screen.getByText("쇼츠 2")).toBeTruthy();
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
      filteredShorts: [],
    });
    useYouTubeShortsMock.mockReturnValue({
      shorts,
      collection: {
        state: "ready",
        baselineTarget: 20,
        requested: 20,
        returned: 1,
        revalidateAfterMs: null,
      },
      error: null,
      hasLoaded: true,
      hasMore: true,
      loadMore: vi.fn(),
      loading: false,
      loadingMore: false,
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
    expect(
      screen.getByRole("button", { name: "Shorts 20개 더 보기" }),
    ).toBeTruthy();

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
