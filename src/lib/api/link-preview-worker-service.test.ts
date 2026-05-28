import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLinkPreviewCacheForTests,
  enrichLinksWithPreviews,
} from "../../../worker/services/link-preview";
import type { XPostLinkItem } from "../../../worker/types";

const htmlResponse = (html: string, status = 200) =>
  new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

const makeLink = (url: string): XPostLinkItem => ({
  url,
  expandedUrl: url,
  displayUrl: null,
});

describe("link preview worker service", () => {
  beforeEach(() => {
    clearLinkPreviewCacheForTests();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("X URL entity 메타데이터가 있으면 외부 fetch 없이 프리뷰를 만든다", async () => {
    const links = await enrichLinksWithPreviews([
      {
        url: "https://t.co/entity",
        expandedUrl: "https://example.com/post",
        resolvedUrl: "https://example.com/post",
        displayUrl: "example.com/post",
        title: "Entity title",
        description: "Entity description",
        imageUrl: "https://example.com/card.jpg",
      },
    ]);

    expect(fetch).not.toHaveBeenCalled();
    expect(links[0]).toMatchObject({
      resolvedUrl: "https://example.com/post",
      domain: "example.com",
      title: "Entity title",
      description: "Entity description",
      imageUrl: "https://example.com/card.jpg",
      previewStatus: "ready",
    });
  });

  it("HTML 메타 태그에서 제목, 설명, 사이트명, 상대 이미지 URL을 파싱한다", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      htmlResponse(`
        <html>
          <head>
            <meta property="og:title" content="OG title">
            <meta property="og:description" content="OG description">
            <meta property="og:site_name" content="Example Site">
            <meta property="og:image" content="/images/card.jpg">
          </head>
        </html>
      `),
    );

    const links = await enrichLinksWithPreviews([
      makeLink("https://example.com/post"),
    ]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(links[0]).toMatchObject({
      resolvedUrl: "https://example.com/post",
      domain: "example.com",
      title: "OG title",
      description: "OG description",
      siteName: "Example Site",
      imageUrl: "https://example.com/images/card.jpg",
      previewStatus: "ready",
    });
  });

  it("private URL은 fetch하지 않고 skipped 상태로 처리한다", async () => {
    const links = await enrichLinksWithPreviews([
      makeLink("https://127.0.0.1/admin"),
    ]);

    expect(fetch).not.toHaveBeenCalled();
    expect(links[0]).toMatchObject({
      previewStatus: "skipped",
    });
  });

  it("fetch 실패는 게시글 실패로 올리지 않고 unavailable 프리뷰로 남긴다", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("nope", { status: 500 }));

    const links = await enrichLinksWithPreviews([
      makeLink("https://example.com/unavailable"),
    ]);

    expect(links[0]).toMatchObject({
      resolvedUrl: "https://example.com/unavailable",
      domain: "example.com",
      previewStatus: "unavailable",
    });
  });

  it("fresh cache가 있으면 같은 링크를 다시 fetch하지 않는다", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      htmlResponse(`<title>Cached title</title>`),
    );

    await enrichLinksWithPreviews([makeLink("https://example.com/cache")]);
    const links = await enrichLinksWithPreviews([
      makeLink("https://example.com/cache"),
    ]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(links[0]?.title).toBe("Cached title");
  });

  it("stale cache가 있고 재검증이 실패하면 기존 프리뷰를 반환한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T00:00:00Z"));
    vi.mocked(fetch).mockResolvedValueOnce(
      htmlResponse(`<title>Stale fallback</title>`),
    );

    await enrichLinksWithPreviews([makeLink("https://example.com/stale")]);

    vi.setSystemTime(new Date("2026-05-28T01:00:00Z"));
    vi.mocked(fetch).mockResolvedValueOnce(new Response("nope", { status: 500 }));

    const links = await enrichLinksWithPreviews([
      makeLink("https://example.com/stale"),
    ]);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(links[0]).toMatchObject({
      title: "Stale fallback",
      previewStatus: "ready",
    });
  });
});
