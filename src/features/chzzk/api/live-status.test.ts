import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberDto } from "@contracts/members";
import type { ScheduleDto } from "@contracts/schedules";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/client", () => ({
  apiFetch: apiFetchMock,
}));

const channelId = "a".repeat(32);

const makeMember = (uid: number, urlChzzk: string | null): MemberDto => ({
  uid,
  code: `member-${uid}`,
  name: `멤버 ${uid}`,
  main_color: null,
  sub_color: null,
  oshi_mark: null,
  url_twitter: null,
  url_youtube: null,
  url_chzzk: urlChzzk,
  youtube_channel_id: null,
  birth_date: null,
  debut_date: null,
  unit_name: null,
  fan_name: null,
  introduction: null,
  is_deprecated: 0,
});

const makeSchedule = (title: string): ScheduleDto => ({
  id: 1,
  member_uid: 1,
  date: "2026-07-28",
  start_time: null,
  title,
  status: "방송",
  created_at: null,
});

describe("live status api", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("공개 조회는 이전 브라우저 캐시와 분리된 버전 URL을 사용한다", async () => {
    apiFetchMock.mockResolvedValue({
      snapshotVersion: "v1-test",
      items: [
        {
          channelId,
          content: { status: "OPEN" },
        },
      ],
      scheduleAutoFill: { updated: 0 },
    });
    const { fetchLiveStatusesForMembersWithMeta } = await import(
      "./live-status"
    );

    const result = await fetchLiveStatusesForMembersWithMeta([
      makeMember(1, `https://chzzk.naver.com/${channelId}`),
    ]);

    expect(apiFetchMock).toHaveBeenCalledWith(
      `/api/live-status?channelIds=${channelId}&cacheVersion=2`,
    );
    expect(result.statuses[1]?.status).toBe("OPEN");
  });

  it("관리자 자동 입력 command에 정규화된 채널 목록을 전달한다", async () => {
    apiFetchMock.mockResolvedValue({
      updatedAt: "2026-07-28T00:00:00.000Z",
      checkedChannelCount: 1,
      scheduleAutoFill: { updated: 1 },
    });
    const { autoFillLiveSchedulesForMembers } = await import("./live-status");

    const result = await autoFillLiveSchedulesForMembers(
      [
        makeMember(1, `https://chzzk.naver.com/${channelId}`),
        makeMember(2, `https://chzzk.naver.com/${channelId}`),
      ],
      {
        schedules: [makeSchedule(`https://chzzk.naver.com/${channelId}`)],
        snapshotVersion: "v1-test",
      },
    );

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/operations/live-schedule/auto-fill",
      {
        method: "POST",
        json: { channelIds: [channelId], snapshotVersion: "v1-test" },
      },
    );
    expect(result.scheduleAutoFill.updated).toBe(1);
  });

  it("대상 채널이 없으면 command를 호출하지 않는다", async () => {
    const { autoFillLiveSchedulesForMembers } = await import("./live-status");

    const result = await autoFillLiveSchedulesForMembers(
      [makeMember(1, null)],
      { snapshotVersion: "v1-empty" },
    );

    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      checkedChannelCount: 0,
      scheduleAutoFill: { updated: 0 },
    });
  });
});
