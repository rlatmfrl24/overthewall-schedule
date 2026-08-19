import { describe, expect, it } from "vitest";
import type { MemberProfileDto } from "@contracts/members";
import type { Env } from "../../../platform/types";
import type { SiteSeoReader } from "../application/ports/site-seo-reader";
import { SiteSeoService } from "../application/site-seo-service";
import { createSiteSeoHandler } from "./handler";

const shell = `<!doctype html><html lang="ko"><head><title>home</title><meta data-site-seo="description" name="description" content="home"><meta data-site-seo="robots" name="robots" content="index,follow"><link data-site-seo="canonical" rel="canonical" href="https://otw-schedule.info/"><meta data-site-seo="og:title" property="og:title" content="home"><meta data-site-seo="og:description" property="og:description" content="home"><meta data-site-seo="og:url" property="og:url" content="https://otw-schedule.info/"><meta data-site-seo="og:type" property="og:type" content="website"><meta data-site-seo="twitter:card" name="twitter:card" content="summary"></head><body><div id="root"></div></body></html>`;

const profile = {
  code: "Alpha",
  name: "알파",
  introduction: "알파 소개",
  profileImages: [
    { id: null, memberUid: 1, imageUrl: "/profile/Alpha.webp", alt: null, sortOrder: 0 },
  ],
} as unknown as MemberProfileDto;

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

const testAssets = {
  fetch: async () =>
    new Response(shell, { headers: { "Content-Type": "text/html" } }),
};

const setup = (state: "public" | "private") => {
  const reader = createReader({
    readFeedState: async () => ({
      xVisibility: state,
      cafeEnabled: false,
      cafeVisibility: "private",
    }),
    listActiveProfileCodes: async () => [profile.code],
    findActiveProfileByCode: async (code) =>
      code.toLowerCase() === profile.code.toLowerCase() ? profile : null,
  });
  const service = new SiteSeoService(reader);
  const handler = createSiteSeoHandler(() => service);
  const testEnv = {
    ASSETS: testAssets,
  } as unknown as Env;
  return { handler, testEnv };
};

describe("SEO HTML worker", () => {
  it("rewrites feed metadata from public settings", async () => {
    const { handler, testEnv } = setup("public");
    const response = await handler(new Request("https://otw-schedule.info/feed"), testEnv);
    expect(response?.status).toBe(200);
    const html = await response?.text();
    expect(html).toContain('content="index,follow"');
    expect(html).toContain('href="https://otw-schedule.info/feed"');
  });

  it("uses noindex for a private feed", async () => {
    const { handler, testEnv } = setup("private");
    const response = await handler(new Request("https://otw-schedule.info/feed"), testEnv);
    expect(await response?.text()).toContain('content="noindex,follow"');
  });

  it("falls back to noindex when feed settings cannot be read", async () => {
    const reader = createReader({
      readFeedState: async () => {
        throw new Error("settings unavailable");
      },
      listActiveProfileCodes: async () => [],
      findActiveProfileByCode: async () => null,
    });
    const handler = createSiteSeoHandler(() => new SiteSeoService(reader));
    const testEnv = {
      ASSETS: { fetch: async () => new Response(shell) },
    } as unknown as Env;
    const response = await handler(new Request("https://otw-schedule.info/feed"), testEnv);
    expect(response?.status).toBe(200);
    expect(await response?.text()).toContain('content="noindex,follow"');
  });

  it("serves, canonicalizes, and rejects profile paths correctly", async () => {
    const { handler, testEnv } = setup("public");
    const valid = await handler(new Request("https://otw-schedule.info/profile/Alpha"), testEnv);
    expect(valid?.status).toBe(200);
    const html = await valid?.text();
    expect(html).toContain("알파 프로필 | 오버더월");
    expect(html).toContain("https://otw-schedule.info/profile/Alpha.webp");

    const variant = await handler(new Request("https://otw-schedule.info/profile/alpha"), testEnv);
    expect(variant?.status).toBe(301);
    expect(variant?.headers.get("Location")).toBe("https://otw-schedule.info/profile/Alpha");

    const missing = await handler(new Request("https://otw-schedule.info/profile/missing"), testEnv);
    expect(missing?.status).toBe(404);
    expect(await missing?.text()).toContain('content="noindex,nofollow"');

    const trailing = await handler(new Request("https://otw-schedule.info/profile/Alpha/?from=test"), testEnv);
    expect(trailing?.status).toBe(301);
    expect(trailing?.headers.get("Location")).toBe("https://otw-schedule.info/profile/Alpha");
  });

  it("returns a sitemap without lastmod", async () => {
    const { handler, testEnv } = setup("public");
    const response = await handler(new Request("https://otw-schedule.info/sitemap.xml"), testEnv);
    expect(response?.headers.get("Content-Type")).toBe("application/xml; charset=utf-8");
    const xml = await response?.text();
    expect(xml).toContain("<loc>https://otw-schedule.info/feed</loc>");
    expect(xml).not.toContain("lastmod");
  });

  it("returns a retryable 503 instead of an incomplete sitemap", async () => {
    const reader = createReader({
      readFeedState: async () => {
        throw new Error("database unavailable");
      },
      listActiveProfileCodes: async () => ["partial"],
      findActiveProfileByCode: async () => null,
    });
    const handler = createSiteSeoHandler(() => new SiteSeoService(reader));
    const response = await handler(
      new Request("https://otw-schedule.info/sitemap.xml"),
      {} as Env,
    );
    expect(response?.status).toBe(503);
    expect(response?.headers.get("Retry-After")).toBe("300");
    expect(response?.headers.get("Content-Type")).not.toContain("xml");
  });

  it.each([
    [false, false, "noindex,nofollow", false],
    [true, false, "noindex,follow", false],
    [true, true, "index,follow", true],
  ] as const)(
    "serves the Play visibility matrix for public=%s navigation=%s",
    async (publicReadEnabled, navigationVisible, robots, indexable) => {
      const reader = createReader({
        readPlayState: async () => ({
          revision: 2,
          readModelRevision: 2,
          publicReadEnabled,
          navigationVisible,
          updatedAt: 2,
        }),
        listPublishedPlaySongSlugs: async () => ["visible-song"],
        findPublishedPlaySongBySlug: async (slug) =>
          slug === "visible-song"
            ? {
                slug,
                title: "Visible Song",
                originalArtistNames: ["Original Artist"],
                mainVocalNames: ["Main Vocal"],
                thumbnailUrl: "https://i.example/visible.jpg",
              }
            : null,
      });
      const handler = createSiteSeoHandler(
        () => new SiteSeoService(reader),
      );
      const testEnv = { ASSETS: testAssets } as unknown as Env;

      for (const path of ["/play", "/play/songs", "/play/songs/visible-song"]) {
        const response = await handler(
          new Request(`https://otw-schedule.info${path}?performance=ignored`),
          testEnv,
        );
        expect(response?.status).toBe(200);
        const html = await response?.text();
        const expectedRobots =
          path === "/play/songs" && publicReadEnabled
            ? "noindex,follow"
            : robots;
        expect(html).toContain(`content="${expectedRobots}"`);
        expect(html).not.toContain("performance=ignored");
        expect(response?.headers.get("Cache-Control")).toBe(
          indexable && path !== "/play/songs"
            ? "public, max-age=60, s-maxage=60"
            : "no-store",
        );
      }

      const sitemap = await handler(
        new Request("https://otw-schedule.info/sitemap.xml"),
        testEnv,
      );
      const xml = await sitemap?.text();
      expect(xml?.includes("https://otw-schedule.info/play</loc>")).toBe(
        indexable,
      );
      expect(xml?.includes("/play/songs/visible-song</loc>")).toBe(indexable);
      expect(xml).not.toContain("<lastmod>");
      expect(sitemap?.headers.get("Cache-Control")).toBe(
        "public, max-age=60, s-maxage=300",
      );
    },
  );

  it("escapes Play metadata and injects only the selected thumbnail", async () => {
    const reader = createReader({
      readPlayState: async () => ({
        revision: 2,
        readModelRevision: 2,
        publicReadEnabled: true,
        navigationVisible: true,
        updatedAt: 2,
      }),
      findPublishedPlaySongBySlug: async () => ({
        slug: "escaped-song",
        title: '<Track & "One">',
        originalArtistNames: ["Artist & Co"],
        mainVocalNames: ["Singer <Main>"],
        thumbnailUrl: "https://i.example/image?a=1&b=2",
      }),
    });
    const handler = createSiteSeoHandler(() => new SiteSeoService(reader));
    const response = await handler(
      new Request("https://otw-schedule.info/play/songs/escaped-song?q=ignored"),
      { ASSETS: testAssets } as unknown as Env,
    );
    const html = await response?.text();
    expect(response?.status).toBe(200);
    expect(html).toContain("&lt;Track &amp; \"One\"&gt; | OTW Play");
    expect(html).not.toContain('<Track & "One">');
    expect(html).toContain(
      'href="https://otw-schedule.info/play/songs/escaped-song"',
    );
    expect(html).toContain("https://i.example/image?a=1&amp;b=2");
  });

  it("canonicalizes Play routes, preserves query filters, and rejects unknown paths", async () => {
    const handler = createSiteSeoHandler(
      () => new SiteSeoService(createReader()),
    );
    const testEnv = { ASSETS: testAssets } as unknown as Env;

    const trailing = await handler(
      new Request("https://otw-schedule.info/play/songs/?q=cover&sort=recent"),
      testEnv,
    );
    expect(trailing?.status).toBe(301);
    expect(trailing?.headers.get("Location")).toBe(
      "https://otw-schedule.info/play/songs?q=cover&sort=recent",
    );
    const discover = await handler(
      new Request("https://otw-schedule.info/play/discover?from=old"),
      testEnv,
    );
    expect(discover?.status).toBe(301);
    expect(discover?.headers.get("Location")).toBe(
      "https://otw-schedule.info/play?from=old",
    );

    for (const path of [
      "/play/unknown",
      "/play/songs/bad%2Fslug",
      "/play/songs/bad%00slug",
    ]) {
      const response = await handler(
        new Request(`https://otw-schedule.info${path}`),
        testEnv,
      );
      expect(response?.status).toBe(404);
      expect(response?.headers.get("Cache-Control")).toBe("no-store");
      expect(response?.headers.get("X-Robots-Tag")).toBe(
        "noindex,nofollow",
      );
    }
  });

  it("keeps member Play routes private without catalog reads", async () => {
    const handler = createSiteSeoHandler(
      () =>
        new SiteSeoService(
          createReader({
            readPlayState: async () => {
              throw new Error("must not read catalog state");
            },
          }),
        ),
    );
    const testEnv = { ASSETS: testAssets } as unknown as Env;
    for (const path of ["/play/submit", "/play/submissions"]) {
      const response = await handler(
        new Request(`https://otw-schedule.info${path}`),
        testEnv,
      );
      expect(response?.status).toBe(200);
      expect(response?.headers.get("X-Robots-Tag")).toBe(
        "noindex,nofollow",
      );
    }
  });

  it("matches GET headers for HEAD, rejects writes, and fails closed on missing dependencies", async () => {
    const reader = createReader();
    const handler = createSiteSeoHandler(() => new SiteSeoService(reader));
    const testEnv = { ASSETS: testAssets } as unknown as Env;
    const get = await handler(
      new Request("https://otw-schedule.info/play"),
      testEnv,
    );
    const head = await handler(
      new Request("https://otw-schedule.info/play", { method: "HEAD" }),
      testEnv,
    );
    expect(head?.status).toBe(get?.status);
    expect(head?.headers.get("Cache-Control")).toBe(
      get?.headers.get("Cache-Control"),
    );
    expect(await head?.text()).toBe("");

    const write = await handler(
      new Request("https://otw-schedule.info/play", { method: "POST" }),
      testEnv,
    );
    expect(write?.status).toBe(405);
    expect(write?.headers.get("Allow")).toBe("GET, HEAD");

    const missingAssets = await handler(
      new Request("https://otw-schedule.info/play"),
      {} as Env,
    );
    expect(missingAssets?.status).toBe(503);
    expect(missingAssets?.headers.get("Retry-After")).toBe("300");

    const failedReader = createReader({
      readPlayState: async () => {
        throw new Error("D1 unavailable");
      },
    });
    const failedHandler = createSiteSeoHandler(
      () => new SiteSeoService(failedReader),
    );
    const failed = await failedHandler(
      new Request("https://otw-schedule.info/play"),
      testEnv,
    );
    expect(failed?.status).toBe(503);
    expect(failed?.headers.get("Cache-Control")).toBe("no-store");
  });
});
