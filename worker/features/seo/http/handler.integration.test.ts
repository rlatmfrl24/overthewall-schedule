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

const setup = (state: "public" | "private") => {
  const reader: SiteSeoReader = {
    readFeedState: async () => ({
      xVisibility: state,
      cafeEnabled: false,
      cafeVisibility: "private",
    }),
    listActiveProfileCodes: async () => [profile.code],
    findActiveProfileByCode: async (code) =>
      code.toLowerCase() === profile.code.toLowerCase() ? profile : null,
  };
  const service = new SiteSeoService(reader);
  const handler = createSiteSeoHandler(() => service);
  const testEnv = {
    ASSETS: {
      fetch: async () => new Response(shell, { headers: { "Content-Type": "text/html" } }),
    },
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
    const reader: SiteSeoReader = {
      readFeedState: async () => {
        throw new Error("settings unavailable");
      },
      listActiveProfileCodes: async () => [],
      findActiveProfileByCode: async () => null,
    };
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
    const reader: SiteSeoReader = {
      readFeedState: async () => {
        throw new Error("database unavailable");
      },
      listActiveProfileCodes: async () => ["partial"],
      findActiveProfileByCode: async () => null,
    };
    const handler = createSiteSeoHandler(() => new SiteSeoService(reader));
    const response = await handler(
      new Request("https://otw-schedule.info/sitemap.xml"),
      {} as Env,
    );
    expect(response?.status).toBe(503);
    expect(response?.headers.get("Retry-After")).toBe("300");
    expect(response?.headers.get("Content-Type")).not.toContain("xml");
  });
});
