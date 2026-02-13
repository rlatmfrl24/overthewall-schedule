// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Member } from "@/lib/types";
import { useAllMembersClips } from "./use-chzzk-clips";
import { useAllMembersLatestVods } from "./use-chzzk-vods";
import { useKirinukiVideos } from "./use-kirinuki-videos";
import { useYouTubeVideos } from "./use-youtube-videos";

const fetchAllMembersClipsMock = vi.hoisted(() => vi.fn());
const fetchAllMembersLatestVideosMock = vi.hoisted(() => vi.fn());
const fetchKirinukiVideosMock = vi.hoisted(() => vi.fn());
const fetchMembersYouTubeVideosMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/clips", () => ({
  fetchAllMembersClips: fetchAllMembersClipsMock,
}));

vi.mock("@/lib/api/vods", () => ({
  fetchAllMembersLatestVideos: fetchAllMembersLatestVideosMock,
}));

vi.mock("@/lib/api/kirinuki", () => ({
  fetchKirinukiVideos: fetchKirinukiVideosMock,
}));

vi.mock("@/lib/api/youtube", () => ({
  fetchMembersYouTubeVideos: fetchMembersYouTubeVideosMock,
}));

const makeMember = (
  uid: number,
  options?: { youtubeChannelId?: string | null; chzzkChannelId?: string | null },
): Member =>
  ({
    uid,
    code: `m${uid}`,
    name: `멤버${uid}`,
    main_color: null,
    sub_color: null,
    oshi_mark: null,
    url_twitter: null,
    url_youtube: null,
    url_chzzk: options?.chzzkChannelId
      ? `https://chzzk.naver.com/${options.chzzkChannelId}`
      : null,
    youtube_channel_id: options?.youtubeChannelId ?? null,
    birth_date: null,
    debut_date: null,
    unit_name: null,
    fan_name: null,
    introduction: null,
    is_deprecated: 0,
  }) as Member;

describe("media hooks", () => {
  beforeEach(() => {
    fetchAllMembersClipsMock.mockReset();
    fetchAllMembersLatestVideosMock.mockReset();
    fetchKirinukiVideosMock.mockReset();
    fetchMembersYouTubeVideosMock.mockReset();
  });

  it("useAllMembersClips: 초기 fetch 및 reload를 수행한다", async () => {
    fetchAllMembersClipsMock.mockResolvedValue([{ clipUID: "c1" }]);

    const members = [makeMember(1, { chzzkChannelId: "aaa" })];
    const { result } = renderHook(() => useAllMembersClips(members, 7));

    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    expect(result.current.clips).toEqual([{ clipUID: "c1" }]);
    expect(fetchAllMembersClipsMock).toHaveBeenCalledWith(members, 7);

    await act(async () => {
      await result.current.reload();
    });
    expect(fetchAllMembersClipsMock).toHaveBeenCalledTimes(2);
  });

  it("useAllMembersLatestVods: enabled=false면 요청하지 않는다", async () => {
    const members = [makeMember(1, { chzzkChannelId: "aaa" })];
    const { result } = renderHook(() =>
      useAllMembersLatestVods(members, { enabled: false }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasLoaded).toBe(false);
    expect(fetchAllMembersLatestVideosMock).not.toHaveBeenCalled();
  });

  it("useAllMembersLatestVods: 조회 결과를 상태에 반영한다", async () => {
    fetchAllMembersLatestVideosMock.mockResolvedValue({ 1: { videoId: "v1" } });
    const members = [makeMember(1, { chzzkChannelId: "aaa" })];
    const { result } = renderHook(() => useAllMembersLatestVods(members));

    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    expect(result.current.vods[1]).toEqual({ videoId: "v1" });
  });

  it("useKirinukiVideos: 성공/실패 상태를 처리한다", async () => {
    fetchKirinukiVideosMock.mockResolvedValueOnce({
      videos: [{ videoId: "v1" }],
      shorts: [{ videoId: "s1" }],
      byChannel: [],
    });

    const { result, rerender } = renderHook(() =>
      useKirinukiVideos({ maxResults: 3 }),
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

    expect(result.current.error).toBe("키리누키 영상을 불러오는데 실패했습니다.");
    errorSpy.mockRestore();
  });

  it("useYouTubeVideos: 채널 없는 경우 즉시 로드 완료 처리한다", async () => {
    const { result } = renderHook(() => useYouTubeVideos([makeMember(1)]));

    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    expect(result.current.videos).toEqual([]);
    expect(fetchMembersYouTubeVideosMock).not.toHaveBeenCalled();
  });

  it("useYouTubeVideos: fetch 결과를 반영하고 reload를 수행한다", async () => {
    fetchMembersYouTubeVideosMock.mockResolvedValue({
      videos: [{ videoId: "v1", channelId: "UC1" }],
      shorts: [],
      updatedAt: "2026-02-13T00:00:00Z",
    });

    const members = [makeMember(2, { youtubeChannelId: "UC1" })];
    const { result } = renderHook(() => useYouTubeVideos(members, { maxResults: 9 }));

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
