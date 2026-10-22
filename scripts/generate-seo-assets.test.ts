import { getSiteDefinition } from "../contracts/site-definition";
import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { build } from "vite";
import { buildProfileSiteSeo, buildFixedSiteSeo } from "../contracts/site-seo";
import { createSeoHtmlTransform, generateSeoAssets, renderNotFoundDocument, renderSeoDocument } from "./generate-seo-assets";

const shell = `<!doctype html><html lang="ko"><head><title>old</title>
<meta data-site-seo="description" name="description" content="old">
<meta data-site-seo="description" name="description" content="duplicate">
<meta data-site-seo="robots" name="robots" content="old">
<link data-site-seo="canonical" rel="canonical" href="old">
<meta data-site-seo="og:title" property="og:title" content="old">
<meta data-site-seo="og:description" property="og:description" content="old">
<meta data-site-seo="og:url" property="og:url" content="old">
<meta data-site-seo="og:type" property="og:type" content="old">
<meta data-site-seo="twitter:card" name="twitter:card" content="old">
</head><body></body></html>`;

describe("SEO asset generation", () => {
  it("renders site metadata before Vite processes HTML asset URLs", async () => {
    // Vite resolves symlinks, so its root must use the same physical temporary path.
    const tempRoot = await realpath(tmpdir());
    const root = await mkdtemp(join(tempRoot, "site-seo-vite-"));
    if (dirname(root) !== tempRoot) throw new Error("Unexpected temporary build directory");
    const selected = { ...getSiteDefinition("luvdia"), publicOrigin: "https://luvdia-schedule.info" };
    try {
      await writeFile(join(root, "index.html"), shell.replace('href="old"', 'href="/"')
        .replace("</body>", '<script id="app-entry" type="module" src="/main.js"></script></body>'));
      await writeFile(join(root, "main.js"), 'console.log("app entry");');
      const built = await build({
        configFile: false, root, publicDir: false, logLevel: "silent",
        plugins: [{ name: "site-seo-shell", transformIndexHtml: createSeoHtmlTransform(selected) }],
        build: { write: false },
      });
      const result = Array.isArray(built) ? built[0] : built;
      if (!("output" in result)) throw new Error("Expected a completed HTML build");
      const html = result.output.find(item => item.type === "asset" && item.fileName === "index.html");
      if (!html || html.type !== "asset") throw new Error("Missing built HTML");
      expect(String(html.source)).toContain('rel="canonical" href="https://luvdia-schedule.info/"');
      expect(String(html.source)).toContain(selected.siteName);
      await writeFile(join(root, "index.html"), String(html.source));
      await generateSeoAssets(root, selected);
      const published = await readFile(join(root, "index.html"), "utf8");
      expect(published.match(/id="app-entry"/g)).toHaveLength(1);
      expect(published).toContain('<script id="app-entry" type="module"');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it.each(["otw", "luvdia"] as const)("authors %s static HTML, robots and 404 from the same definition", async id => {
    const selected = { ...getSiteDefinition(id), publicOrigin: id === "otw" ? "http://localhost:5173" : "http://localhost:5174" };
    const root = await mkdtemp(join(tmpdir(), "site-seo-assets-"));
    try {
      await writeFile(join(root, "index.html"), shell);
      await generateSeoAssets(root, selected);
      const weekly = await readFile(join(root, "weekly/index.html"), "utf8");
      expect(weekly).toContain(`${selected.siteName} 주간 스케쥴`);
      expect(weekly).toContain(`href="${selected.publicOrigin}/weekly"`);
      expect(weekly).toContain(`rel="icon" href="${id === "otw" ? "/favicon.ico" : "/logo_luvdia.webp"}"`);
      expect(await readFile(join(root, "robots.txt"), "utf8")).toContain(`Sitemap: ${selected.publicOrigin}/sitemap.xml`);
      expect(await readFile(join(root, "404.html"), "utf8")).toContain(`${selected.siteName} 홈으로 이동`);
      expect(weekly).not.toContain("https://otw-schedule.info");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("replaces every shell tag exactly once", () => {
    const output = renderSeoDocument(shell, buildFixedSiteSeo(site)["/weekly"], site);
    expect(output).toContain("오버더월 주간 스케쥴");
    expect(output.match(/data-site-seo="description"/g)).toHaveLength(1);
    expect(output).toContain('href="https://otw-schedule.info/weekly"');
  });

  it("escapes dynamic text before writing attributes", () => {
    const metadata = buildProfileSiteSeo({
      code: "safe",
      name: '"<name>',
      introduction: '"<script>alert(1)</script>',
      profileImages: [],
    }, site);
    const output = renderSeoDocument(shell, metadata, site);
    expect(output).not.toContain("<script>alert(1)</script>");
    expect(output).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("creates a Korean noindex 404 document", () => {
    const output = renderNotFoundDocument(site);
    expect(output).toContain('lang="ko"');
    expect(output).toContain('content="noindex,nofollow"');
    expect(output).toContain("페이지를 찾을 수 없습니다");
  });
});

const site = getSiteDefinition("otw");
