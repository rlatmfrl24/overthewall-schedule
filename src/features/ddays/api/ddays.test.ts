import { beforeEach, expect, it, vi } from "vitest";
import { createDDay, deleteDDay, fetchDDays, updateDDay } from "./ddays";
const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api/client", () => ({ apiFetch: apiFetchMock }));
beforeEach(() => apiFetchMock.mockReset());
it("reads uncached D-Days", async () => {
    await fetchDDays({ noCache: true });
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/ddays?noCache=1", { cache: "no-store" });
});
it("creates a D-Day", async () => {
    await createDDay({
        title: "기념일",
        date: "2026-02-13",
        type: "event",
    });
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/ddays", {
        method: "POST",
        json: expect.objectContaining({ title: "기념일" }),
    });
});
it("updates a D-Day", async () => {
    await updateDDay({
        id: 3,
        title: "수정",
        date: "2026-02-14",
        type: "birthday",
    });
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/ddays", {
        method: "PUT",
        json: expect.objectContaining({ id: 3 }),
    });
});
it("deletes the selected D-Day", async () => {
    await deleteDDay(7);
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/ddays?id=7", {
        method: "DELETE",
    });
});
