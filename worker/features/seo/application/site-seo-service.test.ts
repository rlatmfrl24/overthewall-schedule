import { describe, expect, it } from "vitest";
import type { MemberProfileDto } from "@contracts/members";
import type { SiteSeoReader } from "./ports/site-seo-reader";
import { SiteSeoService } from "./site-seo-service";

const member = (code: string): MemberProfileDto =>
  ({ code, name: code, introduction: null, profileImages: [] }) as unknown as MemberProfileDto;

const createReader = (
  overrides: Partial<SiteSeoReader> = {},
): SiteSeoReader => ({
  readFeedState: async () => ({
    xVisibility: "private",
    cafeEnabled: false,
    cafeVisibility: "private",
  }),
  listActiveProfileCodes: async () => [],
  findActiveProfileByCode: async () => null,
  readPlayState: async () => ({
    revision: 1,
    readModelRevision: 1,
    publicReadEnabled: false,
    navigationVisible: false,
    updatedAt: 1,
  }),
  listPublishedPlaySongSlugs: async () => [],
  findPublishedPlaySongBySlug: async () => null,
  ...overrides,
});

describe("SiteSeoService", () => {
  it("includes only public feed and active profiles in a deduplicated sitemap", async () => {
    const reader = createReader({
      readFeedState: async () => ({
        xVisibility: "public",
        cafeEnabled: false,
        cafeVisibility: "private",
      }),
      listActiveProfileCodes: async () => ["alpha", "alpha", "beta"],
      findActiveProfileByCode: async (code) => member(code),
    });
    const urls = await new SiteSeoService(reader).buildSitemapUrls();
    expect(urls).toContain("https://otw-schedule.info/feed");
    expect(urls.filter((url) => url.endsWith("/profile/alpha"))).toHaveLength(1);
    expect(urls.every((url) => !url.includes("?") && url.startsWith("https://"))).toBe(true);
  });

  it("omits a non-public feed", async () => {
    const reader = createReader({
      readFeedState: async () => ({
        xVisibility: "members",
        cafeEnabled: true,
        cafeVisibility: "private",
      }),
      listActiveProfileCodes: async () => [],
      findActiveProfileByCode: async () => null,
    });
    expect(await new SiteSeoService(reader).buildSitemapUrls()).not.toContain(
      "https://otw-schedule.info/feed",
    );
  });

  it.each([
    [false, false, "noindex,nofollow", false],
    [true, false, "noindex,follow", false],
    [true, true, "index,follow", true],
  ] as const)(
    "applies the Play robots and sitemap matrix for public=%s navigation=%s",
    async (publicReadEnabled, navigationVisible, robots, sitemap) => {
      const reader = createReader({
        readPlayState: async () => ({
          revision: 3,
          readModelRevision: publicReadEnabled ? 3 : null,
          publicReadEnabled,
          navigationVisible,
          updatedAt: 10,
        }),
        listPublishedPlaySongSlugs: async () => ["song-one"],
        findPublishedPlaySongBySlug: async () => ({
          slug: "song-one",
          title: "Song One",
          originalArtistNames: ["Artist"],
          mainVocalNames: ["Singer"],
          thumbnailUrl: "https://i.example/song.jpg",
        }),
      });
      const service = new SiteSeoService(reader);

      expect(await service.readPlayHome()).toMatchObject({ robots, sitemap });
      expect(await service.readPlaySongs()).toMatchObject({
        robots: publicReadEnabled ? "noindex,follow" : "noindex,nofollow",
        sitemap: false,
      });
      expect(await service.findPlaySong("song-one")).toMatchObject({
        robots,
        sitemap,
      });
      const urls = await service.buildSitemapUrls();
      expect(urls.includes("https://otw-schedule.info/play")).toBe(sitemap);
      expect(
        urls.includes("https://otw-schedule.info/play/songs/song-one"),
      ).toBe(sitemap);
      expect(urls).not.toContain("https://otw-schedule.info/play/songs");
    },
  );

  it("fails closed for stale or invalid Play state", async () => {
    const stale = new SiteSeoService(
      createReader({
        readPlayState: async () => ({
          revision: 4,
          readModelRevision: 3,
          publicReadEnabled: true,
          navigationVisible: false,
          updatedAt: 10,
        }),
      }),
    );
    await expect(stale.readPlayHome()).rejects.toThrow(/unavailable/);
    await expect(stale.buildSitemapUrls()).rejects.toThrow(/unavailable/);

    const invalid = new SiteSeoService(
      createReader({
        readPlayState: async () => ({
          revision: 4,
          readModelRevision: 4,
          publicReadEnabled: false,
          navigationVisible: true,
          updatedAt: 10,
        }),
      }),
    );
    await expect(invalid.readPlaySongs()).rejects.toThrow(/unavailable/);
  });

  it("normalizes and limits song metadata without query or private fields", async () => {
    const longName = `  Original\nArtist ${"가".repeat(180)}  `;
    const service = new SiteSeoService(
      createReader({
        readPlayState: async () => ({
          revision: 4,
          readModelRevision: 4,
          publicReadEnabled: true,
          navigationVisible: true,
          updatedAt: 10,
        }),
        findPublishedPlaySongBySlug: async () => ({
          slug: "song & one",
          title: "  Song\nOne  ",
          originalArtistNames: [longName],
          mainVocalNames: ["  Main\tVocal  "],
          thumbnailUrl: null,
        }),
      }),
    );
    const metadata = await service.findPlaySong("song & one");
    expect(metadata?.canonical).toBe(
      "https://otw-schedule.info/play/songs/song%20%26%20one",
    );
    expect(Array.from(metadata?.description ?? "")).toHaveLength(155);
    expect(metadata?.description).not.toMatch(/\s{2,}|\n|\t/);
    expect(metadata?.image).toBeUndefined();
    expect(JSON.stringify(metadata)).not.toMatch(/proposal|review|submitter/i);
  });

  it("deduplicates 5,000 Play slugs and fails closed at 5,001", async () => {
    const slugs = Array.from({ length: 5_000 }, (_, index) => `song-${index}`);
    const base = {
      readPlayState: async () => ({
        revision: 5,
        readModelRevision: 5,
        publicReadEnabled: true,
        navigationVisible: true,
        updatedAt: 10,
      }),
    } satisfies Partial<SiteSeoReader>;
    const allowed = new SiteSeoService(
      createReader({
        ...base,
        listPublishedPlaySongSlugs: async () => [slugs[0]!, ...slugs],
      }),
    );
    const urls = await allowed.buildSitemapUrls();
    expect(
      urls.filter((url) => url === "https://otw-schedule.info/play/songs/song-0"),
    ).toHaveLength(1);

    const excessive = new SiteSeoService(
      createReader({
        ...base,
        listPublishedPlaySongSlugs: async () => [...slugs, "song-5000"],
      }),
    );
    await expect(excessive.buildSitemapUrls()).rejects.toThrow(/limit/);
  });
});
