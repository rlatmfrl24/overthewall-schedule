import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLAY_PLAYLIST_MAX_ITEMS } from "@contracts/otw-play-playlists";
import { OTW_PLAY_ADMIN_PREVIEW_HEADER } from "@contracts/otw-play";
import type { Env } from "../../../platform/types";
import type { PlaylistCatalogReader, PlaylistRepository } from "../application/ports/playlist-repository";
import type { PublicCatalogService } from "../application/public-catalog-service";
import { PlaylistService } from "../application/playlist-service";
import { createPlaylistHandler, parsePlaylistWrite, parseDefaultPlaylistWrite } from "./playlist-handler";

const auth = vi.hoisted(() => ({ authenticateRequest: vi.fn(), requireAdminUser: vi.fn() }));
vi.mock("../../../platform/auth", () => auth);

const saved = { representativePerformanceId: null, imageUrl: null, id: "playlist-1", title: "목록", description: "", originDefaultId: null,
  performanceIds: [], version: 2, itemCount: 0, createdAt: 1, updatedAt: 2 };
const reader = {
  readPlaylistDefaults: vi.fn<PlaylistCatalogReader["readPlaylistDefaults"]>(),
  readPlaylistPerformances: vi.fn<PlaylistCatalogReader["readPlaylistPerformances"]>(),
  resolvePlaylistPerformances: vi.fn<PlaylistCatalogReader["resolvePlaylistPerformances"]>(),
};
const repo = { findCreate: vi.fn<PlaylistRepository["findCreate"]>(),
  list: vi.fn<PlaylistRepository["list"]>(), read: vi.fn<PlaylistRepository["read"]>(),
  create: vi.fn<PlaylistRepository["create"]>(), save: vi.fn<PlaylistRepository["save"]>(),
  delete: vi.fn<PlaylistRepository["delete"]>(),
};
const readPublicState = vi.fn<PublicCatalogService["readPublicState"]>();
const publicState = { revision: 8, readModelRevision: 8, publicReadEnabled: true, navigationVisible: true, updatedAt: 1 };
const settings = { list: vi.fn(async () => []), save: vi.fn(async () => true) };
const service = new PlaylistService({ readPublicState } as unknown as PublicCatalogService, reader, repo, settings);
const handler = createPlaylistHandler(() => service);
const env = {} as Env;
const request = (path: string, method = "GET", value?: unknown, headers?: HeadersInit) => new Request(`https://otw.test${path}`, {
  method, headers, ...(value === undefined ? {} : { body: JSON.stringify(value) }),
});

beforeEach(() => {
  vi.resetAllMocks(); repo.findCreate.mockResolvedValue(null); settings.list.mockResolvedValue([]); settings.save.mockResolvedValue(true);
  auth.authenticateRequest.mockResolvedValue({ ok: true, user: { id: "owner" } });
  auth.requireAdminUser.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
  readPublicState.mockResolvedValue(publicState);
  reader.readPlaylistDefaults.mockResolvedValue([]);
  reader.resolvePlaylistPerformances.mockResolvedValue([]);
  repo.list.mockResolvedValue([saved]); repo.read.mockResolvedValue(saved);
  repo.create.mockResolvedValue(saved); repo.save.mockResolvedValue(true); repo.delete.mockResolvedValue(true);
});
afterEach(() => { vi.restoreAllMocks(); });

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toMatchObject({ error: { code } });
}

const input = (count: number) => ({ title: "목록", description: "", originDefaultId: null,
  performanceIds: Array.from({ length: count }, (_, index) => `p-${index}`) });

describe("committed playlist creation readback", () => {
  it.each([
    ["catalog revision changes", { ...publicState, revision: 9 }],
    ["public access is disabled", { ...publicState, publicReadEnabled: false }],
  ])("preserves replay semantics when %s after creation", async (_scenario, changedState) => {
    const created = { ...saved, version: 0 };
    const payload = { ...input(0), representativePerformanceId: null, requestId: "same-request" };
    repo.create.mockImplementationOnce(async () => {
      readPublicState.mockResolvedValue(changedState);
      return created;
    });
    await expectError(await handler(request("/api/play/me/playlists", "POST", payload), env),
      503, "PLAY_PLAYLIST_CREATE_UNCONFIRMED");

    readPublicState.mockResolvedValue(publicState);
    repo.findCreate.mockResolvedValue(created);
    repo.read.mockResolvedValue(created);
    const replay = await handler(request("/api/play/me/playlists", "POST", payload), env);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toMatchObject({ data: { id: created.id, version: 0 } });
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(repo.findCreate.mock.calls[1]).toEqual(repo.findCreate.mock.calls[0]);
  });
  it("also marks an existing creation replay as uncertain when its readback fails", async () => {
    repo.findCreate.mockImplementationOnce(async () => {
      readPublicState.mockResolvedValue({ ...publicState, revision: 9 });
      return saved;
    });
    await expectError(await handler(request("/api/play/me/playlists", "POST", { ...input(0), requestId: "replay" }), env),
      503, "PLAY_PLAYLIST_CREATE_UNCONFIRMED");
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe("playlist write item boundary", () => {
  it("accepts the full limit and rejects an oversized array before identifier validation", () => {
    expect(parsePlaylistWrite(input(PLAY_PLAYLIST_MAX_ITEMS)).performanceIds).toHaveLength(PLAY_PLAYLIST_MAX_ITEMS);
    const oversized = input(PLAY_PLAYLIST_MAX_ITEMS + 1);
    Object.defineProperty(oversized.performanceIds, "0", { get: () => { throw new Error("must not scan oversized input"); } });
    expect(() => parsePlaylistWrite(oversized)).toThrow("PLAY_PLAYLIST_ITEM_LIMIT");
  });
});

describe("playlist HTTP boundary with the real application service", () => {
  it.each([
    ["/api/play/me/playlists", "GET"], ["/api/play/me/playlists", "POST"],
    ["/api/play/me/playlists/playlist-1", "GET"], ["/api/play/me/playlists/playlist-1", "PUT"],
    ["/api/play/me/playlists/playlist-1", "DELETE"],
  ])("requires authentication for %s %s", async (path, method) => {
    auth.authenticateRequest.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    await expectError(await handler(request(path, method), env), 401, "PLAY_AUTH_REQUIRED");
    expect(readPublicState).not.toHaveBeenCalled();
    for (const operation of Object.values(repo)) expect(operation).not.toHaveBeenCalled();
  });

  it("does not let a member enable public reads through authentication or a forged preview header", async () => {
    readPublicState.mockResolvedValue({ ...publicState, publicReadEnabled: false });
    await expectError(await handler(request("/api/play/me/playlists"), env), 404, "PLAY_PUBLIC_READ_DISABLED");
    await expectError(await handler(request("/api/play/me/playlists", "GET", undefined, { [OTW_PLAY_ADMIN_PREVIEW_HEADER]: "1" }), env), 403, "PLAY_AUTH_REQUIRED");
    expect(repo.list).not.toHaveBeenCalled();
    auth.requireAdminUser.mockResolvedValue({ ok: true });
    const response = await handler(request("/api/play/me/playlists", "GET", undefined, { [OTW_PLAY_ADMIN_PREVIEW_HEADER]: "1" }), env);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Vary")).toContain("Authorization");
    expect(repo.list).toHaveBeenCalledWith("owner");
  });

  it("uses authenticated ownership, normalizes metadata and returns create readback", async () => {
    const response = await handler(request("/api/play/me/playlists", "POST", {
      ...input(0), title: "  내 목록  ", description: " 설명 ", requestId: "retry-1", owner: "someone-else",
    }), env);
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(repo.create).toHaveBeenCalledWith("owner", "retry-1", { ...input(0), title: "내 목록", description: "설명" });
    expect(await response.json()).toEqual({ data: saved });
  });

  it.each(["POST", "PUT"])("rejects oversized %s before any catalog or persistence work", async method => {
    const path = method === "POST" ? "/api/play/me/playlists" : "/api/play/me/playlists/playlist-1";
    await expectError(await handler(request(path, method, { ...input(PLAY_PLAYLIST_MAX_ITEMS + 1), requestId: "retry-1", expectedVersion: 2 }), env), 400, "PLAY_PLAYLIST_ITEM_LIMIT");
    expect(readPublicState).not.toHaveBeenCalled();
    expect(reader.resolvePlaylistPerformances).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled(); expect(repo.save).not.toHaveBeenCalled();
  });

  it.each(["{", "null", "[]"])("rejects malformed/objectless JSON: %s", async body => {
    await expectError(await handler(new Request("https://otw.test/api/play/me/playlists", { method: "POST", body }), env), 400, "PLAY_PLAYLIST_INVALID_INPUT");
    expect(repo.create).not.toHaveBeenCalled();
  });

  it.each([-1, 1.5, "2", null])("rejects invalid expectedVersion: %j", async expectedVersion => {
    await expectError(await handler(request("/api/play/me/playlists/playlist-1", "PUT", { ...input(0), expectedVersion }), env), 400, "PLAY_PLAYLIST_INVALID_INPUT");
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("keeps update/delete conflicts and missing ownership distinct", async () => {
    repo.save.mockResolvedValue(false); repo.delete.mockResolvedValue(false);
    await expectError(await handler(request("/api/play/me/playlists/playlist-1", "PUT", { ...input(0), expectedVersion: 2 }), env), 409, "PLAY_PLAYLIST_CONFLICT");
    await expectError(await handler(request("/api/play/me/playlists/playlist-1", "DELETE", { expectedVersion: 2 }), env), 409, "PLAY_PLAYLIST_CONFLICT");
    expect(repo.save).toHaveBeenCalledWith("owner", "playlist-1", 2, input(0));
    expect(repo.delete).toHaveBeenCalledWith("owner", "playlist-1", 2);
    repo.read.mockResolvedValue(null);
    await expectError(await handler(request("/api/play/me/playlists/other"), env), 404, "PLAY_PLAYLIST_NOT_FOUND");
  });

  it("limits public resolution to 60 IDs independently of the personal playlist limit", async () => {
    await expectError(await handler(request("/api/play/performances/resolve", "POST", { performanceIds: input(61).performanceIds }), env), 400, "PLAY_PLAYLIST_ITEM_LIMIT");
    expect(readPublicState).not.toHaveBeenCalled();
    const response = await handler(request("/api/play/performances/resolve", "POST", { performanceIds: input(60).performanceIds }), env);
    expect(response.status).toBe(200);
    expect(reader.resolvePlaylistPerformances).toHaveBeenCalledWith(input(60).performanceIds);
    expect(auth.authenticateRequest).not.toHaveBeenCalled();
  });

  it("does not leak internal persistence failures into the HTTP response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    repo.list.mockRejectedValue(new Error("private database details"));
    const response = await handler(request("/api/play/me/playlists"), env);
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).not.toContain("private database details");
  });
});


describe("playlist representative and admin HTTP contract", () => {
  it("distinguishes omitted and cleared representatives and validates default overrides", () => {
    expect(parsePlaylistWrite(input(0))).not.toHaveProperty("representativePerformanceId");
    expect(parsePlaylistWrite({ ...input(0), representativePerformanceId: null })).toHaveProperty("representativePerformanceId", null);
    expect(() => parsePlaylistWrite({ ...input(0), representativePerformanceId: 5 })).toThrow();
    expect(parseDefaultPlaylistWrite({ title: null, description: null, representativePerformanceId: null })).toEqual({ title: null, description: null, representativePerformanceId: null });
    expect(() => parseDefaultPlaylistWrite({ title: " ", description: "", representativePerformanceId: null })).toThrow();
    expect(() => parseDefaultPlaylistWrite({ title: "name", description: "x".repeat(2001), representativePerformanceId: null })).toThrow();
  });
  it.each(["GET", "PUT"])("denies member access to default settings: %s", async method => {
    await expectError(await handler(request("/api/play/admin/playlists/defaults/cover", method), env), 403, "PLAY_ADMIN_AUTH_REQUIRED");
    expect(settings.save).not.toHaveBeenCalled(); expect(reader.readPlaylistDefaults).not.toHaveBeenCalled();
  });
  it("serves the admin list when public reads are disabled without a preview header", async () => {
    auth.requireAdminUser.mockResolvedValue({ ok: true, user: { id: "admin", displayName: "Admin" } });
    readPublicState.mockResolvedValue({ ...publicState, publicReadEnabled: false });
    const result = await handler(request("/api/play/admin/playlists/defaults"), env);
    expect(result.status).toBe(200); expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(await result.json()).toEqual({ data: [] });
  });
});
