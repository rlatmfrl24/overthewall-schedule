import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import type { IngestionService } from "../application/ingestion-service";
import { IngestionRepositoryError } from "../application/ports/ingestion-repository";
import { OtwPlayYouTubeMetadataError } from "../application/ports/youtube-metadata";
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

  it("returns a safe YouTube failure classification for playlist diagnostics", async () => {
    const preflight = vi.fn(async () => {
      throw new OtwPlayYouTubeMetadataError(
        "secret provider detail",
        "network",
        true,
      );
    });
    const handler = createIngestionHandler(
      () => ({ preflight }) as unknown as IngestionService,
    );
    const response = await handler(new Request(
      "https://example.com/api/play/admin/imports/playlist/preflight",
      {
        method: "POST",
        headers: { "CF-Ray": "ray-youtube" },
        body: JSON.stringify({ playlistUrl: "PL1234567890", mode: "all_new" }),
      },
    ), env);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "PLAY_ADMIN_EXTERNAL_SERVICE_UNAVAILABLE",
        message: "YouTube playlist metadata is unavailable",
        fields: { youtube: "network" },
        requestId: "ray-youtube",
      },
    });
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
    const invalidFilter = await handler(new Request(
      "https://example.com/api/play/admin/imports/job-1/items?classification=wrong",
    ), env);
    expect(invalidFilter.status).toBe(400);
    const missing = await handler(new Request(
      "https://example.com/api/play/admin/imports/job-1",
      { headers: { "CF-Ray": "ray-1" } },
    ), env);
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({
      error: { code: "PLAY_ADMIN_NOT_FOUND", requestId: "ray-1" },
    });
  });

  it("passes strict server-side item filters to the service", async () => {
    const listItems = vi.fn(async () => ({ items: [], nextCursor: null }));
    const handler = createIngestionHandler(
      () => ({ listItems }) as unknown as IngestionService,
    );
    const response = await handler(new Request(
      "https://example.com/api/play/admin/imports/job-1/items?limit=25&classification=eligible&status=ready",
    ), env);
    expect(response.status).toBe(200);
    expect(listItems).toHaveBeenCalledWith(
      "job-1",
      25,
      null,
      { classification: "eligible", status: "ready" },
    );
  });

  it("routes candidate CAS, partial conversion, and retry commands with the admin actor", async () => {
    const updateCandidate = vi.fn(async () => ({ id: "candidate-1", version: 2 }));
    const convertCandidates = vi.fn(async () => ({ results: [] }));
    const retryJob = vi.fn(async () => ({ job: { id: "job-1" }, enqueued: 1 }));
    const handler = createIngestionHandler(
      () => ({ updateCandidate, convertCandidates, retryJob }) as unknown as IngestionService,
    );
    const candidateResponse = await handler(new Request(
      "https://example.com/api/play/admin/import-candidates/candidate-1",
      {
        method: "PATCH",
        headers: { "CF-Connecting-IP": "127.0.0.1" },
        body: JSON.stringify({ expectedVersion: 1, action: "ignore" }),
      },
    ), env);
    const convertResponse = await handler(new Request(
      "https://example.com/api/play/admin/imports/job-1/convert",
      {
        method: "POST",
        body: JSON.stringify({
          candidates: [{ id: "candidate-1", expectedVersion: 2 }],
        }),
      },
    ), env);
    const retryResponse = await handler(new Request(
      "https://example.com/api/play/admin/imports/job-1/retry",
      { method: "POST", body: "{}" },
    ), env);
    expect(candidateResponse.status).toBe(200);
    expect(convertResponse.status).toBe(200);
    expect(retryResponse.status).toBe(200);
    expect(updateCandidate).toHaveBeenCalledWith(
      "candidate-1",
      { expectedVersion: 1, action: "ignore" },
      expect.objectContaining({ userId: "admin-1", ipAddress: "127.0.0.1" }),
    );
    expect(convertCandidates).toHaveBeenCalledWith(
      "job-1",
      { candidates: [{ id: "candidate-1", expectedVersion: 2 }] },
      expect.objectContaining({ userId: "admin-1" }),
    );
  });
});
