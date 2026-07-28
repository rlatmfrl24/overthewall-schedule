// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
): MemberDto => ({
  uid,
  code: `m${uid}`,
  name: `멤버${uid}`,
  main_color: null,
  sub_color: null,
  oshi_mark: null,
  url_twitter: null,
  url_youtube: null,
  url_chzzk: null,
  youtube_channel_id: youtubeChannelId,
  birth_date: null,
  debut_date: null,
  unit_name: null,
  fan_name: null,
  introduction: null,
  is_deprecated: 0,
});

describe("YouTube media queries", () => {
  beforeEach(() => {
    fetchKirinukiVideosMock.mockReset();
    fetchMembersYouTubeVideosMock.mockReset();
  });

  it("키리누키 조회의 성공과 실패 상태를 처리한다", async () => {
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
      expect(result.current.error).toBe(
        "키리누키 영상을 불러오는데 실패했습니다.",
      ),
    );
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
});
