import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import { UpdateLogService } from "../application/update-log-service";
import { createUpdateLogHandler } from "./update-log-handler";

type AdminResult =
  | { ok: true; user: { id: string } }
  | { ok: false; response: Response };

const requireAdminUserMock = vi.hoisted(() =>
  vi.fn(async (): Promise<AdminResult> => ({
    ok: true,
    user: { id: "admin" },
  })),
);
const readUpdateLogsMock = vi.hoisted(() => vi.fn());
const deleteUpdateLogMock = vi.hoisted(() => vi.fn());

vi.mock("../../../platform/auth", () => ({
  requireAdminUser: requireAdminUserMock,
}));
const env = {} as Env;
const handleUpdateLogs = createUpdateLogHandler(
  () =>
    new UpdateLogService({
      read: readUpdateLogsMock,
      delete: deleteUpdateLogMock,
    }),
);

describe("update log handler", () => {
  beforeEach(() => {
    requireAdminUserMock.mockReset();
    requireAdminUserMock.mockResolvedValue({
      ok: true,
      user: { id: "admin" },
    });
    readUpdateLogsMock.mockReset();
    readUpdateLogsMock.mockResolvedValue([{ id: 1 }]);
    deleteUpdateLogMock.mockReset();
    deleteUpdateLogMock.mockResolvedValue(undefined);
  });

  it("legacy limit 조회 계약과 no-store 응답을 보존한다", async () => {
    const response = await handleUpdateLogs(
      new Request(
        "https://example.com/api/settings/logs?limit=5000&sort=invalid",
      ),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(readUpdateLogsMock).toHaveBeenCalledWith({
      limit: 1000,
      page: null,
      pageSize: null,
      sort: "created_desc",
    });
    expect(await response.json()).toEqual([{ id: 1 }]);
  });

  it("paged 조회 범위와 sort를 정규화한다", async () => {
    readUpdateLogsMock.mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      pageSize: 200,
      totalPages: 1,
      hasPrevPage: false,
      hasNextPage: false,
    });
    const response = await handleUpdateLogs(
      new Request(
        "https://example.com/api/settings/logs?page=0&pageSize=999&sort=schedule_asc",
      ),
      env,
    );

    expect(response.status).toBe(200);
    expect(readUpdateLogsMock).toHaveBeenCalledWith({
      limit: 50,
      page: 1,
      pageSize: 200,
      sort: "schedule_asc",
    });
  });

  it("strict log ID를 검증한 뒤 해당 로그만 삭제한다", async () => {
    const invalid = await handleUpdateLogs(
      new Request("https://example.com/api/settings/logs/12abc", {
        method: "DELETE",
      }),
      env,
    );
    const valid = await handleUpdateLogs(
      new Request("https://example.com/api/settings/logs/12", {
        method: "DELETE",
      }),
      env,
    );

    expect(invalid.status).toBe(400);
    expect(await invalid.text()).toBe("Invalid log ID");
    expect(valid.status).toBe(200);
    expect(valid.headers.get("Cache-Control")).toBe("no-store");
    expect(deleteUpdateLogMock).toHaveBeenCalledTimes(1);
    expect(deleteUpdateLogMock).toHaveBeenCalledWith(12);
  });
});
