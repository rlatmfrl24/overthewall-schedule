import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import {
  AdminCatalogService,
  AdminCatalogServiceError,
} from "../application/admin-catalog-service";
import { AdminCatalogRepositoryError } from "../application/ports/admin-catalog-repository";
import { OtwPlayYouTubeMetadataError } from "../application/ports/youtube-metadata";
import type { SourceHealthService } from "../application/source-health-service";
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

  it("looks up an authoritative YouTube channel display name", async () => {
    const lookupChannel = vi.fn(async (externalChannelId: string) => ({
      externalChannelId,
      displayName: "조회된 채널",
    }));
    const handler = createAdminCatalogHandler(
      () => ({ lookupChannel }) as unknown as AdminCatalogService,
    );
    const response = await handler(
      new Request(
        "https://example.com/api/play/admin/channels/lookup?externalChannelId=UC1111111111111111111111",
      ),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      data: {
        externalChannelId: "UC1111111111111111111111",
        displayName: "조회된 채널",
      },
    });
    expect(lookupChannel).toHaveBeenCalledWith("UC1111111111111111111111");
  });

  it("serves the lazy source-health dashboard with admin no-store semantics", async () => {
    const readDashboard = vi.fn(async () => ({
      generatedAt: 123,
      recentRecoveryWindowDays: 7 as const,
      listLimit: 50 as const,
      counts: { due: 0, unplayable: 0, recentlyRecovered: 0 },
      due: [],
      unplayable: [],
      recentlyRecovered: [],
    }));
    const handler = createAdminCatalogHandler(
      () => ({}) as AdminCatalogService,
      () => ({ readDashboard }) as unknown as SourceHealthService,
    );
    const response = await handler(
      new Request("https://example.com/api/play/admin/source-health"),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      data: { generatedAt: 123, counts: { due: 0 } },
    });
    expect(readDashboard).toHaveBeenCalledOnce();

    const wrongMethod = await handler(
      new Request("https://example.com/api/play/admin/source-health", {
        method: "POST",
      }),
      env,
    );
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("Allow")).toBe("GET");
    expect(wrongMethod.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns retry-scheduled source rechecks as a successful authority response", async () => {
    const recheckSource = vi.fn(async () => ({
      data: {
        id: "source-1",
        availabilityStatus: "playable",
        nextCheckAt: 456,
      },
      catalogRevision: 2,
      check: {
        status: "retry_scheduled",
        currentAvailability: "playable",
        retryCode: "timeout",
        nextCheckAt: 456,
      },
    }));
    const handler = createAdminCatalogHandler(
      () => ({}) as AdminCatalogService,
      () => ({ recheckSource }) as unknown as SourceHealthService,
    );
    const response = await handler(
      new Request("https://example.com/api/play/admin/sources/source-1/recheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 3,
          youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
          channelId: "channel-1",
        }),
      }),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      check: { status: "retry_scheduled", retryCode: "timeout" },
    });
    expect(recheckSource).toHaveBeenCalledWith(
      "source-1",
      expect.objectContaining({ expectedVersion: 3 }),
    );
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

  it("deletes catalog resources through authenticated dynamic routes", async () => {
    const deleteEntity = vi.fn(async (id) => ({
      data: { id },
      catalogRevision: 1,
    }));
    const deleteSong = vi.fn(async (id) => ({
      data: { id },
      catalogRevision: 2,
    }));
    const deletePerformance = vi.fn(async (id) => ({
      data: { id },
      catalogRevision: 3,
    }));
    const handler = createAdminCatalogHandler(
      () =>
        ({ deleteEntity, deleteSong, deletePerformance }) as unknown as AdminCatalogService,
    );
    const entityResponse = await handler(
      new Request("https://example.com/api/play/admin/entities/external%20one", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: 0 }),
      }),
      env,
    );
    const songResponse = await handler(
      new Request("https://example.com/api/play/admin/songs/song%20one", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: 1 }),
      }),
      env,
    );
    const performanceResponse = await handler(
      new Request(
        "https://example.com/api/play/admin/performances/performance%20one",
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: 2 }),
        },
      ),
      env,
    );

    expect(entityResponse.status).toBe(200);
    expect(songResponse.status).toBe(200);
    expect(performanceResponse.status).toBe(200);
    expect(deleteEntity).toHaveBeenCalledWith(
      "external one",
      { expectedVersion: 0 },
      expect.objectContaining({ userId: "admin" }),
    );
    expect(deleteSong).toHaveBeenCalledWith(
      "song one",
      { expectedVersion: 1 },
      expect.objectContaining({ userId: "admin" }),
    );
    expect(deletePerformance).toHaveBeenCalledWith(
      "performance one",
      { expectedVersion: 2 },
      expect.objectContaining({ userId: "admin" }),
    );
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

  it("preserves the legacy policy error mapping for a valid approval command", async () => {
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
            expectedCatalogRevision: 1,
            song: { kind: "existing", songId: "song-1" },
            participants: [
              {
                subject: { kind: "entity", entityId: "entity-1" },
                participantRole: "vocal",
                creditOrder: 0,
                creditNameSnapshot: "Singer",
              },
            ],
            channel: { kind: "existing", channelId: "channel-1" },
            releaseType: "official_video",
            participationType: "solo",
            singingCreditConfirmed: true,
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
