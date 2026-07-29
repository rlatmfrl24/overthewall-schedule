import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import { createHandleAdminAuditLogs } from "./admin-audit-handler";
import type { AdminAuditLogReader } from "../application/ports/admin-audit-log-reader";

type AdminResult =
  | { ok: true; user: { id: string } }
  | { ok: false; response: Response };

const requireAdminUserMock = vi.hoisted(() =>
  vi.fn(async (): Promise<AdminResult> => ({
    ok: true,
    user: { id: "admin" },
  })),
);
const readPageMock = vi.hoisted(() => vi.fn());

vi.mock("../../../platform/auth", () => ({
  requireAdminUser: requireAdminUserMock,
}));
const env = {} as Env;
const reader = { readPage: readPageMock } as AdminAuditLogReader;
const handleAdminAuditLogs = createHandleAdminAuditLogs(() => reader);

describe("admin audit log handler", () => {
  beforeEach(() => {
    requireAdminUserMock.mockReset();
    requireAdminUserMock.mockResolvedValue({
      ok: true,
      user: { id: "admin" },
    });
    readPageMock.mockReset();
    readPageMock.mockResolvedValue({
      items: [{ id: 1 }],
      total: 1,
      page: 1,
      pageSize: 200,
      totalPages: 1,
      hasPrevPage: false,
      hasNextPage: false,
    });
  });

  it("page 경계를 정규화하고 no-store 페이지 응답을 반환한다", async () => {
    const response = await handleAdminAuditLogs(
      new Request(
        "https://example.com/api/settings/audit-logs?page=0&pageSize=999",
      ),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(readPageMock).toHaveBeenCalledWith(1, 200);
    expect(await response.json()).toMatchObject({
      items: [{ id: 1 }],
      total: 1,
    });
  });

  it("관리자 인증 실패 응답을 그대로 반환한다", async () => {
    requireAdminUserMock.mockResolvedValueOnce({
      ok: false,
      response: new Response("Unauthorized", { status: 401 }),
    });

    const response = await handleAdminAuditLogs(
      new Request("https://example.com/api/settings/audit-logs"),
      env,
    );

    expect(response.status).toBe(401);
    expect(readPageMock).not.toHaveBeenCalled();
  });
});
