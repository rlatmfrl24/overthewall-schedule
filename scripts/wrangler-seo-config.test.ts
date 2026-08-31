import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  FIXED_SITE_PATHS,
  SITE_ORIGIN,
  STATIC_SHELL_PATHS,
} from "../contracts/site-seo";

const readPolicyLines = async (path: string): Promise<Set<string>> => {
  const content = await readFile(path, "utf8");
  return new Set(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );
};

describe("Cloudflare SEO asset routing", () => {
  it("keeps hashed and profile image assets outside dynamic HTML rewriting", async () => {
    const config = await readFile("wrangler.jsonc", "utf8");
    expect(config).toContain('"binding": "ASSETS"');
    expect(config).toContain('"directory": "./dist/client"');
    expect(config).toContain('"html_handling": "drop-trailing-slash"');
    expect(config).toContain('"not_found_handling": "404-page"');
    expect(config).toContain('"!/profile/*.webp"');
    expect(config).toContain('"!/profile/signatures/*"');
    expect(config).toContain('"/play"');
    expect(config).toContain('"/play/*"');
    expect(STATIC_SHELL_PATHS.some((path) => path.startsWith("/play"))).toBe(
      false,
    );
  });

  it("permanently redirects non-canonical public route variants", async () => {
    const redirects = await readPolicyLines("public/_redirects");

    for (const path of FIXED_SITE_PATHS) {
      if (path === "/") continue;
      expect(redirects).toContain(`${path}/ ${path} 301`);
    }

    expect(redirects).toContain("/cafe /feed 301");
    expect(redirects).toContain("/cafe/ /feed 301");
  });

  it("publishes sitemap discovery without blocking search crawlers", async () => {
    const robots = await readPolicyLines("public/robots.txt");

    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
  });
});
