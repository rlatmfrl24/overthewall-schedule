import { createMemberFixture } from "@/test/member-fixtures";
// @vitest-environment jsdom
import { createQueryWrapper } from "@/test/query-client";
import type { MemberDto } from "@contracts/members";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAllMembersClips } from "./use-chzzk-clips";
import {
  useAllMembersVods,
} from "./use-chzzk-vods";

const fetchAllMembersClipsMock = vi.hoisted(() => vi.fn());
const fetchAllMembersVodVideosMock = vi.hoisted(() => vi.fn());

vi.mock("../api/clips", () => ({
  fetchAllMembersClips: fetchAllMembersClipsMock,
}));

vi.mock("../api/vods", () => ({
  fetchAllMembersVodVideos: fetchAllMembersVodVideosMock,
}));

const makeMember = (uid: number, channelId: string): MemberDto => (createMemberFixture({
    uid,
    code: `m${uid}`,
    name: `멤버${uid}`,
    url_chzzk: `https://chzzk.naver.com/${channelId}`
  }));

describe("CHZZK media queries", () => {
  beforeEach(() => {
    fetchAllMembersClipsMock.mockReset();
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
