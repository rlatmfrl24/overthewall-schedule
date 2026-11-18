import { beforeEach, expect, it, vi } from "vitest";
import { approveAllPendingSchedules, approvePendingSchedule, approveSelectedPendingSchedules, applyPendingScheduleToEmptyTarget, fetchPendingSchedules, fetchScheduleCandidateRejections, rejectAllPendingSchedules, rejectPendingSchedule, rejectSelectedPendingSchedules, reopenScheduleCandidateRejection, resetPendingScheduleProcessed } from "./pending-schedules";
const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api/client", () => ({ apiFetch: apiFetchMock }));
beforeEach(() => apiFetchMock.mockReset());
it("sends per-candidate edits in one existing approval request", async () => {
    apiFetchMock.mockResolvedValue({ success: true, results: [] });
    const optionsById = { "1": { applyMode: "title" as const, targetMode: "create" as const, timeMode: "nearest_half_hour" as const, changes: { title: "수정 제목" } } };
    await approveSelectedPendingSchedules([1], optionsById);
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/settings/pending/actions", { method: "POST", json: { action: "approve", ids: [1], optionsById } });
});
it("pending 단건 action helper는 batch 내부 실패를 예외로 전파한다", async () => {
    apiFetchMock.mockResolvedValueOnce({
        success: false,
        totalRequested: 1,
        successCount: 0,
        failedCount: 1,
        results: [
            {
                id: 11,
                success: false,
                error: "conflict",
                message: "이미 비슷한 시간에 스케줄이 존재합니다.",
            },
        ],
    });
    await expect(approvePendingSchedule(11)).rejects.toThrow("이미 비슷한 시간에 스케줄이 존재합니다.");
    expect(apiFetchMock).toHaveBeenCalledWith("/api/settings/pending/actions", {
        method: "POST",
        json: { action: "approve", ids: [11] },
    });
});
it("reads pending schedules without caching", async () => {
    apiFetchMock.mockResolvedValueOnce([]);
    await fetchPendingSchedules();
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/settings/pending", {
        cache: "no-store",
    });
});
it("approves one pending schedule through the batch boundary", async () => {
    apiFetchMock.mockResolvedValueOnce({
        success: true,
        totalRequested: 1,
        successCount: 1,
        failedCount: 0,
        results: [{ id: 11, success: true, action: "create", scheduleId: 11 }],
    });
    await approvePendingSchedule(11);
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/settings/pending/actions", { method: "POST", json: { action: "approve", ids: [11] } });
});
it("passes the selected schedule, time and apply options", async () => {
    apiFetchMock.mockResolvedValueOnce({
        success: true,
        totalRequested: 1,
        successCount: 1,
        failedCount: 0,
        results: [{ id: 16, success: true, action: "update", scheduleId: 16 }],
    });
    await approvePendingSchedule(16, {
        applyMode: "time",
        targetMode: "update",
        timeMode: "nearest_half_hour",
        targetScheduleId: 160,
    });
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/settings/pending/actions", {
        method: "POST",
        json: {
            action: "approve",
            ids: [16],
            options: {
                applyMode: "time",
                targetMode: "update",
                timeMode: "nearest_half_hour",
                targetScheduleId: 160,
            },
        },
    });
});
it("applies a pending schedule only to an empty target", async () => {
    apiFetchMock.mockResolvedValueOnce({ success: true, scheduleId: 15 });
    await applyPendingScheduleToEmptyTarget(15);
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/settings/pending/15/apply-empty-target", { method: "POST" });
});
it("resets the processed state of one candidate", async () => {
    apiFetchMock.mockResolvedValueOnce({
        success: true,
        totalRequested: 1,
        successCount: 1,
        failedCount: 0,
        results: [
            {
                id: 17,
                success: true,
                resetAt: "2026-05-27T00:00:00.000Z",
            },
        ],
    });
    await resetPendingScheduleProcessed(17);
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/settings/pending/actions", { method: "POST", json: { action: "reset_processed", ids: [17] } });
});
it("rejects one candidate with an internal reason", async () => {
    apiFetchMock.mockResolvedValueOnce({
        success: true,
        totalRequested: 1,
        successCount: 1,
        failedCount: 0,
        results: [{ id: 12, success: true, action: "reject" }],
    });
    await rejectPendingSchedule(12, {
        reasonCode: "duplicate",
        reasonNote: "중복 수집",
    });
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/settings/pending/actions", {
        method: "POST",
        json: {
            action: "reject",
            ids: [12],
            reasonCode: "duplicate",
            reasonNote: "중복 수집",
        },
    });
});
it("approves the selected candidates together", async () => {
    apiFetchMock.mockResolvedValueOnce({
        success: true,
        totalRequested: 2,
        successCount: 2,
        failedCount: 0,
        results: [],
    });
    await approveSelectedPendingSchedules([11, 13]);
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/settings/pending/actions", { method: "POST", json: { action: "approve", ids: [11, 13] } });
});
it("rejects selected candidates with one reason", async () => {
    apiFetchMock.mockResolvedValueOnce({
        success: true,
        totalRequested: 2,
        successCount: 2,
        failedCount: 0,
        results: [],
    });
    await rejectSelectedPendingSchedules([12, 14], {
        reasonCode: "already_reflected",
    });
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/settings/pending/actions", {
        method: "POST",
        json: {
            action: "reject",
            ids: [12, 14],
            reasonCode: "already_reflected",
        },
    });
});
it("preserves skipped results when approving all candidates", async () => {
    apiFetchMock.mockResolvedValueOnce({
        success: true,
        approvedCount: 3,
        skippedCount: 1,
        skippedItems: [{ id: 99, reason: "conflict" }],
    });
    const approveAllResult = await approveAllPendingSchedules();
    expect(approveAllResult.skippedCount).toBe(1);
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/settings/pending/actions", { method: "POST", json: { action: "approve", mode: "all" } });
});
it("rejects all candidates through one batch request", async () => {
    apiFetchMock.mockResolvedValueOnce({ success: true, rejectedCount: 2 });
    await rejectAllPendingSchedules();
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/settings/pending/actions", { method: "POST", json: { action: "reject", mode: "all" } });
});
it("encodes rejection search, dates and pagination", async () => {
    await fetchScheduleCandidateRejections({
        search: "테스트",
        reasonCode: "duplicate",
        rejectedFrom: "2026-07-01",
        rejectedTo: "2026-07-29",
        page: 2,
        pageSize: 20,
    });
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/settings/pending/rejections?page=2&pageSize=20&search=%ED%85%8C%EC%8A%A4%ED%8A%B8&reasonCode=duplicate&rejectedFrom=2026-07-01&rejectedTo=2026-07-29", { cache: "no-store" });
});
it("reopens the selected rejected candidate", async () => {
    await reopenScheduleCandidateRejection(31);
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/settings/pending/rejections/31/reopen", { method: "POST" });
});
