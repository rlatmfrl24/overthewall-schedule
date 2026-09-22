import { describe, expect, it, vi } from "vitest";
import type { MemberDto } from "@contracts/members";
import { siteContentCacheControl, scheduleRange } from "@contracts/site-public-content";
import type { SiteContentReader } from "./ports/site-content-reader";
import type { SiteSeoReader } from "./ports/site-seo-reader";
import { SiteContentService } from "./site-content-service";
import { SiteSeoService } from "./site-seo-service";

const now = Date.parse("2026-09-22T14:59:30Z");
const setup = (requiresMembership: boolean | undefined = true) => {
  const seo: SiteSeoReader = {
    readFeedState: vi.fn(async () => ({ xVisibility: "public", cafeEnabled: true, cafeVisibility: "members" })),
    listActiveProfileCodes: async () => [], findActiveProfileByCode: async () => null,
    readPlayState: vi.fn(async () => ({ revision: 1, readModelRevision: 1, publicReadEnabled: true, navigationVisible: true, requiresMembership, updatedAt: 1 })),
    readPlayMemberSummaries: async () => [], listPublishedPlaySongSlugs: async () => ["song"],
    findPublishedPlaySongBySlug: vi.fn(async () => ({ slug: "song", title: "공개 곡", originalArtistNames: [], mainVocalNames: [], thumbnailUrl: null })),
  };
  const reader: SiteContentReader = {
    readSchedule: vi.fn(async (startDate, endDate) => ({ startDate, endDate, updatedAt: "2026-09-22T00:00:00Z", members: [{ uid: 1, name: "멤버", code: "member" } as MemberDto], ddays: [], notices: [], schedules: [] })),
    readNotices: vi.fn(async () => []), readVideos: vi.fn(async () => []),
    readFeed: vi.fn(async () => [{ id: "x", title: "공개 X", status: "available" as const, updatedAt: null, items: [{ title: "공개 게시글" }] }]),
    readPlaySongs: vi.fn(async () => [{ id: "play", title: "공개 곡", status: "available" as const, updatedAt: null, items: [{ title: "공개 곡", url: "/play/songs/song" }] }]),
  };
  return { seo, reader, service: new SiteContentService(seo, reader) };
};

describe("public site content", () => {
  it("uses Korean dates, Monday weeks and expires before midnight without fabricating live status", async () => {
    const { reader, service } = setup();
    const content = (await service.read("/weekly", undefined, now))!;
    expect(reader.readSchedule).toHaveBeenCalledWith("2026-09-21", "2026-09-27");
    expect(content.sections[0].items).toHaveLength(7);
    expect(content.sections[0].items[0].text).toBe("일정 미등록");
    expect(content.expiresAt).toBe("2026-09-22T15:00:00.000Z");
    expect(siteContentCacheControl(content, now)).toContain("s-maxage=30");
    expect(scheduleRange("/weekly", "2026-01-01")).toEqual({ start: "2025-12-29", end: "2026-01-04" });
  });

  it("does not restart a cached schedule's age and stops using expired content", async () => {
    const { seo, reader, service } = setup();
    const cached = (await service.read("/", undefined, now))!;
    const cache = { get: vi.fn(async () => cached), put: vi.fn() };
    const cachedService = new SiteContentService(seo, reader, cache);
    vi.mocked(reader.readSchedule).mockClear();
    const hit = (await cachedService.read("/", undefined, now + 10_000))!;
    expect(hit.generatedAt).toBe(cached.generatedAt);
    expect(siteContentCacheControl(hit, now + 10_000)).toContain("s-maxage=20");
    expect(reader.readSchedule).not.toHaveBeenCalled();
    await cachedService.read("/", undefined, now + 40_000);
    expect(reader.readSchedule).toHaveBeenCalledWith("2026-09-23", "2026-09-23");
  });

  it.each([true, undefined])("does not disclose Play when membership policy is %s", async requiresMembership => {
    const { service, reader, seo } = setup();
    vi.mocked(seo.readPlayState).mockResolvedValue({ ...await seo.readPlayState(), requiresMembership });
    for (const path of ["/play", "/play/songs/song"]) {
      const content = (await service.read(path))!;
      expect(content.sections).toEqual([]);
      expect(content.structuredData).toBeNull();
      expect(content.metadata.robots).toBe("noindex,nofollow");
    }
    expect(reader.readPlaySongs).not.toHaveBeenCalled();
    expect(seo.findPublishedPlaySongBySlug).not.toHaveBeenCalled();
    expect(await new SiteSeoService(seo).buildSitemapUrls()).not.toContain("https://otw-schedule.info/play/songs/song");
  });

  it("includes only published Play pages under explicit anonymous policy", async () => {
    const { service, seo, reader } = setup(false);
    const content = (await service.read("/play/songs/song"))!;
    expect(content.sections[0].items[0].title).toBe("공개 곡");
    expect(siteContentCacheControl(content)).toBe("no-store");
    expect(reader.readPlaySongs).toHaveBeenCalledWith("song");
    expect(await new SiteSeoService(seo).buildSitemapUrls()).toContain(content.metadata.canonical);
    vi.mocked(seo.findPublishedPlaySongBySlug).mockResolvedValue(null);
    expect(await service.read("/play/songs/draft")).toBeNull();
    expect(await new SiteSeoService(seo).readPlaySongs()).toMatchObject({ robots: "noindex,follow", sitemap: false });
  });

  it("rejects a public policy change during a feed read", async () => {
    const { service, seo, reader } = setup();
    vi.mocked(reader.readFeed).mockImplementation(async state => {
      expect(state.cafeVisibility).toBe("members");
      vi.mocked(seo.readFeedState).mockResolvedValue({ ...state, xVisibility: "private" });
      return [];
    });
    await expect(service.read("/feed")).rejects.toThrow("visibility changed");
  });

  it("rejects Play access revocation during the content read", async () => {
    const { service, seo, reader } = setup(false);
    const state = await seo.readPlayState();
    vi.mocked(reader.readPlaySongs).mockImplementation(async () => {
      vi.mocked(seo.readPlayState).mockResolvedValue({ ...state, requiresMembership: true });
      return [];
    });
    await expect(service.read("/play")).rejects.toThrow("access changed");
  });

  it("does not convert a core read failure into an empty successful schedule", async () => {
    const { service, reader } = setup();
    vi.mocked(reader.readSchedule).mockRejectedValue(new Error("database unavailable"));
    await expect(service.read("/")).rejects.toThrow("database unavailable");
  });
});
