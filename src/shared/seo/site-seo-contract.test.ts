import { describe, expect, it } from "vitest";
import { getSiteDefinition } from "@contracts/site-definition";
import { safeSiteContentUrl } from "@contracts/site-public-content";
import {
  buildFeedSiteSeo,
  buildProfileSiteSeo,
  buildFixedSiteSeo,
  isFeedPublic,
  normalizeSitePath,
  resolveSiteSeo,
  STATIC_SHELL_PATHS,
} from "@contracts/site-seo";

describe("site SEO contract", () => {
  it("uses the explicit site for the same route and rejects an unresolved origin", () => {
    const otw = getSiteDefinition("otw");
    const luvdia = { ...getSiteDefinition("luvdia"), publicOrigin: "http://localhost:5174" };
    expect(resolveSiteSeo("/weekly", otw)).toMatchObject({ title: "오버더월 주간 스케쥴", canonical: "https://otw-schedule.info/weekly" });
    expect(resolveSiteSeo("/weekly", luvdia)).toMatchObject({ title: "LuvDia Schedule 주간 스케쥴", canonical: "http://localhost:5174/weekly" });
    expect(() => resolveSiteSeo("/weekly", getSiteDefinition("luvdia"))).toThrow(/origin/i);
    expect(buildFeedSiteSeo(false, luvdia)).toMatchObject({ robots: "noindex,follow", sitemap: false, canonical: "http://localhost:5174/feed" });
    expect(resolveSiteSeo("/play", luvdia)).toMatchObject({ title: "LuvDia Play | LuvDia Schedule", robots: "noindex,nofollow", sitemap: false });
  });
  it("resolves content links against its site while retaining URL safety", () => {
    const luvdia = { ...getSiteDefinition("luvdia"), publicOrigin: "http://localhost:5174" };
    expect(safeSiteContentUrl("profile/member", luvdia)).toBe("http://localhost:5174/profile/member");
    expect(safeSiteContentUrl("/feed?tab=x#post", luvdia)).toBe("/feed?tab=x#post");
    expect(safeSiteContentUrl("mailto:397love@gmail.com", luvdia)).toBe("mailto:397love@gmail.com");
    expect(safeSiteContentUrl("javascript:alert(1)", luvdia)).toBeUndefined();
  });
  it("maps public fixed routes to canonical indexable metadata", () => {
    for (const [path, metadata] of Object.entries(buildFixedSiteSeo(site))) {
      expect(metadata.path).toBe(path);
      expect(metadata.robots).toBe("index,follow");
      expect(metadata.canonical).toBe(
        path === "/" ? "https://otw-schedule.info/" : `https://otw-schedule.info${path}`,
      );
      expect(metadata.sitemap).toBe(true);
    }
  });

  it("normalizes queries, hashes, duplicate and trailing slashes", () => {
    expect(normalizeSitePath("/weekly/?utm_source=test#today")).toBe("/weekly");
    expect(normalizeSitePath("https://example.com//notice///?x=1")).toBe("/notice");
    expect(resolveSiteSeo("/admin/settings/?tab=x", site).robots).toBe(
      "noindex,nofollow",
    );
  });

  it("uses the public feed policy consistently", () => {
    expect(
      isFeedPublic({
        xVisibility: "members",
        cafeEnabled: true,
        cafeVisibility: "public",
      }),
    ).toBe(true);
    expect(
      isFeedPublic({
        xVisibility: "private",
        cafeEnabled: false,
        cafeVisibility: "public",
      }),
    ).toBe(false);
    expect(buildFeedSiteSeo(false, site).robots).toBe("noindex,follow");
    expect(buildFeedSiteSeo(false, site).sitemap).toBe(false);
  });

  it("builds escaped-ready profile metadata and clamps descriptions", () => {
    const metadata = buildProfileSiteSeo({
      code: "member_code",
      name: "멤버 & 이름",
      introduction: `  ${"가".repeat(160)}  `,
      profileImages: [
        {
          id: null,
          memberUid: 1,
          imageUrl: "/profile/member_code.webp",
          alt: null,
          sortOrder: 0,
        },
      ],
    }, site);
    expect([...metadata.description]).toHaveLength(155);
    expect(metadata.title).toBe("멤버 & 이름 프로필 | 오버더월");
    expect(metadata.image).toBe(
      "https://otw-schedule.info/profile/member_code.webp",
    );
  });

  it("keeps utility and unknown routes out of the index", () => {
    expect(resolveSiteSeo("/snapshot", site).robots).toBe("noindex,follow");
    expect(resolveSiteSeo("/missing", site).robots).toBe("noindex,nofollow");
  });

  it("publishes dedicated metadata for the rights notice", () => {
    expect(resolveSiteSeo("/rights", site)).toMatchObject({
      title: "저작권 및 권리 안내 | 오버더월",
      robots: "index,follow",
      sitemap: true,
    });
    expect(STATIC_SHELL_PATHS).toContain("/rights");
  });

  it("generates a static shell for the OTW Play admin entry point", () => {
    expect(STATIC_SHELL_PATHS).toContain("/admin/otw-play");
    expect(resolveSiteSeo("/admin/otw-play", site).robots).toBe(
      "noindex,nofollow",
    );
  });

  it("labels the admin-only OTW Play preview without indexing it", () => {
    expect(resolveSiteSeo("/play", site)).toMatchObject({
      title: "OTW Play | 오버더월",
      robots: "noindex,nofollow",
      sitemap: false,
    });
    expect(resolveSiteSeo("/play/songs/example", site).title).toBe(
      "OTW Play | 오버더월",
    );
    expect(STATIC_SHELL_PATHS).not.toContain("/play");
  });
});

const site = getSiteDefinition("otw");
