import { describe, expect, it } from "vitest";
import { buildProfileSiteSeo, FIXED_SITE_SEO } from "../contracts/site-seo";
import { renderNotFoundDocument, renderSeoDocument } from "./generate-seo-assets";

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
  it("replaces every shell tag exactly once", () => {
    const output = renderSeoDocument(shell, FIXED_SITE_SEO["/weekly"]);
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
    });
    const output = renderSeoDocument(shell, metadata);
    expect(output).not.toContain("<script>alert(1)</script>");
    expect(output).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("creates a Korean noindex 404 document", () => {
    const output = renderNotFoundDocument();
    expect(output).toContain('lang="ko"');
    expect(output).toContain('content="noindex,nofollow"');
    expect(output).toContain("페이지를 찾을 수 없습니다");
  });
});
