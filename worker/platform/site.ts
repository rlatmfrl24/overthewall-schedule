import { getSiteDefinition, parseSiteId, requireSiteOrigin, type SiteDefinition } from "@contracts/site-definition";
import type { Env } from "./types";

export type QueueNames = Record<"control" | "critical" | "background" | "ingestion" | "aiReview" | "deadLetter", string>;

export function getWorkerSiteResources(env: Pick<Env, "SITE_ID" | "SITE_PUBLIC_ORIGIN" | "SITE_CONTROL_QUEUE_NAME" | "SITE_CRITICAL_QUEUE_NAME" | "SITE_BACKGROUND_QUEUE_NAME" | "SITE_INGESTION_QUEUE_NAME" | "SITE_AI_REVIEW_QUEUE_NAME" | "SITE_DEAD_LETTER_QUEUE_NAME" | "PLAY_ANALYTICS_DATASET">): { site: SiteDefinition; queues: QueueNames; analyticsDataset: string } {
  const site = getWorkerSiteDefinition(env);
  const configured = {
    control: env.SITE_CONTROL_QUEUE_NAME,
    critical: env.SITE_CRITICAL_QUEUE_NAME,
    background: env.SITE_BACKGROUND_QUEUE_NAME,
    ingestion: env.SITE_INGESTION_QUEUE_NAME,
    aiReview: env.SITE_AI_REVIEW_QUEUE_NAME,
    deadLetter: env.SITE_DEAD_LETTER_QUEUE_NAME,
  };
  for (const [role, name] of Object.entries(configured)) {
    if (!name || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(name) || !name.startsWith(`${site.id}-`)) {
      throw new Error(`Invalid ${site.id} Queue name for ${role}.`);
    }
  }
  if (new Set(Object.values(configured)).size !== 6) throw new Error("Site Queue names must be distinct.");
  const analyticsDataset = env.PLAY_ANALYTICS_DATASET;
  if (!analyticsDataset || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(analyticsDataset) || !analyticsDataset.startsWith(`${site.id}_`)) {
    throw new Error(`Invalid ${site.id} Analytics dataset identifier.`);
  }
  return { site, queues: configured as QueueNames, analyticsDataset };
}

export function getWorkerSiteDefinition(env: Pick<Env, "SITE_ID" | "SITE_PUBLIC_ORIGIN">): SiteDefinition {
  const definition = getSiteDefinition(parseSiteId(env.SITE_ID));
  const site = { ...definition, publicOrigin: env.SITE_PUBLIC_ORIGIN || definition.publicOrigin };
  const origin = requireSiteOrigin(site);
  if (site.id === "luvdia" && origin === getSiteDefinition("otw").publicOrigin) {
    throw new Error("LuvDia must use its own public origin.");
  }
  return { ...site, publicOrigin: origin };
}
