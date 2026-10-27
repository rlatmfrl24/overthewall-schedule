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
const enqueueMock = vi.hoisted(() => vi.fn());

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
  enqueueMock,
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
    enqueueMock.mockReset();
    enqueueMock.mockResolvedValue({
      runId: "run-x",
      jobType: "x_collection",
      status: "queued",
      acceptedAt: 1,
      idempotencyKey: "manual:x:test",
      statusUrl: "/api/operations/runs/run-x",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("수동 수집을 비동기 operation으로 접수한다", async () => {
    const response = await handleManualXCollection(makeRequest(), env);

    expect(response.status).toBe(202);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Location")).toBe(
      "/api/operations/runs/run-x",
    );
    expect(await response.json()).toMatchObject({ runId: "run-x" });
    expect(enqueueMock).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ actorId: "admin" }),
      null,
    );
    expect(runXCollectionMock).not.toHaveBeenCalled();
  });

  it("미완료 페이지 전용 요청을 명시적으로 전달하고 잘못된 범위는 거절한다", async () => {
    const request = (scope: string) => new Request(`https://example.com/api/settings/x-collection/run-now?scope=${scope}`, {method:"POST"});
    expect((await handleManualXCollection(request("pending"), env)).status).toBe(202);
    expect(enqueueMock).toHaveBeenLastCalledWith(env, expect.anything(), null, "pending");
    expect((await handleManualXCollection(request("other"), env)).status).toBe(400);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });

  it("대기열 접수 실패를 503으로 변환한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    enqueueMock.mockRejectedValue(new Error("queue unavailable"));

    const response = await handleManualXCollection(makeRequest(), env);

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Retry-After")).toBe("60");
  });
});
