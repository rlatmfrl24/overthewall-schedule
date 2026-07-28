// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberDto } from "@contracts/members";
import { createQueryWrapper } from "@/test/query-client";
import { useAllMembersClips } from "./use-chzzk-clips";
import {
  useAllMembersLatestVods,
  useAllMembersVods,
} from "./use-chzzk-vods";

const fetchAllMembersClipsMock = vi.hoisted(() => vi.fn());
const fetchAllMembersLatestVideosMock = vi.hoisted(() => vi.fn());
const fetchAllMembersVodVideosMock = vi.hoisted(() => vi.fn());

vi.mock("../api/clips", () => ({
  fetchAllMembersClips: fetchAllMembersClipsMock,
}));

vi.mock("../api/vods", () => ({
  fetchAllMembersLatestVideos: fetchAllMembersLatestVideosMock,
  fetchAllMembersVodVideos: fetchAllMembersVodVideosMock,
}));

const makeMember = (uid: number, channelId: string): MemberDto => ({
  uid,
  code: `m${uid}`,
  name: `멤버${uid}`,
  main_color: null,
  sub_color: null,
  oshi_mark: null,
  url_twitter: null,
  url_youtube: null,
  url_chzzk: `https://chzzk.naver.com/${channelId}`,
  youtube_channel_id: null,
  birth_date: null,
  debut_date: null,
  unit_name: null,
  fan_name: null,
  introduction: null,
  is_deprecated: 0,
});

describe("CHZZK media queries", () => {
  beforeEach(() => {
    fetchAllMembersClipsMock.mockReset();
    fetchAllMembersLatestVideosMock.mockReset();
    fetchAllMembersVodVideosMock.mockReset();
  });

  it("클립 초기 조회와 reload를 수행한다", async () => {
    fetchAllMembersClipsMock.mockResolvedValue([{ clipUID: "c1" }]);
    const members = [makeMember(1, "aaa")];
    const { result } = renderHook(() => useAllMembersClips(members, 7), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    expect(result.current.clips).toEqual([{ clipUID: "c1" }]);
    expect(fetchAllMembersClipsMock).toHaveBeenCalledWith(members, 7);

    await act(async () => {
      await result.current.reload();
    });
    expect(fetchAllMembersClipsMock).toHaveBeenCalledTimes(2);
  });

  it("최신 VOD 조회가 비활성화되면 요청하지 않는다", async () => {
    const members = [makeMember(1, "aaa")];
    const { result } = renderHook(
      () => useAllMembersLatestVods(members, { enabled: false }),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasLoaded).toBe(false);
    expect(fetchAllMembersLatestVideosMock).not.toHaveBeenCalled();
  });

  it("최신 VOD 조회 결과를 반환한다", async () => {
    fetchAllMembersLatestVideosMock.mockResolvedValue({ 1: { videoId: "v1" } });
    const members = [makeMember(1, "aaa")];
    const { result } = renderHook(() => useAllMembersLatestVods(members), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    expect(result.current.vods[1]).toEqual({ videoId: "v1" });
  });

  it("멤버당 VOD 조회 개수를 API에 전달한다", async () => {
    fetchAllMembersVodVideosMock.mockResolvedValue([{ videoId: "v1" }]);
    const members = [makeMember(1, "aaa")];
    const { result } = renderHook(() => useAllMembersVods(members, 8), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    expect(result.current.vods).toEqual([{ videoId: "v1" }]);
    expect(fetchAllMembersVodVideosMock).toHaveBeenCalledWith(members, 8);
  });
});
