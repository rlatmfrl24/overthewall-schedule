import { isCalendarDate, isSiteContentPath, scheduleRange, siteContentCacheControl, siteContentStatusText, type SitePublicContent } from "@contracts/site-public-content";
import type { SiteContentService } from "../application/site-content-service";
import type { Env } from "../../../platform/types";
import { rewriteHtml } from "./handler";

const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
export const serializeSiteContent = (value: unknown) => JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");

export const renderSiteContent = (content: SitePublicContent) => {
  if (!content.sections.length) return "";
  return `<section class="site-content-summary" aria-label="페이지 요약"><h2>한눈에 보기</h2><p>오버더월 비공식 팬 운영 서비스 · 한국 시간 기준</p>${content.sections.map(s =>
    `<details open><summary>${escape(s.title)}</summary>${s.updatedAt ? `<p>자료 갱신: <time datetime="${escape(s.updatedAt)}">${escape(new Date(s.updatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }))}</time></p>` : ""}${siteContentStatusText[s.status] ? `<p>${escape(siteContentStatusText[s.status])}</p>` : ""}<ul>${s.items.map(item => `<li>${item.image ? `<img src="${escape(item.image)}" alt="${escape(item.title)}" width="64" height="64">` : ""}${item.url ? `<a href="${escape(item.url)}">${escape(item.title)}</a>` : `<strong>${escape(item.title)}</strong>`}${item.text ? `<p>${escape(item.text)}</p>` : ""}${item.publishedAt ? `<span>${escape(item.publishedAt)}</span>` : ""}</li>`).join("")}</ul></details>`).join("")}<p>조회 기준: <time datetime="${content.generatedAt}">${escape(new Date(content.generatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }))}</time></p></section>`;
};

export const rewriteSiteContent = (source: Response, content: SitePublicContent): Response => {
  source = rewriteHtml(source, content.metadata);
  const headers = new Headers(source.headers);
  for (const key of ["ETag", "Last-Modified", "Content-Length"]) headers.delete(key);
  headers.set("Cache-Control", siteContentCacheControl(content));
  headers.set("X-Robots-Tag", content.metadata.robots);
  return new HTMLRewriter()
    .on("#root", { element(el) {
      const body = renderSiteContent(content);
      if (body) el.before(`<div id="site-content-fallback">${body}</div>`, { html: true });
    } })
    .on("head", { element(el) {
      if (content.structuredData) el.append(`<script id="site-content-jsonld" type="application/ld+json">${serializeSiteContent(content.structuredData)}</script>`, { html: true });
      el.append(`<script id="site-content-data" type="application/json">${serializeSiteContent(content)}</script>`, { html: true });
    } })
    .transform(new Response(source.body, { status: source.status, headers }));
};

export const siteContentUnavailable = () => new Response("일시적으로 페이지 정보를 불러올 수 없습니다.", {
  status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "300", "X-Robots-Tag": "noindex,nofollow" },
});

export const createSiteContentHandler = (resolve: (env: Env) => SiteContentService) => async (request: Request, env: Env) => {
  const url = new URL(request.url);
  if (request.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } });
  const path = url.searchParams.get("path") ?? "/";
  const date = url.searchParams.get("date") ?? undefined;
  if ([...url.searchParams.keys()].some(key => !["path", "date"].includes(key)) ||
      [...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length > 1) ||
      (date !== undefined && (!isCalendarDate(date) || !["/", "/weekly"].includes(path)))) {
    return Response.json({ error: "Invalid site content query" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (!isSiteContentPath(path)) return Response.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (date && Object.values(scheduleRange(path, date)).some(value => !isCalendarDate(value))) {
    return Response.json({ error: "Invalid schedule range" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try { decodeURIComponent(path); } catch { return Response.json({ error: "Invalid path" }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
  try {
    const content = await resolve(env).read(path, date);
    return content ? Response.json(content, { headers: { "Cache-Control": siteContentCacheControl(content), "X-Robots-Tag": "noindex" } }) : Response.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  } catch (error) { console.error("[site-content] read failed", error); return siteContentUnavailable(); }
};
