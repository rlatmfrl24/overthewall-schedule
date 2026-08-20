import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import { ReleaseService, ReleaseServiceError } from "../application/release-service";
import { createReleaseHandler } from "./release-handler";

const auth = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  getActorInfo: vi.fn(),
}));
vi.mock("../../../platform/auth", () => ({
  requireAdminUser: auth.requireAdminUser,
}));
vi.mock("../../../platform/http-helpers", () => ({
  getActorInfo: auth.getActorInfo,
}));

const env = {} as Env;
const requestBody = {
  expected: {
    publicReadEnabled: false,
    navigationVisible: false,
    updatedAt: 10,
  },
  target: { publicReadEnabled: true, navigationVisible: false },
  confirmation: "direct_routes_verified",
};

describe("OTW Play release handler", () => {
  beforeEach(() => {
    auth.requireAdminUser.mockReset();
    auth.getActorInfo.mockReset();
    auth.requireAdminUser.mockResolvedValue({
      ok: true,
      user: { id: "admin-1", displayName: "Admin", claims: {}, sessionId: null },
    });
    auth.getActorInfo.mockReturnValue({ actorIp: "127.0.0.1" });
  });

  it("serves GET authority and recent audits with no-store", async () => {
    const read = vi.fn(async () => ({
      data: {
        publicReadEnabled: false,
        navigationVisible: false,
        catalogRevision: 7,
        readModelRevision: 7,
        updatedAt: 10,
        readyForPublicRead: true,
      },
      recentChanges: [],
    }));
    const write = vi.fn();
    const handler = createReleaseHandler(
      () => ({ read }) as unknown as ReleaseService,
      () => ({ write }),
    );
    const response = await handler(
      new Request("https://example.com/api/play/admin/release"),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      data: { publicReadEnabled: false },
      recentChanges: [],
    });
    expect(write).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith(expect.objectContaining({
      event: "play.catalog.read",
      recordKind: "request",
      routeId: "otw-play.admin.release",
    }));
  });

  it("applies PATCH with the authenticated actor and emits safe release telemetry", async () => {
    const update = vi.fn(async () => ({
      response: {
        data: {
          ...requestBody.target,
          catalogRevision: 7,
          readModelRevision: 7,
          updatedAt: 11,
          readyForPublicRead: true,
        },
        transition: "enable_public_read" as const,
        changedAt: 11,
      },
      diagnostics: { rowsRead: 4, rowsWritten: 2 },
    }));
    const write = vi.fn();
    const handler = createReleaseHandler(
      () => ({ update }) as unknown as ReleaseService,
      () => ({ write }),
    );
    const response = await handler(
      new Request("https://example.com/api/play/admin/release", {
        method: "PATCH",
        headers: { "CF-Ray": "ray-1" },
        body: JSON.stringify(requestBody),
      }),
      env,
    );
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(requestBody, {
      userId: "admin-1",
      displayName: "Admin",
      ipAddress: "127.0.0.1",
    });
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "play.release.updated",
        transition: "enable_public_read",
        d1RowsRead: 4,
        d1RowsWritten: 2,
      }),
    );
    expect(JSON.stringify(write.mock.calls)).not.toContain("Admin");
    expect(JSON.stringify(write.mock.calls)).not.toContain("127.0.0.1");
  });

  it.each([
    ["stale_write", 409, "PLAY_ADMIN_STALE_WRITE", "play.concurrent_write_conflict"],
    ["policy_unresolved", 422, "PLAY_ADMIN_POLICY_UNRESOLVED", "play.request.failed"],
    ["invalid_request", 400, "PLAY_ADMIN_INVALID_REQUEST", "play.request.failed"],
  ] as const)("maps %s to %s without mutating a response", async (serviceCode, status, apiCode, event) => {
    const write = vi.fn();
    const handler = createReleaseHandler(
      () => ({
        update: vi.fn(async () => {
          throw new ReleaseServiceError(serviceCode, "rejected");
        }),
      }) as unknown as ReleaseService,
      () => ({ write }),
    );
    const response = await handler(
      new Request("https://example.com/api/play/admin/release", {
        method: "PATCH",
        body: JSON.stringify(requestBody),
      }),
      env,
    );
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: apiCode },
    });
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({ event, status, errorCode: apiCode }),
    );
  });

  it("advertises only GET and PATCH and rejects all query parameters", async () => {
    const service = {} as ReleaseService;
    const handler = createReleaseHandler(
      () => service,
      () => ({ write: vi.fn() }),
    );
    const method = await handler(
      new Request("https://example.com/api/play/admin/release", { method: "POST" }),
      env,
    );
    expect(method.status).toBe(405);
    expect(method.headers.get("Allow")).toBe("GET, PATCH");

    const query = await handler(
      new Request("https://example.com/api/play/admin/release?force=1"),
      env,
    );
    expect(query.status).toBe(400);
  });
});
