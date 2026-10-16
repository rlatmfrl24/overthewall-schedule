import type { SiteId } from "./site-definition";

export const SITE_OPENS_AT = "2026-10-18T15:00:00Z";
export interface SitePublicationStatus {
  phase: "countdown" | "open" | "held";
  opensAt: string;
  serverNow: string;
  canPreview: boolean;
}

export const getSitePublication = (siteId: SiteId, nowMs: number, hold = false): SitePublicationStatus => ({
  phase: siteId === "otw" ? "open" : hold ? "held" : nowMs < Date.parse(SITE_OPENS_AT) ? "countdown" : "open",
  opensAt: SITE_OPENS_AT,
  serverNow: new Date(nowMs).toISOString(),
  canPreview: false,
});
export const getHiddenMemberCodes = (siteId: SiteId, nowMs: number): readonly string[] =>
  siteId === "otw" && nowMs >= Date.parse(SITE_OPENS_AT) ? ["bing_hayu", "u_lili", "yang_mei"] : [];
