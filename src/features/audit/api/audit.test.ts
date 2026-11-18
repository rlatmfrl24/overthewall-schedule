import { beforeEach, expect, it, vi } from "vitest";
import { fetchAdminAuditLogs, fetchUpdateLogs } from "./audit";
const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api/client", () => ({ apiFetch: apiFetchMock }));
beforeEach(() => apiFetchMock.mockReset());
it("reads the first audit-log page without caching", async () => {
    apiFetchMock.mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        pageSize: 50,
        totalPages: 1,
        hasPrevPage: false,
        hasNextPage: false,
    });
    await fetchAdminAuditLogs();
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/settings/audit-logs?page=1&pageSize=50", { cache: "no-store" });
});
it("reads update logs with default pagination", async () => {
    apiFetchMock.mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        pageSize: 50,
        totalPages: 1,
        hasPrevPage: false,
        hasNextPage: false,
    });
    await fetchUpdateLogs();
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/settings/logs?page=1&pageSize=50&sort=created_desc", { cache: "no-store" });
});
it("passes explicit update-log pagination and order", async () => {
    apiFetchMock.mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 2,
        pageSize: 20,
        totalPages: 1,
        hasPrevPage: true,
        hasNextPage: false,
    });
    await fetchUpdateLogs({
        page: 2,
        pageSize: 20,
        sort: "created_desc",
    });
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith("/api/settings/logs?page=2&pageSize=20&sort=created_desc", { cache: "no-store" });
});
