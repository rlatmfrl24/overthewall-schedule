import { describe, expect, it } from "vitest";
import type { MemberProfileDto } from "@contracts/members";
import type { SiteSeoReader } from "./ports/site-seo-reader";
import { SiteSeoService } from "./site-seo-service";

const member = (code: string): MemberProfileDto =>
  ({ code, name: code, introduction: null, profileImages: [] }) as unknown as MemberProfileDto;

describe("SiteSeoService", () => {
  it("includes only public feed and active profiles in a deduplicated sitemap", async () => {
    const reader: SiteSeoReader = {
      readFeedState: async () => ({
        xVisibility: "public",
        cafeEnabled: false,
        cafeVisibility: "private",
      }),
      listActiveProfileCodes: async () => ["alpha", "alpha", "beta"],
      findActiveProfileByCode: async (code) => member(code),
    };
    const urls = await new SiteSeoService(reader).buildSitemapUrls();
    expect(urls).toContain("https://otw-schedule.info/feed");
    expect(urls.filter((url) => url.endsWith("/profile/alpha"))).toHaveLength(1);
    expect(urls.every((url) => !url.includes("?") && url.startsWith("https://"))).toBe(true);
  });

  it("omits a non-public feed", async () => {
    const reader: SiteSeoReader = {
      readFeedState: async () => ({
        xVisibility: "members",
        cafeEnabled: true,
        cafeVisibility: "private",
      }),
      listActiveProfileCodes: async () => [],
      findActiveProfileByCode: async () => null,
    };
    expect(await new SiteSeoService(reader).buildSitemapUrls()).not.toContain(
      "https://otw-schedule.info/feed",
    );
  });
});
