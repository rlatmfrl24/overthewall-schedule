import { createMemberFixture } from "@/test/member-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchLiveStatusDiagnostics, fetchLiveStatusesForMembers } from "./live-status";
import type { MemberDto } from "@contracts/members";
import type { ScheduleDto } from "@contracts/schedules";
const apiFetchMock = vi.hoisted(() => vi.fn());
beforeEach(() => apiFetchMock.mockReset());
vi.mock("@/shared/api/client", () => ({
    apiFetch: apiFetchMock,
}));
const channelId = "a".repeat(32);
const makeMember = (uid: number, urlChzzk: string | null): MemberDto => (createMemberFixture({
    uid,
    code: `member-${uid}`,
    name: `멤버 ${uid}`,
    url_chzzk: urlChzzk
}));
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
        const { fetchLiveStatusesForMembersWithMeta } = await import("./live-status");
        const result = await fetchLiveStatusesForMembersWithMeta([
            makeMember(1, `https://chzzk.naver.com/${channelId}`),
        ]);
        expect(apiFetchMock).toHaveBeenCalledWith(`/api/live-status?channelIds=${channelId}&cacheVersion=2`);
        expect(result.statuses[1]?.status).toBe("OPEN");
    });
    it("관리자 자동 입력 command에 정규화된 채널 목록을 전달한다", async () => {
        apiFetchMock.mockResolvedValue({
            updatedAt: "2026-07-28T00:00:00.000Z",
            checkedChannelCount: 1,
            scheduleAutoFill: { updated: 1 },
        });
        const { autoFillLiveSchedulesForMembers } = await import("./live-status");
        const result = await autoFillLiveSchedulesForMembers([
            makeMember(1, `https://chzzk.naver.com/${channelId}`),
            makeMember(2, `https://chzzk.naver.com/${channelId}`),
        ], {
            schedules: [makeSchedule(`https://chzzk.naver.com/${channelId}`)],
            snapshotVersion: "v1-test",
        });
        expect(apiFetchMock).toHaveBeenCalledWith("/api/operations/live-schedule/auto-fill", {
            method: "POST",
            json: { channelIds: [channelId], snapshotVersion: "v1-test" },
        });
        expect(result.scheduleAutoFill.updated).toBe(1);
    });
    it("대상 채널이 없으면 command를 호출하지 않는다", async () => {
        const { autoFillLiveSchedulesForMembers } = await import("./live-status");
        const result = await autoFillLiveSchedulesForMembers([makeMember(1, null)], { snapshotVersion: "v1-empty" });
        expect(apiFetchMock).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            checkedChannelCount: 0,
            scheduleAutoFill: { updated: 0 },
        });
    });
});
it("라이브 상태 API는 채널-멤버 매핑 및 진단 응답을 변환한다", async () => {
    const channelA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const channelB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const members = [
        createMemberFixture({
            uid: 1,
            url_chzzk: `https://chzzk.naver.com/${channelA}`,
        }),
        createMemberFixture({
            uid: 2,
            url_chzzk: `https://chzzk.naver.com/${channelB}`,
        }),
    ];
    const schedules: ScheduleDto[] = [
        ({ id: 10, date: "2026-02-13", start_time: "20:00", created_at: null,
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
    expect(apiFetchMock).toHaveBeenNthCalledWith(1, `/api/live-status?channelIds=${channelA},${channelB}&cacheVersion=2`);
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, `/api/live-status?channelIds=${channelA},${channelB}&cacheVersion=2&debug=1`);
});
