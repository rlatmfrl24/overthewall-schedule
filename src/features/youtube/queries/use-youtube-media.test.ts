import { createMemberFixture } from "@/test/member-fixtures";
// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberDto } from "@contracts/members";
import { createQueryWrapper } from "@/test/query-client";
import { useKirinukiVideos } from "./use-kirinuki-videos";
import { useYouTubeVideos } from "./use-youtube-videos";

const fetchKirinukiVideosMock = vi.hoisted(() => vi.fn());
const fetchMembersYouTubeVideosMock = vi.hoisted(() => vi.fn());

vi.mock("../api/kirinuki", () => ({
  fetchKirinukiVideos: fetchKirinukiVideosMock,
}));

vi.mock("../api/youtube", () => ({
  fetchMembersYouTubeVideos: fetchMembersYouTubeVideosMock,
}));

const makeMember = (
  uid: number,
  youtubeChannelId: string | null = null,
): MemberDto => (createMemberFixture({
    uid,
    code: `m${uid}`,
    name: `멤버${uid}`,
    youtube_channel_id: youtubeChannelId
  }));

const refreshingCache = (oldestFetchedAt: string) => ({
  state: "refreshing" as const,
  oldestFetchedAt,
  refreshScheduledCount: 1,
  pendingCount: 1,
  revalidateAfterMs: 15000 as const,
});

describe("YouTube media queries", () => {
  beforeEach(() => {
    fetchKirinukiVideosMock.mockReset();
    fetchMembersYouTubeVideosMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("키리누키 재조회 실패 시 기존 콘텐츠를 유지한다", async () => {
    fetchKirinukiVideosMock.mockResolvedValueOnce({
      videos: [{ videoId: "v1" }],
      shorts: [{ videoId: "s1" }],
      byChannel: [],
    });
    const { result, rerender } = renderHook(
      () => useKirinukiVideos({ maxResults: 3 }),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    expect(result.current.error).toBeNull();
    expect(result.current.videos).toEqual([{ videoId: "v1" }]);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchKirinukiVideosMock.mockRejectedValueOnce(new Error("fail"));
    await act(async () => {
      await result.current.refetch();
    });
    rerender();
    await waitFor(() =>
      expect(fetchKirinukiVideosMock).toHaveBeenCalledTimes(2),
    );
    expect(result.current.error).toBeNull();
    expect(result.current.videos).toEqual([{ videoId: "v1" }]);
    errorSpy.mockRestore();
  });

  it("YouTube 채널이 없으면 요청 없이 로드 완료 처리한다", async () => {
    const { result } = renderHook(() => useYouTubeVideos([makeMember(1)]), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    expect(result.current.videos).toEqual([]);
    expect(fetchMembersYouTubeVideosMock).not.toHaveBeenCalled();
  });

  it("YouTube 조회 결과를 반환하고 reload를 수행한다", async () => {
    fetchMembersYouTubeVideosMock.mockResolvedValue({
      videos: [{ videoId: "v1", channelId: "UC1" }],
      shorts: [],
      updatedAt: "2026-02-13T00:00:00Z",
    });
    const members = [makeMember(2, "UC1")];
    const { result } = renderHook(
      () => useYouTubeVideos(members, { maxResults: 9 }),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    expect(result.current.videos[0]?.videoId).toBe("v1");
    expect(fetchMembersYouTubeVideosMock).toHaveBeenCalledWith(members, {
      maxResults: 9,
    });

    await act(async () => {
      await result.current.reload();
    });
    expect(fetchMembersYouTubeVideosMock).toHaveBeenCalledTimes(2);
  });

  it("official and kirinuki storage reads do not use retired one-shot cache polling", async () => {
    vi.useFakeTimers();
    fetchMembersYouTubeVideosMock.mockResolvedValue({ videos: [{ videoId: "old", channelId: "UC1" }], shorts: [], cache: refreshingCache("2026-08-30T00:00:00Z") });
    fetchKirinukiVideosMock.mockResolvedValue({ videos: [{ videoId: "old" }], shorts: [], byChannel: [], cache: refreshingCache("2026-08-30T00:00:00Z") });
    const official = renderHook(() => useYouTubeVideos([makeMember(2, "UC1")]), { wrapper: createQueryWrapper() });
    const clips = renderHook(() => useKirinukiVideos(), { wrapper: createQueryWrapper() });
    await vi.waitFor(() => expect(official.result.current.hasLoaded && clips.result.current.hasLoaded).toBe(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(45_000); });
    expect(fetchMembersYouTubeVideosMock).toHaveBeenCalledTimes(1);
    expect(fetchKirinukiVideosMock).toHaveBeenCalledTimes(1);
    expect(official.result.current.videos[0]?.videoId).toBe("old");
    expect(clips.result.current.videos[0]?.videoId).toBe("old");
  });
});
