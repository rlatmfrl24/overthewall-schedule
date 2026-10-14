import type { Env } from "../platform/types";

export const siteEnv = (site: "otw" | "luvdia" = "otw"): Partial<Env> => ({
  SITE_ID: site,
  SITE_PUBLIC_ORIGIN: site === "otw" ? "https://otw-schedule.info" : "http://localhost:5174",
  SITE_CONTROL_QUEUE_NAME: `${site}-ops-control`,
  SITE_CRITICAL_QUEUE_NAME: `${site}-ops-critical`,
  SITE_BACKGROUND_QUEUE_NAME: `${site}-ops-background`,
  SITE_INGESTION_QUEUE_NAME: `${site}-play-ingestion`,
  SITE_AI_REVIEW_QUEUE_NAME: `${site}-play-ai-review`,
  SITE_DEAD_LETTER_QUEUE_NAME: `${site}-dead-letter`,
  PLAY_ANALYTICS_DATASET: `${site}_play_events`,
});
