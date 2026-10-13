import { getSiteDefinition, parseSiteId, requireSiteOrigin, type SiteDefinition } from "@contracts/site-definition";
import type { Env } from "./types";

export function getWorkerSiteDefinition(env: Pick<Env, "SITE_ID" | "SITE_PUBLIC_ORIGIN">): SiteDefinition {
  const definition = getSiteDefinition(parseSiteId(env.SITE_ID));
  const site = { ...definition, publicOrigin: env.SITE_PUBLIC_ORIGIN || definition.publicOrigin };
  const origin = requireSiteOrigin(site);
  if (site.id === "luvdia" && origin === getSiteDefinition("otw").publicOrigin) {
    throw new Error("LuvDia must use its own public origin.");
  }
  return { ...site, publicOrigin: origin };
}
