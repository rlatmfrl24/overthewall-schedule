import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayDefaultPlaylist, PlayPlaylist } from "@contracts/otw-play-playlists";
import type { DefaultPlaylistSetting, PlaylistCatalogReader, PlaylistRepository, DefaultPlaylistSettingsRepository } from "./ports/playlist-repository";
import type { PublicCatalogPerformanceDetail } from "./ports/public-catalog-reader";
import type { PublicCatalogService } from "./public-catalog-service";
import { PlaylistService } from "./playlist-service";

const track = (id: string, relation: "original" | "cover" = "cover"): PublicCatalogPerformanceDetail => ({
  song: { id: "song", slug: "song", title: "공개 곡", normalizedTitle: "공개 곡", isOtwOriginal: true,
    originalReleaseDate: null, originalReleasePrecision: "unknown", originalArtists: [], tags: [] },
  performance: { id, relation, releaseType: "official_mv", participation: "solo", releasedAt: 1, tags: [], participants: [],
    primarySourceId: "primary", playbackSourceId: "fallback", playable: true, fallbackReason: null,
    sources: [{ id: "primary", provider: "youtube", externalId: "abcdefghijk", title: "비활성", thumbnailUrl: "https://img.test/wrong.jpg",
      durationSeconds: null, providerPublishedAt: null, availabilityStatus: "deleted", sourceRole: "official", priority: 0, isPrimary: true,
      startSeconds: 0, endSeconds: null, channel: { id: "ch", displayName: "channel", channelRole: "otw_official" } },
    { id: "fallback", provider: "youtube", externalId: "lmnopqrstuv", title: "현재 소스", thumbnailUrl: `https://img.test/${id}.jpg`,
      durationSeconds: null, providerPublishedAt: null, availabilityStatus: "playable", sourceRole: "alternate", priority: 1, isPrimary: false,
      startSeconds: 0, endSeconds: null, channel: { id: "ch", displayName: "channel", channelRole: "otw_official" } }] },
});
const context = { allowDisabledRead: false, allowSharedCache: false };
const state = { revision: 5, readModelRevision: 5, publicReadEnabled: true };
const saved: PlayPlaylist = { id: "mine", title: "목록", description: "", version: 2, performanceIds: ["a", "b"],
  representativePerformanceId: "b", imageUrl: null, itemCount: 2, originDefaultId: null, createdAt: 1, updatedAt: 1 };
const base: PlayDefaultPlaylist = { id: "cover", title: "커버곡 모음", description: "기본 설명", version: 1, representativePerformanceId: null,
  imageUrl: "https://img.test/auto.jpg", songCount: 1, performanceCount: 2, query: { relation: "cover" } };
const reader = { readPlaylistDefaults: vi.fn<PlaylistCatalogReader["readPlaylistDefaults"]>(),
  readPlaylistPerformances: vi.fn<PlaylistCatalogReader["readPlaylistPerformances"]>(), resolvePlaylistPerformances: vi.fn<PlaylistCatalogReader["resolvePlaylistPerformances"]>() };
const repo = { findCreate: vi.fn<PlaylistRepository["findCreate"]>(), list: vi.fn<PlaylistRepository["list"]>(), read: vi.fn<PlaylistRepository["read"]>(),
  create: vi.fn<PlaylistRepository["create"]>(), save: vi.fn<PlaylistRepository["save"]>(), delete: vi.fn<PlaylistRepository["delete"]>() };
const settings = { list: vi.fn<DefaultPlaylistSettingsRepository["list"]>(), save: vi.fn<DefaultPlaylistSettingsRepository["save"]>() };
const readPublicState = vi.fn(async () => state);
const service = new PlaylistService({ readPublicState } as unknown as PublicCatalogService, reader, repo, settings);
const actor = { userId: "admin", displayName: "관리자", ipAddress: null };
beforeEach(() => {
  vi.resetAllMocks(); repo.findCreate.mockResolvedValue(null); readPublicState.mockResolvedValue(state);
  reader.readPlaylistDefaults.mockResolvedValue([base]);
  reader.resolvePlaylistPerformances.mockImplementation(async ids => ids.filter(id => id !== "private").map(id => track(id)));
  repo.list.mockResolvedValue([saved]); repo.read.mockResolvedValue(saved); repo.save.mockResolvedValue(true); repo.create.mockResolvedValue(saved);
  settings.list.mockResolvedValue([]); settings.save.mockResolvedValue(true);
});

describe("playlist artwork authority", () => {
  it("uses the selected playable source and excludes item arrays from summaries", async () => {
    const result = await service.list(context, "owner");
    expect(result[0]).toMatchObject({ representativePerformanceId: "b", imageUrl: "https://img.test/b.jpg" });
    expect(result[0]).not.toHaveProperty("performanceIds");
    expect(reader.resolvePlaylistPerformances).toHaveBeenCalledTimes(1);
  });
  it("retains a withdrawn choice and resolves a fallback beyond page one in bounded batches", async () => {
    const ids = [...Array.from({ length: 65 }, (_, i) => `gone-${i}`), "a"];
    repo.read.mockResolvedValue({ ...saved, representativePerformanceId: "private", performanceIds: ["private", ...ids] });
    reader.resolvePlaylistPerformances.mockImplementation(async ids => ids.includes("a") ? [track("a")] : []);
    expect(await service.read(context, "owner", "mine")).toMatchObject({ representativePerformanceId: "private", imageUrl: "https://img.test/a.jpg" });
    expect(reader.resolvePlaylistPerformances.mock.calls.every(([ids]) => ids.length <= 60)).toBe(true);
    expect(repo.save).not.toHaveBeenCalled();
  });
  it("handles an empty list without catalog requests", async () => {
    repo.list.mockResolvedValue([{ ...saved, representativePerformanceId: null, performanceIds: [], itemCount: 0 }]);
    expect((await service.list(context, "owner"))[0].imageUrl).toBeNull();
    expect(reader.resolvePlaylistPerformances).not.toHaveBeenCalled();
  });
  it("recovers a committed create after its representative becomes private without creating a duplicate", async () => {
    const replay = { ...saved, representativePerformanceId: "private", performanceIds: ["private", "a"] };
    repo.findCreate.mockResolvedValue(replay); repo.read.mockResolvedValue(replay);
    expect(await service.write(context, "owner", replay, { requestId: "uncertain" }))
      .toMatchObject({ id: "mine", representativePerformanceId: "private", imageUrl: "https://img.test/a.jpg" });
    expect(repo.create).not.toHaveBeenCalled();
  });
  it("validates new choices, membership, and playable artwork while retaining unchanged withdrawn choices", async () => {
    await expect(service.write(context, "owner", { ...saved, representativePerformanceId: "outside" }, { id: "mine", expectedVersion: 2 }))
      .rejects.toMatchObject({ code: "PLAY_PLAYLIST_INVALID_REPRESENTATIVE" });
    await expect(service.write(context, "owner", { ...saved, performanceIds: ["private"], representativePerformanceId: "private" }, { id: "mine", expectedVersion: 2 }))
      .rejects.toMatchObject({ code: "PLAY_PLAYLIST_INVALID_REPRESENTATIVE" });
    reader.resolvePlaylistPerformances.mockResolvedValue([]);
    await service.write(context, "owner", saved, { id: "mine", expectedVersion: 2 });
    expect(repo.save).toHaveBeenCalledTimes(1);
  });
  it("supports omitted legacy choices and explicit clearing without resetting order", async () => {
    const legacy = { title: saved.title, description: saved.description, performanceIds: saved.performanceIds, originDefaultId: saved.originDefaultId };
    await service.write(context, "owner", legacy, { id: "mine", expectedVersion: 2 });
    expect(repo.save.mock.calls[0][3]).not.toHaveProperty("representativePerformanceId");
    await service.write(context, "owner", { ...saved, representativePerformanceId: null }, { id: "mine", expectedVersion: 2 });
    expect(repo.save.mock.calls[1][3]).toMatchObject({ representativePerformanceId: null, performanceIds: ["a", "b"] });
  });
});

describe("default playlist presentation settings", () => {
  const override: DefaultPlaylistSetting = { id: "cover", version: 3, title: "새 이름", description: "새 설명", representativePerformanceId: "b" };
  it("overlays settings without moving the catalog revision or returning admin metadata publicly", async () => {
    settings.list.mockResolvedValue([override]);
    const response = await service.defaults(context);
    expect(response).toMatchObject({ catalogRevision: 5, data: { items: [{ title: "새 이름", description: "새 설명", version: 3, imageUrl: "https://img.test/b.jpg" }] } });
    expect(response.data.items[0]).not.toHaveProperty("overrides");
    expect((await service.adminDefaults("cover"))[0].defaults.title).toBe("커버곡 모음");
  });
  it("rejects an original in a cover collection and unauthorized keys", async () => {
    reader.resolvePlaylistPerformances.mockResolvedValue([track("original", "original")]);
    await expect(service.saveDefault("cover", { ...override, representativePerformanceId: "original" }, 0, actor)).rejects.toMatchObject({ code: "PLAY_PLAYLIST_INVALID_REPRESENTATIVE" });
    await expect(service.adminDefaults("nonexistent")).rejects.toMatchObject({ status: 404 });
    expect(settings.save).not.toHaveBeenCalled();
  });
  it("accepts featured vocals but rejects chorus-only membership for a member collection", async () => {
    reader.readPlaylistDefaults.mockResolvedValue([{ ...base, id: "member-3", query: { member: 3 } }]);
    const candidate = track("member");
    candidate.performance.participants = [{ id: "entity", slug: "member", displayName: "멤버", entityKind: "person", creditName: "멤버",
      participantRole: "chorus", creditOrder: 0, kind: "current_member", member: { uid: 3, code: "member", name: "멤버", oshiMark: null, unitName: null } }];
    reader.resolvePlaylistPerformances.mockResolvedValue([candidate]);
    await expect(service.saveDefault("member-3", { ...override, representativePerformanceId: "member" }, 0, actor))
      .rejects.toMatchObject({ code: "PLAY_PLAYLIST_INVALID_REPRESENTATIVE" });
    candidate.performance.participants[0].participantRole = "featured_vocal";
    await service.saveDefault("member-3", { ...override, representativePerformanceId: "member" }, 0, actor);
    expect(settings.save).toHaveBeenCalledTimes(1);
  });
  it("uses automatic artwork when a chosen version no longer belongs to its collection", async () => {
    settings.list.mockResolvedValue([override]); reader.resolvePlaylistPerformances.mockResolvedValue([track("b", "original")]);
    expect((await service.adminDefaults("cover"))[0]).toMatchObject({ representativePerformanceId: "b", representativeAvailable: false, imageUrl: base.imageUrl });
  });
  it("allows admin edits with public access off and preserves version conflict protection", async () => {
    readPublicState.mockResolvedValue({ ...state, publicReadEnabled: false }); settings.list.mockResolvedValue([override]);
    await expect(service.defaults(context)).rejects.toMatchObject({ status: 404 });
    await expect(service.saveDefault("cover", override, 2, actor)).rejects.toMatchObject({ status: 409 });
    settings.save.mockResolvedValue(false);
    await expect(service.saveDefault("cover", override, 3, actor)).rejects.toMatchObject({ status: 409 });
    expect(settings.save).toHaveBeenCalledWith("cover", 3, override, actor);
  });
});
