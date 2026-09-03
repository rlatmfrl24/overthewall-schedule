// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberDto } from "@contracts/members";
import type { YouTubeShortsResponse } from "../model/types";
import { createQueryWrapper } from "@/test/query-client";
import { useYouTubeShorts } from "./use-youtube-shorts";

const fetchMembersYouTubeShortsMock = vi.hoisted(() => vi.fn());

vi.mock("../api/youtube", () => ({
  fetchMembersYouTubeShorts: fetchMembersYouTubeShortsMock,
}));

const member: MemberDto = {
  uid: 1,
  code: "m1",
  name: "멤버1",
  main_color: null,
  sub_color: null,
  oshi_mark: null,
  url_twitter: null,
  url_youtube: null,
  url_chzzk: null,
  youtube_channel_id: `UC${"A".repeat(22)}`,
  birth_date: null,
  debut_date: null,
  unit_name: null,
  fan_name: null,
  introduction: null,
  is_deprecated: 0,
};

const makePage = (
  state: YouTubeShortsResponse["collection"]["state"],
  videoId: string,
  nextCursor: string | null,
): YouTubeShortsResponse => ({
  items: videoId
    ? [{
        videoId,
        title: videoId,
        publishedAt: "2026-09-03T00:00:00Z",
        thumbnailUrl: "",
        duration: 30,
        viewCount: 1,
        channelId: member.youtube_channel_id!,
        channelTitle: member.name,
        isShort: true,
        memberUid: member.uid,
      }]
    : [],
  nextCursor,
  hasMore: state !== "exhausted",
  updatedAt: "2026-09-03T00:00:00Z",
  collection: {
    state,
    baselineTarget: 20,
    requested: 20,
    returned: videoId ? 1 : 0,
    revalidateAfterMs:
      state === "refreshing" || state === "partial" ? 15000 : null,
  },
});

describe("useYouTubeShorts", () => {
  beforeEach(() => {
    fetchMembersYouTubeShortsMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("명시적 더 보기 요청으로 확정된 다음 페이지를 이어 붙인다", async () => {
    fetchMembersYouTubeShortsMock
      .mockResolvedValueOnce(makePage("ready", "short-1", "cursor-1"))
      .mockResolvedValueOnce(makePage("exhausted", "short-2", null));
    const { result } = renderHook(() => useYouTubeShorts([member]), {
      wrapper: createQueryWrapper(),
    });
    await vi.waitFor(() => expect(result.current.hasLoaded).toBe(true));

    await act(async () => {
      await result.current.loadMore();
    });

    await vi.waitFor(() =>
      expect(result.current.shorts.map((item) => item.videoId)).toEqual([
        "short-1",
        "short-2",
      ]),
    );
    expect(fetchMembersYouTubeShortsMock).toHaveBeenLastCalledWith([member], {
      limit: 20,
      cursor: "cursor-1",
    });
  });

  it("미완료 페이지는 기존 카드를 유지하고 15초 뒤 한 번만 재조회한다", async () => {
    vi.useFakeTimers();
    fetchMembersYouTubeShortsMock
      .mockResolvedValueOnce(makePage("refreshing", "short-1", null))
      .mockResolvedValueOnce(makePage("partial", "short-1", null));
    const { result } = renderHook(() => useYouTubeShorts([member]), {
      wrapper: createQueryWrapper(),
    });
    await vi.waitFor(() => expect(result.current.hasLoaded).toBe(true));
    expect(result.current.shorts[0]?.videoId).toBe("short-1");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    await vi.waitFor(() =>
      expect(fetchMembersYouTubeShortsMock).toHaveBeenCalledTimes(2),
    );
    expect(result.current.shorts[0]?.videoId).toBe("short-1");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMembersYouTubeShortsMock).toHaveBeenCalledTimes(2);
  });
});
