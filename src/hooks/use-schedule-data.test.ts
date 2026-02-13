// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DDayItem, Member } from "@/lib/types";

const fetchActiveMembersMock = vi.hoisted(() => vi.fn());
const fetchDDaysMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/members", () => ({
  fetchActiveMembers: fetchActiveMembersMock,
}));

vi.mock("@/lib/api/ddays", () => ({
  fetchDDays: fetchDDaysMock,
}));

const makeMember = (uid: number): Member =>
  ({
    uid,
    code: `m${uid}`,
    name: `멤버${uid}`,
    main_color: null,
    sub_color: null,
    oshi_mark: null,
    url_twitter: null,
    url_youtube: null,
    url_chzzk: null,
    youtube_channel_id: null,
    birth_date: null,
    debut_date: null,
    unit_name: null,
    fan_name: null,
    introduction: null,
    is_deprecated: 0,
  }) as Member;

const makeDday = (id: number): DDayItem =>
  ({
    id,
    title: `기념일${id}`,
    date: "2026-02-13",
    description: null,
    color: null,
    type: "event",
    created_at: null,
  }) as DDayItem;

describe("useScheduleData", () => {
  beforeEach(() => {
    fetchActiveMembersMock.mockReset();
    fetchDDaysMock.mockReset();
    vi.resetModules();
  });

  it("초기 로드 후 fresh cache이면 reloadAll에서 API를 재호출하지 않는다", async () => {
    fetchActiveMembersMock.mockResolvedValueOnce([makeMember(1)]);
    fetchDDaysMock.mockResolvedValueOnce([makeDday(1)]);

    const { useScheduleData } = await import("./use-schedule-data");
    const { result } = renderHook(() => useScheduleData());

    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    expect(result.current.members.map((member) => member.uid)).toEqual([1]);
    expect(result.current.ddays.map((dday) => dday.id)).toEqual([1]);
    expect(fetchActiveMembersMock).toHaveBeenCalledTimes(1);
    expect(fetchDDaysMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.reloadAll();
    });

    expect(fetchActiveMembersMock).toHaveBeenCalledTimes(1);
    expect(fetchDDaysMock).toHaveBeenCalledTimes(1);
  });

  it("reloadMembers/reloadDDays는 최신 데이터를 갱신한다", async () => {
    fetchActiveMembersMock
      .mockResolvedValueOnce([makeMember(1)])
      .mockResolvedValueOnce([makeMember(2)]);
    fetchDDaysMock
      .mockResolvedValueOnce([makeDday(1)])
      .mockResolvedValueOnce([makeDday(2)]);

    const { useScheduleData } = await import("./use-schedule-data");
    const { result } = renderHook(() => useScheduleData());

    await waitFor(() => expect(result.current.hasLoaded).toBe(true));

    await act(async () => {
      await result.current.reloadMembers();
      await result.current.reloadDDays();
    });

    expect(result.current.members.map((member) => member.uid)).toEqual([2]);
    expect(result.current.ddays.map((dday) => dday.id)).toEqual([2]);
    expect(fetchActiveMembersMock).toHaveBeenCalledTimes(2);
    expect(fetchDDaysMock).toHaveBeenCalledTimes(2);
  });
});
