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
    fanCafeUrl: "https://cafe.naver.com/s2dia", contactEmail: "397love@gmail.com", copyrightOwner: "LuvDia Schedule",
  }),
};

export function parseSiteId(value: string | undefined): SiteId {
  if (value !== "otw" && value !== "luvdia") throw new Error("Explicit site selection must be otw or luvdia.");
  return value;
}

/** Declared binding names; deployed IDs and actual bindings need separate runtime evidence. */
export function parseSiteStorageResources(value:{SITE_ID?:string;SITE_D1_DATABASE_NAME?:string;SITE_ASSET_BUCKET_NAME?:string}) {
  const site=parseSiteId(value.SITE_ID);
  const database=value.SITE_D1_DATABASE_NAME,bucket=value.SITE_ASSET_BUCKET_NAME;
  for(const name of [database,bucket]) if(typeof name!=="string" || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(name) || !name.startsWith(`${site}-`)) throw new Error("Explicit site-owned D1/R2 binding names required.");
  return {site,database:database!,bucket:bucket!};
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
