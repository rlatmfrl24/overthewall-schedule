import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import type { IngestionService } from "../application/ingestion-service";
import { IngestionRepositoryError } from "../application/ports/ingestion-repository";
import { createIngestionHandler } from "./ingestion-handler";

const requireAdminUserMock = vi.hoisted(() => vi.fn());
vi.mock("../../../platform/auth", () => ({
  requireAdminUser: requireAdminUserMock,
}));

const env = {} as Env;

describe("OTW Play ingestion handler", () => {
  beforeEach(() => {
    requireAdminUserMock.mockReset();
    requireAdminUserMock.mockResolvedValue({
      ok: true,
      user: { id: "admin-1", displayName: "Admin", claims: {}, sessionId: null },
    });
  });

  it("authenticates before resolving the ingestion service", async () => {
    const resolveService = vi.fn();
    requireAdminUserMock.mockResolvedValueOnce({
      ok: false,
      response: new Response("denied", { status: 403 }),
    });
    const response = await createIngestionHandler(resolveService)(
      new Request("https://example.com/api/play/admin/imports/job-1"),
      env,
    );
    expect(response.status).toBe(403);
    expect(resolveService).not.toHaveBeenCalled();
  });

  it("preflights and creates persisted imports with no-store authority responses", async () => {
    const preflight = vi.fn(async () => ({ playlistId: "PL1234567890" }));
    const createJob = vi.fn(async () => ({ id: "job-1", status: "queued" }));
    const handler = createIngestionHandler(
      () => ({ preflight, createJob }) as unknown as IngestionService,
    );
    const preflightResponse = await handler(new Request(
      "https://example.com/api/play/admin/imports/playlist/preflight",
      {
        method: "POST",
        body: JSON.stringify({ playlistUrl: "PL1234567890", mode: "all_new" }),
      },
    ), env);
    const createResponse = await handler(new Request(
      "https://example.com/api/play/admin/imports/playlist",
      {
        method: "POST",
        body: JSON.stringify({
          playlistUrl: "PL1234567890",
          mode: "all_new",
          idempotencyKey: "request-1234",
        }),
      },
    ), env);
    expect(preflightResponse.status).toBe(200);
    expect(createResponse.status).toBe(202);
    expect(createResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(createJob).toHaveBeenCalledWith("admin-1", expect.objectContaining({
      idempotencyKey: "request-1234",
    }));
  });

  it("validates list query bounds and maps missing jobs to typed errors", async () => {
    const listItems = vi.fn();
    const getJob = vi.fn(async () => {
      throw new IngestionRepositoryError("not_found", "job not found");
    });
    const handler = createIngestionHandler(
      () => ({ listItems, getJob }) as unknown as IngestionService,
    );
    const invalid = await handler(new Request(
      "https://example.com/api/play/admin/imports/job-1/items?limit=101",
    ), env);
    expect(invalid.status).toBe(400);
    expect(listItems).not.toHaveBeenCalled();
    const missing = await handler(new Request(
      "https://example.com/api/play/admin/imports/job-1",
      { headers: { "CF-Ray": "ray-1" } },
    ), env);
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({
      error: { code: "PLAY_ADMIN_NOT_FOUND", requestId: "ray-1" },
    });
  });
});
