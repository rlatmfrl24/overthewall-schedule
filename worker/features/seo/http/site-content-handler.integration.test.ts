import { describe, it, expect, vi } from "vitest";
import { resolveSiteSeo } from "@contracts/site-seo";
import type { SitePublicContent } from "@contracts/site-public-content";
import type { Env } from "../../../platform/types";
import type { SiteContentService } from "../application/site-content-service";
import { createSiteContentHandler, rewriteSiteContent } from "./site-content-handler";

const content = (): SitePublicContent => ({
  path: "/", date: "2026-09-22", metadata: resolveSiteSeo("/"),
  generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 300_000).toISOString(),
  sections: [{ id: "schedule", title: "오늘 방송 일정", status: "available", updatedAt: null, items: [{ title: '</script><script>alert("x")</script>', text: "휴방", url: "/profile/member" }] }],
  structuredData: { "@context": "https://schema.org", name: "</script><script>bad</script>" },
});

describe("site content HTTP representations", () => {
  it("sends readable body and safely serialized data without relying on JavaScript", async () => {
    const response = rewriteSiteContent(new Response('<html><head><title>old</title></head><body><div id="root"></div></body></html>', { headers: { ETag: '"old"', "Last-Modified": "old", "Content-Length": "100" } }), content());
    const html = await response.text();
    expect(html).toContain("오늘 방송 일정");
    expect(html).toContain('<div id="site-content-fallback">');
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain("휴방");
    expect(html).toContain("&lt;/script&gt;");
    expect(html).not.toContain('<script>alert(');
    expect(html).toContain("\\u003c/script>");
    expect(response.headers.get("ETag")).toBeNull();
    expect(response.headers.get("Content-Length")).toBeNull();
    const seed = JSON.parse(html.match(/id="site-content-data" type="application\/json">(.*?)<\/script>/s)![1]);
    expect(seed.sections).toEqual(content().sections);
  });

  it.each(["date=", "date=2026-02-30", "path=/weekly&date=9999-12-31", "path=/rights&date=2026-09-22", "path=/&admin=1", "path=/&path=/feed", "path=/profile/%25ZZ"])("rejects invalid query %s", async query => {
    const read = vi.fn();
    const handle = createSiteContentHandler(() => ({ read }) as unknown as SiteContentService);
    expect((await handle(new Request(`https://otw.test/api/site-content?${query}`), {} as Env)).status).toBe(400);
    expect(read).not.toHaveBeenCalled();
  });

  it.each(["/multiview", "/admin", "/snapshot", "/play/playlists/secret", "/play/clips/private"])("excludes %s", async path => {
    const read = vi.fn();
    const response = await createSiteContentHandler(() => ({ read }) as unknown as SiteContentService)(new Request(`https://otw.test/api/site-content?path=${path}`), {} as Env);
    expect(response.status).toBe(404);
    expect(read).not.toHaveBeenCalled();
  });

  it("returns 503 without caching for failed reads", async () => {
    const read = vi.fn().mockRejectedValue(new Error("unavailable"));
    const response = await createSiteContentHandler(() => ({ read }) as unknown as SiteContentService)(new Request("https://otw.test/api/site-content"), {} as Env);
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex,nofollow");
  });
});
