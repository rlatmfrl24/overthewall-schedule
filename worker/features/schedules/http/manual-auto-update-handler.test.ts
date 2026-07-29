import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Env } from "../../../platform/types";
import { ManualAutoUpdateService } from "../application/manual-auto-update-service";
import { D1ManualAutoUpdateAdapter } from "../infrastructure/manual-auto-update-adapter";
import { createManualAutoUpdateHandler } from "./manual-auto-update-handler";

type AdminResult =
  | { ok: true; user: { id: string; displayName: string } }
  | { ok: false; response: Response };

const requireAdminUserMock = vi.hoisted(() =>
  vi.fn(async (): Promise<AdminResult> => ({
    ok: true,
    user: { id: "admin", displayName: "Admin User" },
  })),
);
const getDbMock = vi.hoisted(() => vi.fn(() => ({ id: "db" })));
const readAutoUpdateRangeDaysMock = vi.hoisted(() => vi.fn());
const runAutoUpdateWithHistoryMock = vi.hoisted(() => vi.fn());
const insertAdminAuditLogMock = vi.hoisted(() => vi.fn());
const insertUpdateLogMock = vi.hoisted(() => vi.fn());

vi.mock("../../../platform/auth", () => ({
  requireAdminUser: requireAdminUserMock,
}));
vi.mock("../../../platform/db", () => ({
  getDb: getDbMock,
}));
vi.mock("../infrastructure/auto-update-settings", () => ({
  readAutoUpdateRangeDays: readAutoUpdateRangeDaysMock,
}));
vi.mock("../infrastructure/auto-update-runs", () => ({
  runAutoUpdateWithHistory: runAutoUpdateWithHistoryMock,
}));
vi.mock("../../../platform/http-helpers", () => ({
  getActorInfo: () => ({
    actorId: "admin",
    actorName: "Admin User",
    actorIp: null,
  }),
  insertAdminAuditLog: insertAdminAuditLogMock,
  insertUpdateLog: insertUpdateLogMock,
}));

const env = { otw_db: {} as D1Database } as Env;
const handleManualAutoUpdate = createManualAutoUpdateHandler(
  (currentEnv) =>
    new ManualAutoUpdateService(
      new D1ManualAutoUpdateAdapter(
        getDbMock() as never,
        currentEnv.otw_db,
      ),
    ),
);
const makeRequest = () =>
  new Request("https://example.com/api/settings/run-now", {
    method: "POST",
  });

describe("manual auto-update handler", () => {
  beforeEach(() => {
    requireAdminUserMock.mockReset();
    requireAdminUserMock.mockResolvedValue({
      ok: true,
      user: { id: "admin", displayName: "Admin User" },
    });
    readAutoUpdateRangeDaysMock.mockReset();
    readAutoUpdateRangeDaysMock.mockResolvedValue("5");
    runAutoUpdateWithHistoryMock.mockReset();
    insertAdminAuditLogMock.mockReset();
    insertUpdateLogMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("수동 실행 결과와 성공 감사 로그 계약을 보존한다", async () => {
    runAutoUpdateWithHistoryMock.mockResolvedValue({
      checked: 4,
      updated: 2,
      rejectedSuppressed: 3,
      duplicatePending: 1,
      details: [{ id: 1 }],
    });

    const response = await handleManualAutoUpdate(makeRequest(), env);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      success: true,
      updated: 2,
      checked: 4,
      rejectedSuppressed: 3,
      duplicatePending: 1,
      details: [{ id: 1 }],
    });
    expect(runAutoUpdateWithHistoryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        source: "manual",
        rangeDays: 5,
        cacheDb: env.otw_db,
      }),
    );
    expect(insertAdminAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: "manual_collection.auto_update",
        status: "success",
        targetCount: 4,
        successCount: 2,
        detail: expect.objectContaining({
          rejectedSuppressed: 3,
          duplicatePending: 1,
        }),
      }),
    );
  });

  it("실패 시 update log와 실패 감사 로그를 남기고 500을 반환한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    runAutoUpdateWithHistoryMock.mockRejectedValue(new Error("origin failed"));

    const response = await handleManualAutoUpdate(makeRequest(), env);

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("Auto update failed");
    expect(insertUpdateLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "auto_failed", actorId: "admin" }),
    );
    expect(insertAdminAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: "failed",
        error: "origin failed",
      }),
    );
  });
});
