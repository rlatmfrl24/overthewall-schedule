import { beforeEach, expect, it, vi } from "vitest";
import { OTW_PLAY_ADMIN_PREVIEW_HEADER } from "@contracts/otw-play";
import { fetchDefaultPlaylists, fetchPlaylistPerformances, resolvePlaylistPerformances, fetchMyPlaylists, createMyPlaylist } from "./playlists";

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), site: { id: "otw" } }));
vi.mock("@/shared/api/client", () => ({ apiFetch: mocks.apiFetch }));
vi.mock("@/shared/config/site", () => ({ site: mocks.site }));
beforeEach(() => { mocks.apiFetch.mockReset(); mocks.site.id = "otw"; });

it.each(["otw", "luvdia"])("uses the %s audience for default playlists and queue resolution", async siteId => {
  mocks.site.id = siteId;
  await fetchDefaultPlaylists();
  await fetchPlaylistPerformances({ scope: "official" });
  await resolvePlaylistPerformances(["performance"]);
  expect(mocks.apiFetch).toHaveBeenCalledTimes(3);
  for (const [, options] of mocks.apiFetch.mock.calls) expect(options.auth).toBe("omit");
});

it("authenticates administrator preview and personal playlist reads/writes", async () => {
  await fetchDefaultPlaylists({ adminPreview: true });
  expect(mocks.apiFetch).toHaveBeenLastCalledWith("/api/play/playlists/defaults", expect.objectContaining({
    auth: "required", headers: { [OTW_PLAY_ADMIN_PREVIEW_HEADER]: "1" },
  }));
  await fetchMyPlaylists();
  expect(mocks.apiFetch).toHaveBeenLastCalledWith("/api/play/me/playlists", expect.objectContaining({ auth: "required" }));
  await createMyPlaylist({ title: "Private", description: "", performanceIds: [], originDefaultId: null }, "request");
  expect(mocks.apiFetch).toHaveBeenLastCalledWith("/api/play/me/playlists", expect.objectContaining({ auth: "required", method: "POST" }));
});
