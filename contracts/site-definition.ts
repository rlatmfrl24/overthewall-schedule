export type SiteId = "otw" | "luvdia";

export interface SiteDefinition {
  readonly id: SiteId;
  readonly publicOrigin: string | null;
  readonly siteName: string;
  readonly serviceName: string;
  readonly playName: string;
  readonly logoPath: string | null;
  readonly fanCafeUrl: string | null;
  readonly contactEmail: string | null;
  readonly copyrightOwner: string;
}

const definitions: Record<SiteId, SiteDefinition> = {
  otw: Object.freeze({
    id: "otw", publicOrigin: "https://otw-schedule.info", siteName: "오버더월",
    serviceName: "OTW Schedule", playName: "OTW Play", logoPath: "/logo_otw.svg",
    fanCafeUrl: "https://cafe.naver.com/otwoffical", contactEmail: "397love@gmail.com",
    copyrightOwner: "OTW Schedule",
  }),
  luvdia: Object.freeze({
    id: "luvdia", publicOrigin: null, siteName: "LuvDia Schedule",
    serviceName: "LuvDia Schedule", playName: "LuvDia Play", logoPath: "/logo_luvdia.webp",
    fanCafeUrl: null, contactEmail: "397love@gmail.com", copyrightOwner: "LuvDia Schedule",
  }),
};

export function parseSiteId(value: string | undefined): SiteId {
  if (value !== "otw" && value !== "luvdia") throw new Error("Explicit site selection must be otw or luvdia.");
  return value;
}

export function getSiteDefinition(siteId: SiteId): SiteDefinition {
  return definitions[parseSiteId(siteId)];
}

export function requireSiteOrigin(site: SiteDefinition): string {
  if (!site.publicOrigin) throw new Error(`Missing public origin for ${site.id}.`);
  const url = new URL(site.publicOrigin);
  if (!["http:", "https:"].includes(url.protocol) ||
      (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`Invalid public origin for ${site.id}.`);
  }
  return url.origin;
}
