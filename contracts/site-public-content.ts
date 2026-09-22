import type { SiteSeoMetadata } from "./site-seo";

export interface SiteContentItem {
  title: string;
  text?: string;
  url?: string;
  image?: string;
  publishedAt?: string | null;
}
export interface SiteContentSection {
  id: string;
  title: string;
  status: "available" | "empty" | "stale" | "unavailable";
  updatedAt: string | null;
  items: SiteContentItem[];
}
export interface SitePublicContent {
  path: string;
  date: string | null;
  metadata: SiteSeoMetadata;
  generatedAt: string;
  expiresAt: string;
  sections: SiteContentSection[];
  structuredData: Record<string, unknown> | null;
}

export const siteContentQueryKey = (path: string, date?: string) =>
  ["site-content", path, date ?? "current"] as const;

export const isSiteContentPath = (path: string): boolean =>
  ["/", "/weekly", "/notice", "/feed", "/vods", "/rights", "/play"].includes(path) ||
  /^\/profile\/[^/]+$/.test(path) || /^\/play\/songs\/[^/]+$/.test(path);

export const kstDate = (now: number): string =>
  new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);

export const isCalendarDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export const scheduleRange = (path: string, date: string) => {
  const day = new Date(`${date}T00:00:00Z`);
  if (path === "/weekly") day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  const start = day.toISOString().slice(0, 10);
  if (path === "/weekly") day.setUTCDate(day.getUTCDate() + 6);
  return { start, end: day.toISOString().slice(0, 10) };
};

export const siteContentStatusText: Record<SiteContentSection["status"], string> = {
  available: "", empty: "표시할 항목이 없습니다.",
  stale: "저장된 정보입니다. 최신 상태는 원문에서 확인해 주세요.",
  unavailable: "저장된 정보를 확인할 수 없습니다. 원래 화면에서 다시 확인해 주세요.",
};

export const safeSiteContentUrl = (value: string | null | undefined): string | undefined => {
  if (!value) return undefined;
  try {
    const url = new URL(value, "https://otw-schedule.info");
    return ["https:", "http:", "mailto:"].includes(url.protocol)
      ? value.startsWith("/") && !value.startsWith("//") ? `${url.pathname}${url.search}${url.hash}` : url.toString()
      : undefined;
  } catch { return undefined; }
};

export const siteContentCacheControl = (content: SitePublicContent, now = Date.now()): string => {
  if (content.path === "/feed" || content.path.startsWith("/play")) return "no-store";
  const seconds = Math.max(0, Math.min(300, Math.floor((Date.parse(content.expiresAt) - now) / 1000)));
  return `public, max-age=0, s-maxage=${seconds}, must-revalidate`;
};
