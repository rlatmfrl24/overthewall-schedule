import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Env } from "../../../platform/types";
import {
  buildXPostsApplication,
  createManualXCollectionHandler,
} from "../index";

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
const runXCollectionMock = vi.hoisted(() => vi.fn());
const insertAdminAuditLogMock = vi.hoisted(() => vi.fn());

vi.mock("../../../platform/auth", () => ({
  requireAdminUser: requireAdminUserMock,
}));
vi.mock("../../../platform/db", () => ({
  getDb: getDbMock,
}));
vi.mock("../infrastructure/x-collection", () => ({
  runXCollection: runXCollectionMock,
}));
vi.mock("../../../platform/http-helpers", () => ({
  getActorInfo: () => ({
    actorId: "admin",
    actorName: "Admin User",
    actorIp: null,
  }),
  insertAdminAuditLog: insertAdminAuditLogMock,
}));

const env = { otw_db: {} as D1Database } as Env;
const handleManualXCollection = createManualXCollectionHandler(
  buildXPostsApplication,
);
const makeRequest = () =>
  new Request("https://example.com/api/settings/x-collection/run-now", {
    method: "POST",
  });

describe("manual X collection handler", () => {
  beforeEach(() => {
    requireAdminUserMock.mockReset();
    requireAdminUserMock.mockResolvedValue({
      ok: true,
      user: { id: "admin", displayName: "Admin User" },
    });
    runXCollectionMock.mockReset();
    insertAdminAuditLogMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("수동 수집 결과와 성공 감사 로그 계약을 보존한다", async () => {
    const result = {
      status: "success",
      checkedHandles: 4,
      refreshedHandles: 3,
      postsReturned: 9,
      postsStored: 8,
      apiCalls: 3,
      estimatedCostMicros: 1200,
      error: null,
      updatedAt: "2026-07-28T00:00:00.000Z",
    };
    runXCollectionMock.mockResolvedValue(result);

    const response = await handleManualXCollection(makeRequest(), env);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual(result);
    expect(runXCollectionMock).toHaveBeenCalledWith(env, "manual");
    expect(insertAdminAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: "manual_collection.x",
        status: "success",
        targetCount: 4,
        successCount: 3,
      }),
    );
  });

  it("예외를 실패 payload와 감사 로그로 변환한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    runXCollectionMock.mockRejectedValue(new Error("rate limited"));

    const response = await handleManualXCollection(makeRequest(), env);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toMatchObject({
      success: false,
      status: "failed",
      error: "rate limited",
      apiCalls: 0,
    });
    expect(insertAdminAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: "failed",
        failureCount: 1,
        error: "rate limited",
      }),
    );
  });
});
