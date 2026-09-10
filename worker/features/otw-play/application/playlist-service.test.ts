import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayPlaylist } from "@contracts/otw-play-playlists";
import { PLAY_PLAYLIST_MAX_ITEMS } from "@contracts/otw-play-playlists";
import { PlaylistService } from "./playlist-service";
import type { PublicCatalogService } from "./public-catalog-service";
import type { PublicCatalogPerformanceDetail } from "./ports/public-catalog-reader";
import type { PlaylistCatalogReader, PlaylistRepository } from "./ports/playlist-repository";

const state = { publicReadEnabled: true, revision: 8, readModelRevision: 8 };
const readPublicState = vi.fn(async () => state);
const reader = { readPlaylistDefaults: vi.fn(async () => []), readPlaylistPerformances: vi.fn(async (): Promise<PublicCatalogPerformanceDetail[]> => []),
  resolvePlaylistPerformances: vi.fn(async (ids: string[]) => ids.map(id => ({ performance: { id } }) as PublicCatalogPerformanceDetail)) } satisfies PlaylistCatalogReader;
const original: PlayPlaylist = { id: "one", title: "목록", description: "", version: 2, itemCount: 1, performanceIds: ["withdrawn"], originDefaultId: null, createdAt: 1, updatedAt: 1 };
const repo = { list: vi.fn(async () => []), read: vi.fn(async (): Promise<PlayPlaylist | null> => original),
  create: vi.fn(async () => original), save: vi.fn(async () => true), delete: vi.fn(async () => true) } satisfies PlaylistRepository;
const service = new PlaylistService({ readPublicState } as unknown as PublicCatalogService, reader, repo);
const context = { allowDisabledRead: false, allowSharedCache: false };
beforeEach(() => { vi.clearAllMocks(); readPublicState.mockResolvedValue(state); repo.read.mockResolvedValue(original); repo.save.mockResolvedValue(true);
  reader.resolvePlaylistPerformances.mockImplementation(async ids => ids.map(id => ({ performance: { id } }) as PublicCatalogPerformanceDetail)); });
describe("playlist authority and persistence", () => {
  it.each([{ requestId: "large" }, { id: "one", expectedVersion: 2 }])("rejects oversized writes before any database work: %j", async command => {
    const input = { ...original, performanceIds: Array.from({ length: PLAY_PLAYLIST_MAX_ITEMS + 1 }, (_, index) => `p-${index}`) };
    await expect(service.write(context, "owner", input, command)).rejects.toMatchObject({ status: 400, code: "PLAY_PLAYLIST_ITEM_LIMIT" });
    expect(readPublicState).not.toHaveBeenCalled();
    expect(reader.resolvePlaylistPerformances).not.toHaveBeenCalled();
    expect(repo.read).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });
  it("roundtrips a page boundary with rich performance metadata without embedding it in the cursor", async () => {
    const rows = Array.from({ length: 61 }, (_, index) => ({ performance: {
      id: `performance-${index}`, releasedAt: 1000 - index,
      participants: Array.from({ length: 8 }, (_, creditOrder) => ({ displayName: "가창 멤버".repeat(40), creditOrder })),
      sources: [{ title: "영상 제목".repeat(100), thumbnailUrl: "https://example.com/image.jpg" }],
    } }) as PublicCatalogPerformanceDetail);
    reader.readPlaylistPerformances.mockResolvedValueOnce(rows);
    const first = await service.browse(context, new URLSearchParams("relation=cover"));
    expect(first.data.items).toHaveLength(60);
    expect(Object.keys(JSON.parse(decodeURIComponent(first.nextCursor!))).sort()).toEqual(["id", "identity", "releasedAt", "revision"]);
    reader.readPlaylistPerformances.mockResolvedValueOnce([rows[60]]);
    const second = await service.browse(context, new URLSearchParams({ relation: "cover", cursor: first.nextCursor! }));
    expect(reader.readPlaylistPerformances).toHaveBeenLastCalledWith(expect.objectContaining({ after: { id: "performance-59", releasedAt: 941 } }));
    expect(second.data.items).toEqual([rows[60]]);
    expect(second.nextCursor).toBeNull();
  });
  it("does not let member ownership bypass the public flag", async () => {
    readPublicState.mockResolvedValue({ ...state, publicReadEnabled: false });
    await expect(service.list(context, "member")).rejects.toMatchObject({ status: 404 });
    expect(repo.list).not.toHaveBeenCalled();
    await expect(service.defaults({ ...context, allowDisabledRead: true })).resolves.toHaveProperty("catalogRevision", 8);
  });
  it("rejects a changing catalog without returning a mixed page", async () => {
    readPublicState.mockResolvedValueOnce(state).mockResolvedValueOnce({ ...state, revision: 9, readModelRevision: 9 });
    await expect(service.browse(context, new URLSearchParams())).rejects.toMatchObject({ code: "PLAY_CURSOR_STALE" });
  });
  it("preserves withdrawn references but validates newly added versions in batches of 60", async () => {
    const input = { ...original, performanceIds: ["withdrawn", ...Array.from({ length: 125 }, (_, i) => `p-${i}`)] };
    await service.write(context, "owner", input, { id: "one", expectedVersion: 2 });
    expect(reader.resolvePlaylistPerformances.mock.calls.map(([ids]) => ids.length)).toEqual([60, 60, 5]);
    expect(repo.save).toHaveBeenCalledWith("owner", "one", 2, input);
  });
  it("rejects newly private references and never mutates the saved list", async () => {
    reader.resolvePlaylistPerformances.mockResolvedValue([]);
    await expect(service.write(context, "owner", { ...original, performanceIds: ["secret"] }, { id: "one", expectedVersion: 2 })).rejects.toMatchObject({ status: 400 });
    expect(repo.save).not.toHaveBeenCalled();
  });
  it("rejects missing ownership and both stale and racing saves", async () => {
    repo.read.mockResolvedValueOnce(null);
    await expect(service.write(context, "other", original, { id: "one", expectedVersion: 2 })).rejects.toMatchObject({ status: 404 });
    await expect(service.write(context, "owner", original, { id: "one", expectedVersion: 1 })).rejects.toMatchObject({ status: 409 });
    expect(repo.save).not.toHaveBeenCalled();
    repo.save.mockResolvedValueOnce(false);
    await expect(service.write(context, "owner", original, { id: "one", expectedVersion: 2 })).rejects.toMatchObject({ status: 409 });
  });
});
