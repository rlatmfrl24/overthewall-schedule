import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Member, ScheduleItem } from "@/lib/types";
import { fetchActiveMembers } from "./members";
import { createDDay, deleteDDay, updateDDay } from "./ddays";
import {
  createNotice,
  deleteNotice,
  fetchNotices,
  updateNotice,
} from "./notices";
import {
  createSchedule,
  deleteSchedule,
  fetchSchedulesByDate,
  fetchSchedulesInRange,
  updateSchedule,
} from "./schedules";
import { fetchKirinukiVideos } from "./kirinuki";
import {
  approveAllPendingSchedules,
  approvePendingSchedule,
  fetchPendingSchedules,
  fetchSettings,
  fetchUpdateLogs,
  rejectAllPendingSchedules,
  rejectPendingSchedule,
  runAutoUpdateNow,
  updateSettings,
} from "./settings";
import {
  fetchLiveStatusDiagnostics,
  fetchLiveStatusesForMembers,
} from "./live-status";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("./client", () => ({
  apiFetch: apiFetchMock,
}));

const makeMember = (overrides: Partial<Member> = {}) =>
  ({
    uid: 1,
    code: "member",
    name: "멤버",
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
    ...overrides,
  }) as Member;

const makeSchedule = (overrides: Partial<ScheduleItem> = {}) =>
  ({
    id: 10,
    member_uid: 1,
    date: "2026-02-13",
    start_time: "20:00",
    title: "일정",
    status: "방송",
    created_at: null,
    ...overrides,
  }) as ScheduleItem;

describe("api wrapper modules", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("활성 멤버만 필터링한다", async () => {
    apiFetchMock.mockResolvedValueOnce([
      makeMember({ uid: 1, is_deprecated: 0 }),
      makeMember({ uid: 2, is_deprecated: "1" }),
      makeMember({ uid: 3, is_deprecated: true }),
      makeMember({ uid: 4, is_deprecated: false }),
    ]);

    const result = await fetchActiveMembers();

    expect(result.map((member) => member.uid)).toEqual([1, 4]);
    expect(apiFetchMock).toHaveBeenCalledWith("/api/members");
  });

  it("dday CRUD는 올바른 경로/메서드로 요청한다", async () => {
    await createDDay({
      title: "기념일",
      date: "2026-02-13",
      type: "event",
    });
    await updateDDay({
      id: 3,
      title: "수정",
      date: "2026-02-14",
      type: "birthday",
    });
    await deleteDDay(7);

    expect(apiFetchMock).toHaveBeenNthCalledWith(1, "/api/ddays", {
      method: "POST",
      json: expect.objectContaining({ title: "기념일" }),
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, "/api/ddays", {
      method: "PUT",
      json: expect.objectContaining({ id: 3 }),
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(3, "/api/ddays?id=7", {
      method: "DELETE",
    });
  });

  it("notice CRUD는 is_active를 정규화한다", async () => {
    await fetchNotices();
    await fetchNotices({ includeInactive: true });
    await createNotice({
      content: "공지",
      type: "notice",
      is_active: 0,
    });
    await updateNotice({
      id: 9,
      content: "이벤트",
      type: "event",
      is_active: true,
    });
    await deleteNotice(9);

    expect(apiFetchMock).toHaveBeenNthCalledWith(1, "/api/notices");
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/notices?includeInactive=1",
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(3, "/api/notices", {
      method: "POST",
      json: expect.objectContaining({ is_active: "0" }),
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(4, "/api/notices", {
      method: "PUT",
      json: expect.objectContaining({ is_active: "1" }),
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(5, "/api/notices?id=9", {
      method: "DELETE",
    });
  });

  it("schedule API는 경로를 조합하고 update id 유효성을 검사한다", async () => {
    await fetchSchedulesByDate("2026-02-13");
    await fetchSchedulesInRange("2026-02-10", "2026-02-16");
    await createSchedule({
      member_uid: 1,
      date: "2026-02-13",
      status: "방송",
    });

    await expect(
      updateSchedule({
        member_uid: 1,
        date: "2026-02-13",
        status: "방송",
      }),
    ).rejects.toThrow("id is required to update schedule");

    await updateSchedule({
      id: 3,
      member_uid: 1,
      date: "2026-02-13",
      status: "방송",
    });
    await deleteSchedule(3);

    expect(apiFetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/schedules?date=2026-02-13",
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/schedules?startDate=2026-02-10&endDate=2026-02-16",
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(3, "/api/schedules", {
      method: "POST",
      json: expect.any(Object),
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(4, "/api/schedules", {
      method: "PUT",
      json: expect.objectContaining({ id: 3 }),
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(5, "/api/schedules?id=3", {
      method: "DELETE",
    });
  });

  it("kirinuki/settings API는 쿼리와 endpoint를 조합한다", async () => {
    apiFetchMock
      .mockResolvedValueOnce({ updatedAt: "", videos: [], shorts: [], byChannel: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ success: true, updated: 0, checked: 0, details: [] })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ success: true, action: "approved" })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true, approvedCount: 3 })
      .mockResolvedValueOnce({ success: true, rejectedCount: 2 });

    await fetchKirinukiVideos({ maxResults: 7 });
    await fetchSettings();
    await updateSettings({ auto_update_enabled: "1" });
    await runAutoUpdateNow();
    await fetchUpdateLogs();
    await fetchUpdateLogs({
      limit: 20,
      action: "auto_update",
      member: "멤버",
      dateFrom: "2026-02-01",
      dateTo: "2026-02-13",
      query: "검색",
    });
    await fetchPendingSchedules();
    await approvePendingSchedule(11);
    await rejectPendingSchedule(12);
    await approveAllPendingSchedules();
    await rejectAllPendingSchedules();

    expect(apiFetchMock).toHaveBeenCalledWith("/api/kirinuki/videos?maxResults=7");
    expect(apiFetchMock).toHaveBeenCalledWith("/api/settings");
    expect(apiFetchMock).toHaveBeenCalledWith("/api/settings", {
      method: "PUT",
      json: { auto_update_enabled: "1" },
    });
    expect(apiFetchMock).toHaveBeenCalledWith("/api/settings/run-now", {
      method: "POST",
    });
    expect(apiFetchMock).toHaveBeenCalledWith("/api/settings/logs?limit=50");
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/settings/logs?limit=20&action=auto_update&member=%EB%A9%A4%EB%B2%84&dateFrom=2026-02-01&dateTo=2026-02-13&query=%EA%B2%80%EC%83%89",
    );
    expect(apiFetchMock).toHaveBeenCalledWith("/api/settings/pending");
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/settings/pending/11/approve",
      { method: "POST" },
    );
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/settings/pending/12/reject",
      { method: "POST" },
    );
    expect(apiFetchMock).toHaveBeenCalledWith("/api/settings/pending/approve-all", {
      method: "POST",
    });
    expect(apiFetchMock).toHaveBeenCalledWith("/api/settings/pending/reject-all", {
      method: "POST",
    });
  });

  it("라이브 상태 API는 채널-멤버 매핑 및 진단 응답을 변환한다", async () => {
    const channelA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const channelB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const members = [
      makeMember({
        uid: 1,
        url_chzzk: `https://chzzk.naver.com/${channelA}`,
      }),
      makeMember({
        uid: 2,
        url_chzzk: `https://chzzk.naver.com/${channelB}`,
      }),
    ];
    const schedules = [
      makeSchedule({
        member_uid: 2,
        status: "방송",
        title: `외부 같이보기 https://chzzk.naver.com/live/${channelA}`,
      }),
    ];

    apiFetchMock.mockResolvedValueOnce({
      items: [{ channelId: channelA, content: { status: "OPEN" } }],
    });
    apiFetchMock.mockResolvedValueOnce({
      updatedAt: "2026-02-13T00:00:00Z",
      items: [{ channelId: channelA, content: { status: "OPEN" } }],
    });

    const statusMap = await fetchLiveStatusesForMembers(members, { schedules });
    const diagnostics = await fetchLiveStatusDiagnostics(members, { schedules });

    expect(statusMap[1]).toEqual({ status: "OPEN" });
    expect(statusMap[2]).toEqual({ status: "OPEN" });
    expect(diagnostics.channelToMembers[channelA]).toEqual([1, 2]);
    expect(diagnostics.items).toHaveLength(1);
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      1,
      `/api/live-status?channelIds=${channelA},${channelB}`,
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      `/api/live-status?channelIds=${channelA},${channelB}&debug=1`,
    );
  });
});
