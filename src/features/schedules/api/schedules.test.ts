import { beforeEach, expect, it, vi } from "vitest";
import { createSchedule, deleteSchedule, fetchSchedulesByDate, fetchSchedulesInRange, saveSchedule, updateSchedule } from "./schedules";
const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api/client", () => ({ apiFetch: apiFetchMock }));
beforeEach(() => apiFetchMock.mockReset());
it("reads schedules by date", async () => {
    await fetchSchedulesByDate("2026-02-13");
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/schedules?date=2026-02-13", { cache: "no-store" });
});
it("reads schedules in a date range", async () => {
    await fetchSchedulesInRange("2026-02-10", "2026-02-16");
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/schedules?startDate=2026-02-10&endDate=2026-02-16", { cache: "no-store" });
});
it("creates a schedule", async () => {
    await createSchedule({
        member_uid: 1,
        date: "2026-02-13",
        status: "방송",
    });
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/schedules", {
        method: "POST",
        json: expect.any(Object),
    });
});
it("saves a closed schedule", async () => {
    await saveSchedule({
        member_uid: 1,
        date: "2026-02-13",
        status: "휴방",
    });
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/schedules/save", {
        method: "POST",
        json: expect.objectContaining({ status: "휴방" }),
    });
});
it("updates the selected schedule", async () => {
    await updateSchedule({
        id: 3,
        member_uid: 1,
        date: "2026-02-13",
        status: "방송",
    });
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/schedules", {
        method: "PUT",
        json: expect.objectContaining({ id: 3 }),
    });
});
it("deletes the selected schedule", async () => {
    await deleteSchedule(3);
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/schedules?id=3", {
        method: "DELETE",
    });
});
it("rejects an update without an id before sending a request", async () => {
    await expect(updateSchedule({
        member_uid: 1,
        date: "2026-02-13",
        status: "방송",
    })).rejects.toThrow("id is required to update schedule");
    expect(apiFetchMock).not.toHaveBeenCalled();
});
