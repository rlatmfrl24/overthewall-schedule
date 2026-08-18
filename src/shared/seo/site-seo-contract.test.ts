import { describe, expect, it } from "vitest";
import {
  buildFeedSiteSeo,
  buildProfileSiteSeo,
  FIXED_SITE_SEO,
  isFeedPublic,
  normalizeSitePath,
  resolveSiteSeo,
  STATIC_SHELL_PATHS,
} from "@contracts/site-seo";

describe("site SEO contract", () => {
  it("maps public fixed routes to canonical indexable metadata", () => {
    for (const [path, metadata] of Object.entries(FIXED_SITE_SEO)) {
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
    expect(resolveSiteSeo("/admin/settings/?tab=x").robots).toBe(
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
    expect(buildFeedSiteSeo(false).robots).toBe("noindex,follow");
    expect(buildFeedSiteSeo(false).sitemap).toBe(false);
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
    });
    expect([...metadata.description]).toHaveLength(155);
    expect(metadata.title).toBe("멤버 & 이름 프로필 | 오버더월");
    expect(metadata.image).toBe(
      "https://otw-schedule.info/profile/member_code.webp",
    );
  });

  it("keeps utility and unknown routes out of the index", () => {
    expect(resolveSiteSeo("/snapshot").robots).toBe("noindex,follow");
    expect(resolveSiteSeo("/missing").robots).toBe("noindex,nofollow");
  });

  it("generates a static shell for the OTW Play admin entry point", () => {
    expect(STATIC_SHELL_PATHS).toContain("/admin/otw-play");
    expect(resolveSiteSeo("/admin/otw-play").robots).toBe(
      "noindex,nofollow",
    );
  });

  it("labels the admin-only OTW Play preview without indexing it", () => {
    expect(resolveSiteSeo("/play")).toMatchObject({
      title: "OTW Play | 오버더월",
      robots: "noindex,nofollow",
      sitemap: false,
    });
    expect(resolveSiteSeo("/play/songs/example").title).toBe(
      "OTW Play | 오버더월",
    );
    expect(STATIC_SHELL_PATHS).not.toContain("/play");
  });
});
