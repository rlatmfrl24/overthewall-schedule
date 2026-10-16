import { getSiteDefinition, parseSiteId, type SiteDefinition } from "@contracts/site-definition";

export const site: SiteDefinition = {
  ...getSiteDefinition(parseSiteId(import.meta.env.VITE_SITE_ID)),
  publicOrigin: import.meta.env.VITE_PUBLIC_ORIGIN,
};
