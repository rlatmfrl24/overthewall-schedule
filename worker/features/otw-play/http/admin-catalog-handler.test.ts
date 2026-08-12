import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import {
  AdminCatalogService,
  AdminCatalogServiceError,
} from "../application/admin-catalog-service";
import { AdminCatalogRepositoryError } from "../application/ports/admin-catalog-repository";
import { OtwPlayYouTubeMetadataError } from "../application/ports/youtube-metadata";
import { createAdminCatalogHandler } from "./admin-catalog-handler";

const requireAdminUserMock = vi.hoisted(() => vi.fn());
vi.mock("../../../platform/auth", () => ({
  requireAdminUser: requireAdminUserMock,
}));

const env = {} as Env;

describe("OTW Play admin catalog handler", () => {
  beforeEach(() => {
    requireAdminUserMock.mockReset();
    requireAdminUserMock.mockResolvedValue({
      ok: true,
      user: { id: "admin", displayName: "Admin", claims: {}, sessionId: null },
    });
  });

  it("authenticates before reading the catalog and returns no-store", async () => {
    const readCatalog = vi.fn(async () => ({
      revision: 1,
      readModelRevision: 1,
      songs: [],
      performances: [],
      entities: [],
      channels: [],
    }));
    const handler = createAdminCatalogHandler(
      () =>
        ({
          readCatalog,
        }) as unknown as AdminCatalogService,
    );
    const response = await handler(
      new Request("https://example.com/api/play/admin/catalog"),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(requireAdminUserMock).toHaveBeenCalledOnce();
    expect(readCatalog).toHaveBeenCalledOnce();
  });

  it("preserves 401 and 403 guard responses without resolving a service", async () => {
    const resolveService = vi.fn();
    const handler = createAdminCatalogHandler(resolveService);
    for (const status of [401, 403]) {
      requireAdminUserMock.mockResolvedValueOnce({
        ok: false,
        response: new Response("denied", { status }),
      });
      const response = await handler(
        new Request("https://example.com/api/play/admin/catalog"),
        env,
      );
      expect(response.status).toBe(status);
    }
    expect(resolveService).not.toHaveBeenCalled();
  });

  it("returns a typed 400 before invoking malformed commands", async () => {
    const createSong = vi.fn();
    const handler = createAdminCatalogHandler(
      () => ({ createSong }) as unknown as AdminCatalogService,
    );
    const response = await handler(
      new Request("https://example.com/api/play/admin/songs", {
        method: "POST",
        body: "{}",
        headers: { "Content-Type": "application/json" },
      }),
      env,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "PLAY_ADMIN_INVALID_REQUEST",
        fields: { body: "invalid_song" },
      },
    });
    expect(createSong).not.toHaveBeenCalled();
  });

  it("serves the authenticated preflight and atomic catalog-entry endpoints with no-store", async () => {
    const preflightCatalogEntry = vi.fn(async () => ({
      catalogRevision: 1,
      duplicate: null,
    }));
    const createCatalogEntry = vi.fn(async () => ({
      data: { performance: { id: "performance-1" } },
      catalogRevision: 2,
    }));
    const handler = createAdminCatalogHandler(
      () =>
        ({ preflightCatalogEntry, createCatalogEntry }) as unknown as AdminCatalogService,
    );
    const preflightResponse = await handler(
      new Request("https://example.com/api/play/admin/catalog-entries/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
          startSeconds: 0,
        }),
      }),
      env,
    );
    expect(preflightResponse.status).toBe(200);
    expect(preflightResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(preflightCatalogEntry).toHaveBeenCalledOnce();

    const createResponse = await handler(
      new Request("https://example.com/api/play/admin/catalog-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedCatalogRevision: 1,
          youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
          startSeconds: 0,
          song: { kind: "existing", songId: "song-1" },
          participants: [
            {
              subject: { kind: "member", memberUid: 1 },
              participantRole: "vocal",
              creditOrder: 0,
            },
          ],
          channel: { kind: "existing", channelId: "channel-1" },
          relationType: "cover",
          releaseType: "official_video",
          participationType: "solo",
          publicationTarget: "draft",
        }),
      }),
      env,
    );
    expect(createResponse.status).toBe(201);
    expect(createResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(createCatalogEntry).toHaveBeenCalledOnce();
  });

  it("returns a redacted YouTube diagnostic with the request id", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const handler = createAdminCatalogHandler(
      () =>
        ({
          preflightCatalogEntry: vi.fn(async () => {
            throw new OtwPlayYouTubeMetadataError(
              "YouTube metadata request returned 403",
            );
          }),
        }) as unknown as AdminCatalogService,
    );
    const response = await handler(
      new Request(
        "https://example.com/api/play/admin/catalog-entries/preflight",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
            startSeconds: 0,
          }),
        },
      ),
      env,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "PLAY_ADMIN_EXTERNAL_SERVICE_UNAVAILABLE",
        fields: { youtube: "YouTube metadata request returned 403" },
        requestId: expect.any(String),
      },
    });
    expect(warn).toHaveBeenCalledWith(
      "OTW Play YouTube metadata request failed",
      expect.objectContaining({
        reason: "YouTube metadata request returned 403",
        requestId: expect.any(String),
      }),
    );
    warn.mockRestore();
  });

  it("returns duplicate source identity in the fixed 409 error", async () => {
    const handler = createAdminCatalogHandler(
      () =>
        ({
          createCatalogEntry: vi.fn(async () => {
            throw new AdminCatalogRepositoryError(
              "duplicate_source",
              "already registered",
              { songId: "song-1", performanceId: "performance-1" },
            );
          }),
        }) as unknown as AdminCatalogService,
    );
    const response = await handler(
      new Request("https://example.com/api/play/admin/catalog-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedCatalogRevision: 1,
          youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
          startSeconds: 0,
          song: { kind: "existing", songId: "song-1" },
          participants: [{ subject: { kind: "member", memberUid: 1 }, participantRole: "vocal", creditOrder: 0 }],
          channel: { kind: "existing", channelId: "channel-1" },
          relationType: "cover",
          releaseType: "official_video",
          participationType: "solo",
          publicationTarget: "draft",
        }),
      }),
      env,
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "PLAY_ADMIN_DUPLICATE_SOURCE",
        fields: { songId: "song-1", performanceId: "performance-1" },
      },
    });
  });

  it("returns 503 without exposing a stale read model as writable", async () => {
    const readCatalog = vi.fn(async () => {
      throw new AdminCatalogRepositoryError(
        "unavailable",
        "Catalog read model must be repaired",
      );
    });
    const handler = createAdminCatalogHandler(
      () =>
        ({
          readCatalog,
        }) as unknown as AdminCatalogService,
    );
    const response = await handler(
      new Request("https://example.com/api/play/admin/catalog"),
      env,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PLAY_ADMIN_INTERNAL_ERROR" },
    });
  });

  it("maps unresolved GATE-01 approval to the fixed policy error", async () => {
    const approveProposal = vi.fn(async () => {
      throw new AdminCatalogServiceError(
        "policy_unresolved",
        "Official cover acceptance policy GATE-01 is not resolved",
      );
    });
    const handler = createAdminCatalogHandler(
      () => ({ approveProposal }) as unknown as AdminCatalogService,
    );
    const response = await handler(
      new Request(
        "https://example.com/api/play/admin/submissions/proposal-1/approve",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedVersion: 0,
            song: { existingSongId: "song-1" },
            performance: {
              relationType: "cover",
              releaseType: "official_video",
              participationType: "solo",
              qualityStatus: "ok",
              releasedAt: null,
              participants: [
                {
                  entityId: "entity-1",
                  participantRole: "vocal",
                  creditOrder: 0,
                  creditNameSnapshot: "Singer",
                },
              ],
              source: {
                channelId: "channel-1",
                startSeconds: 0,
                sourceRole: "official",
              },
            },
            publish: true,
          }),
        },
      ),
      env,
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PLAY_ADMIN_POLICY_UNRESOLVED" },
    });
  });
});
