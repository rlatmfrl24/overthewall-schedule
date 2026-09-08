import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestHarness, unstable_readConfig } from "wrangler";
import {
  FIXED_SITE_PATHS,
  SITE_ORIGIN,
  STATIC_SHELL_PATHS,
} from "../contracts/site-seo";
import { generateSeoAssets } from "./generate-seo-assets";

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
  it("generates a direct HTML entry for every registered static admin route", async () => {
    const directory = resolve("src/routes/admin");
    const routeFiles = (await readdir(directory)).filter((name) => name.endsWith(".tsx"));
    const sources = await Promise.all(routeFiles.map((name) => readFile(join(directory, name), "utf8")));
    const paths = sources.flatMap((source) =>
      [...source.matchAll(/createFileRoute\(["'](\/admin(?:\/[^"']*)?)["']\)/g)]
        .map((match) => match[1].replace(/\/$/, ""))
        .filter((path) => !path.includes("$")),
    );
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) expect(STATIC_SHELL_PATHS, path).toContain(path);
  });

  it("serves generated admin deep links through Cloudflare assets and preserves real 404s", async () => {
    const temporaryPrefix = resolve(tmpdir(), "otw-admin-assets-");
    const outputRoot = await mkdtemp(temporaryPrefix);
    if (!resolve(outputRoot).startsWith(temporaryPrefix)) {
      throw new Error("Unexpected admin asset test directory");
    }
    const config = unstable_readConfig({ config: resolve("wrangler.jsonc") }, { hideWarnings: true });
    const configPath = join(outputRoot, "wrangler.json");
    const server = createTestHarness({ workers: [{ configPath }] });
    try {
      await writeFile(join(outputRoot, "index.html"), await readFile("index.html", "utf8"));
      await generateSeoAssets(outputRoot);
      await writeFile(join(outputRoot, "worker.js"),
        'export default { fetch() { throw new Error("Admin HTML must be served by static assets"); } };');
      await writeFile(configPath, JSON.stringify({
        name: "otw-admin-assets-test",
        main: "worker.js",
        compatibility_date: config.compatibility_date,
        assets: { ...config.assets, directory: outputRoot },
      }));
      const { url } = await server.listen();
      for (const path of [
        "/admin/collection",
        "/admin/collection?source=schedule",
        "/admin/collection?source=x#x-monitoring",
        "/admin/collection?source=naver-cafe#naver-cafe-monitoring",
        "/admin/review",
        "/admin/content",
        "/admin/resources",
        "/admin/history?tab=runs",
        "/admin/settings?tab=settings",
      ]) {
        const response = await fetch(new URL(path, url));
        expect(response.status, path).toBe(200);
        const html = await response.text();
        expect(html, path).toContain('<div id="root"></div>');
        expect(html, path).toContain('name="robots" content="noindex,nofollow"');
        expect(html, path).toContain('type="module"');
      }
      const missing = await fetch(new URL("/admin/does-not-exist", url));
      expect(missing.status).toBe(404);
      expect(await missing.text()).toContain("페이지를 찾을 수 없습니다");
    } finally {
      await server.close();
      await rm(outputRoot, { recursive: true, force: true });
    }
  }, 30_000);

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
