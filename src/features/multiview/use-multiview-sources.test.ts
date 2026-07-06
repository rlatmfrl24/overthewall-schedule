// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import type { Member } from "@/lib/types";
import type { MultiviewSource } from "./types";

const fetchLiveStatusesForMembersMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/live-status", () => ({
  fetchLiveStatusesForMembers: fetchLiveStatusesForMembersMock,
}));

import {
  MULTIVIEW_LIVE_STATUS_REFRESH_INTERVAL_MS,
  sortMultiviewSources,
  useMultiviewSources,
} from "./use-multiview-sources";

const CHANNEL_A = "29a1ed5c0829fa620fab900dba7e011b";

const makeSource = (
  name: string,
  unitName: string | null,
  isLive = false,
): MultiviewSource => ({
  channelId: name.padEnd(32, "0").slice(0, 32),
  isLive,
  liveStatus: isLive
    ? ({
        status: "OPEN",
        liveTitle: `${name} live`,
        channelName: name,
      } as MultiviewSource["liveStatus"])
    : null,
  member: {
    uid: name.length,
    code: name,
    name,
    main_color: null,
    sub_color: null,
    oshi_mark: null,
    url_twitter: null,
    url_youtube: null,
    url_chzzk: null,
    youtube_channel_id: null,
    birth_date: null,
    debut_date: null,
    unit_name: unitName,
    fan_name: null,
    introduction: null,
    is_deprecated: 0,
  } as Member,
});

const makeMember = (uid: number, name: string, channelId: string): Member =>
  ({
    uid,
    code: `m${uid}`,
    name,
    main_color: null,
    sub_color: null,
    oshi_mark: null,
    url_twitter: null,
    url_youtube: null,
    url_chzzk: `https://chzzk.naver.com/${channelId}`,
    youtube_channel_id: null,
    birth_date: null,
    debut_date: null,
    unit_name: "스타데이즈",
    fan_name: null,
    introduction: null,
    is_deprecated: 0,
  }) as Member;

describe("sortMultiviewSources", () => {
  it("places live sources first, then Stardays, Luvdia, and Hiblueming members", () => {
    const sorted = sortMultiviewSources([
      makeSource("하이블루밍 오프라인", "HiBlueming"),
      makeSource("러브다이아 라이브", "LUV DIA", true),
      makeSource("기타 오프라인", "OTW"),
      makeSource("러브다이아 오프라인", "러브다이아"),
      makeSource("스타데이즈 오프라인", "스타데이즈"),
      makeSource("하이블루밍 라이브", "하이블루밍", true),
    ]);

    expect(sorted.map((source) => source.member?.name)).toEqual([
      "러브다이아 라이브",
      "하이블루밍 라이브",
      "스타데이즈 오프라인",
      "러브다이아 오프라인",
      "하이블루밍 오프라인",
      "기타 오프라인",
    ]);
  });
});

describe("useMultiviewSources", () => {
  beforeEach(() => {
    fetchLiveStatusesForMembersMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("refreshes member live status on a bounded interval while multiview is mounted", async () => {
    vi.useFakeTimers();
    const member = makeMember(1, "유리리", CHANNEL_A);

    fetchLiveStatusesForMembersMock
      .mockResolvedValueOnce({ [member.uid]: null })
      .mockResolvedValueOnce({
        [member.uid]: {
          status: "OPEN",
          liveTitle: "라이브 시작",
          channelName: "유리리",
          channelId: CHANNEL_A,
          concurrentUserCount: 100,
        },
      });

    const { result } = renderHook(() => useMultiviewSources([member]), {
      wrapper: createQueryWrapper(),
    });

    await vi.waitFor(() =>
      expect(fetchLiveStatusesForMembersMock).toHaveBeenCalledTimes(1),
    );
    await vi.waitFor(() => expect(result.current.hasLoaded).toBe(true));
    expect(result.current.sources[0]?.isLive).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        MULTIVIEW_LIVE_STATUS_REFRESH_INTERVAL_MS,
      );
    });

    await vi.waitFor(() =>
      expect(fetchLiveStatusesForMembersMock).toHaveBeenCalledTimes(2),
    );
    await vi.waitFor(() => expect(result.current.sources[0]?.isLive).toBe(true));
    expect(result.current.sources[0]?.liveStatus?.liveTitle).toBe(
      "라이브 시작",
    );
    expect(fetchLiveStatusesForMembersMock).toHaveBeenLastCalledWith([member]);
  });
});
