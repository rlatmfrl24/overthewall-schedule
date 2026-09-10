import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectPlaylist } from "./resolve-playlist";
import { fetchPlaylistPerformances, resolvePlaylistPerformances } from "../api/playlists";
vi.mock("../api/playlists", () => ({ fetchPlaylistPerformances: vi.fn(), resolvePlaylistPerformances: vi.fn() }));
const item = (id: string) => ({ song: { id: "song" }, performance: { id } });
const page = (ids: string[], nextCursor: string | null = null, catalogRevision = 1) => ({ data: { items: ids.map(item), unavailableIds: [] }, nextCursor, catalogRevision, generatedAt: "now" });
beforeEach(() => vi.resetAllMocks());
describe("whole playlist resolution", () => {
  it("collects all pages and includes different performances of the same song", async () => {
    vi.mocked(fetchPlaylistPerformances).mockResolvedValueOnce(page(Array.from({ length: 60 }, (_, i) => `p${i}`), "next") as never).mockResolvedValueOnce(page(["last"]) as never);
    expect((await collectPlaylist({ relation: "cover" }, {})).items).toHaveLength(61);
    expect(fetchPlaylistPerformances).toHaveBeenLastCalledWith({ relation: "cover", limit: 60, cursor: "next" }, {});
  });
  it("fails atomically on a changed revision or failed later page", async () => {
    vi.mocked(fetchPlaylistPerformances).mockResolvedValueOnce(page(["first"], "next") as never).mockResolvedValueOnce(page(["second"], null, 2) as never);
    await expect(collectPlaylist({}, {})).rejects.toThrow("변경");
    vi.mocked(fetchPlaylistPerformances).mockResolvedValueOnce(page(["first"], "next") as never).mockRejectedValueOnce(new Error("offline"));
    await expect(collectPlaylist({}, {})).rejects.toThrow("offline");
  });
  it("preserves saved order and resolves at most 60 IDs per request", async () => {
    vi.mocked(resolvePlaylistPerformances).mockImplementation(async ids => page([...ids].reverse()) as never);
    const ids = Array.from({ length: 125 }, (_, index) => `p${index}`);
    expect((await collectPlaylist(ids, {})).items.map(item => item.performance.id)).toEqual(ids);
    expect(vi.mocked(resolvePlaylistPerformances).mock.calls.map(call => call[0].length)).toEqual([60, 60, 5]);
  });
  it("does not return prepared data after cancellation", async () => {
    const controller = new AbortController();
    vi.mocked(fetchPlaylistPerformances).mockImplementation(async () => { controller.abort(); return page(["p"]) as never; });
    await expect(collectPlaylist({}, { signal: controller.signal })).rejects.toThrow();
  });
});
