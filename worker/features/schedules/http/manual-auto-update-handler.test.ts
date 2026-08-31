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
const enqueueMock = vi.hoisted(() => vi.fn());

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
  enqueueMock,
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
    enqueueMock.mockReset();
    enqueueMock.mockResolvedValue({
      runId: "run-auto",
      jobType: "schedule_auto_update",
      status: "queued",
      acceptedAt: 1,
      idempotencyKey: "manual:auto:test",
      statusUrl: "/api/operations/runs/run-auto",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("수동 실행을 비동기 operation으로 접수한다", async () => {
    const response = await handleManualAutoUpdate(makeRequest(), env);

    expect(response.status).toBe(202);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ runId: "run-auto" });
    expect(enqueueMock).toHaveBeenCalledOnce();
    expect(runAutoUpdateWithHistoryMock).not.toHaveBeenCalled();
  });

  it("대기열 접수 실패 시 503을 반환한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    enqueueMock.mockRejectedValue(new Error("queue unavailable"));

    const response = await handleManualAutoUpdate(makeRequest(), env);

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("Scheduled operations queue unavailable");
  });
});
