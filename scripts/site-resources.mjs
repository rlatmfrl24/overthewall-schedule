import { parseSiteId } from "../contracts/site-definition.ts";

const roles = [
  ["SITE_CONTROL_QUEUE_NAME", "OTW_OPS_CONTROL_QUEUE"],
  ["SITE_CRITICAL_QUEUE_NAME", "OTW_OPS_CRITICAL_QUEUE"],
  ["SITE_BACKGROUND_QUEUE_NAME", "OTW_OPS_BACKGROUND_QUEUE"],
  ["SITE_INGESTION_QUEUE_NAME", "OTW_PLAY_INGESTION_QUEUE"],
  ["SITE_AI_REVIEW_QUEUE_NAME", "OTW_PLAY_AI_REVIEW_QUEUE"],
  ["SITE_DEAD_LETTER_QUEUE_NAME", null],
];

export const assertSiteResourceConfig = (config, siteId) => {
  parseSiteId(siteId);
  const vars = config.vars ?? {};
  if (vars.SITE_ID !== siteId) throw new Error("Resource config site identity mismatch.");
  const names = roles.map(([variable]) => vars[variable]);
  if (names.some(name => typeof name !== "string" || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(name) || !name.startsWith(`${siteId}-`)) || new Set(names).size !== 6) throw new Error("Site Queue variables must name six distinct site-owned queues.");
  const producers = config.queues?.producers ?? [];
  const consumers = config.queues?.consumers ?? [];
  if (producers.length !== 5 || consumers.length !== 6 || new Set(consumers.map(consumer => consumer.queue)).size !== 6) throw new Error("Site Queue producer/consumer inventory mismatch.");
  for (const [variable, binding] of roles) {
    const name = vars[variable];
    if (binding && producers.filter(producer => producer.binding === binding && producer.queue === name).length !== 1) throw new Error(`Queue producer does not match ${variable}.`);
    const consumer = consumers.find(consumer => consumer.queue === name);
    if (!consumer || (binding && consumer.dead_letter_queue !== vars.SITE_DEAD_LETTER_QUEUE_NAME) || (!binding && consumer.dead_letter_queue)) throw new Error(`Queue consumer/DLQ does not match ${variable}.`);
  }
  const dataset = vars.PLAY_ANALYTICS_DATASET;
  if (typeof dataset !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(dataset) || !dataset.startsWith(`${siteId}_`) || config.analytics_engine_datasets?.filter(entry => entry.binding === "OTW_PLAY_ANALYTICS").length !== 1 || config.analytics_engine_datasets?.find(entry => entry.binding === "OTW_PLAY_ANALYTICS")?.dataset !== dataset) throw new Error("Analytics read/write dataset configuration mismatch.");
};
