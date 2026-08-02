import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveSiteSeo,
  STATIC_SHELL_PATHS,
  type SiteSeoMetadata,
} from "../contracts/site-seo";

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const seoTags = (metadata: SiteSeoMetadata): Record<string, string> => ({
  description: `<meta data-site-seo="description" name="description" content="${escapeHtml(metadata.description)}" />`,
  robots: `<meta data-site-seo="robots" name="robots" content="${metadata.robots}" />`,
  canonical: `<link data-site-seo="canonical" rel="canonical" href="${escapeHtml(metadata.canonical)}" />`,
  "og:title": `<meta data-site-seo="og:title" property="og:title" content="${escapeHtml(metadata.title)}" />`,
  "og:description": `<meta data-site-seo="og:description" property="og:description" content="${escapeHtml(metadata.description)}" />`,
  "og:url": `<meta data-site-seo="og:url" property="og:url" content="${escapeHtml(metadata.canonical)}" />`,
  "og:type": `<meta data-site-seo="og:type" property="og:type" content="${metadata.ogType}" />`,
  "twitter:card": '<meta data-site-seo="twitter:card" name="twitter:card" content="summary" />',
});

export const renderSeoDocument = (
  source: string,
  metadata: SiteSeoMetadata,
): string => {
  let document = source.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(metadata.title)}</title>`,
  );
  for (const [key, tag] of Object.entries(seoTags(metadata))) {
    const pattern = new RegExp(
      `<(?:meta|link)\\b[^>]*data-site-seo=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`,
      "gi",
    );
    const matches = document.match(pattern) ?? [];
    if (matches.length === 0) {
      document = document.replace("</head>", `    ${tag}\n  </head>`);
    } else {
      let replaced = false;
      document = document.replace(pattern, () => {
        if (replaced) return "";
        replaced = true;
        return tag;
      });
    }
  }
  return document;
};

export const renderNotFoundDocument = (): string => `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>페이지를 찾을 수 없습니다 | 오버더월</title>
    <meta name="description" content="요청하신 오버더월 페이지를 찾을 수 없습니다." />
    <meta name="robots" content="noindex,nofollow" />
  </head>
  <body style="margin:0;font-family:system-ui,sans-serif;background:#101114;color:#f8fafc">
    <main style="min-height:100vh;display:grid;place-items:center;padding:24px;text-align:center">
      <section><h1>페이지를 찾을 수 없습니다</h1><p>주소를 확인하거나 홈으로 이동해 주세요.</p><a href="/" style="color:#c084fc">오버더월 홈으로 이동</a></section>
    </main>
  </body>
</html>`;

export const generateSeoAssets = async (outputRoot: string): Promise<void> => {
  const rootIndex = resolve(outputRoot, "index.html");
  const source = await readFile(rootIndex, "utf8");
  for (const path of STATIC_SHELL_PATHS) {
    const target = path === "/"
      ? rootIndex
      : resolve(outputRoot, path.slice(1), "index.html");
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, renderSeoDocument(source, resolveSiteSeo(path)), "utf8");
  }
  await writeFile(resolve(outputRoot, "404.html"), renderNotFoundDocument(), "utf8");
};

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  await generateSeoAssets(resolve(process.cwd(), "dist/client"));
}
