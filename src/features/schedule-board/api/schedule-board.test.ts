import { beforeEach, expect, it, vi } from "vitest";
import { fetchScheduleBoard } from "./schedule-board";
const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api/client", () => ({ apiFetch: apiFetchMock }));
beforeEach(() => apiFetchMock.mockReset());
it("requests the board date range without caching", async () => {
    await fetchScheduleBoard("2026-02-10", "2026-02-16");
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/schedule-board?startDate=2026-02-10&endDate=2026-02-16", { cache: "no-store" });
});
