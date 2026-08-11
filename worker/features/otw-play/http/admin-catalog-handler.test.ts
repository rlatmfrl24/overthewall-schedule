import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import {
  AdminCatalogService,
  AdminCatalogServiceError,
} from "../application/admin-catalog-service";
import { AdminCatalogRepositoryError } from "../application/ports/admin-catalog-repository";
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
