import { describe, expect, it } from "vitest";
import { getWorkerSiteDefinition, getWorkerSiteResources } from "./site";

describe("Worker site configuration", () => {
  it("requires explicit selection and a resolved LuvDia origin", () => {
    expect(() => getWorkerSiteDefinition({})).toThrow(/selection/);
    expect(() => getWorkerSiteDefinition({ SITE_ID: "luvdia" })).toThrow(/origin/);
    expect(() => getWorkerSiteDefinition({ SITE_ID: "luvdia", SITE_PUBLIC_ORIGIN: "https://otw-schedule.info" })).toThrow(/own public origin/);
    expect(() => getWorkerSiteDefinition({ SITE_ID: "otw", SITE_PUBLIC_ORIGIN: "https://user:pass@localhost/" })).toThrow(/Invalid public origin/);
    expect(getWorkerSiteDefinition({ SITE_ID: "otw" }).publicOrigin).toBe("https://otw-schedule.info");
    expect(getWorkerSiteDefinition({ SITE_ID: "luvdia", SITE_PUBLIC_ORIGIN: "http://localhost:5174" })).toMatchObject({ id: "luvdia", playName: "LuvDia Play", publicOrigin: "http://localhost:5174" });
  });
});

const resources = {
  SITE_ID: "luvdia", SITE_PUBLIC_ORIGIN: "http://localhost:5174",
  SITE_CONTROL_QUEUE_NAME: "luvdia-ops-control", SITE_CRITICAL_QUEUE_NAME: "luvdia-ops-critical",
  SITE_BACKGROUND_QUEUE_NAME: "luvdia-ops-background", SITE_INGESTION_QUEUE_NAME: "luvdia-play-ingestion",
  SITE_AI_REVIEW_QUEUE_NAME: "luvdia-play-ai-review", SITE_DEAD_LETTER_QUEUE_NAME: "luvdia-dead-letter",
  PLAY_ANALYTICS_DATASET: "luvdia_play_events",
};
it("rejects absent, cross-site, ambiguous queue names and unsafe Analytics identifiers", () => {
  expect(getWorkerSiteResources(resources)).toMatchObject({
    site: { id: "luvdia" }, analyticsDataset: "luvdia_play_events",
    queues: { control: "luvdia-ops-control", critical: "luvdia-ops-critical", background: "luvdia-ops-background", ingestion: "luvdia-play-ingestion", aiReview: "luvdia-play-ai-review", deadLetter: "luvdia-dead-letter" },
  });
  for (const overrides of [
    { SITE_DEAD_LETTER_QUEUE_NAME: undefined }, { SITE_CONTROL_QUEUE_NAME: "otw-ops-control" },
    { SITE_CONTROL_QUEUE_NAME: "luvdia-dead-letter" }, { PLAY_ANALYTICS_DATASET: "otw_play_events" },
    { PLAY_ANALYTICS_DATASET: "luvdia_events; DROP TABLE secrets" },
  ]) expect(() => getWorkerSiteResources({ ...resources, ...overrides })).toThrow();
});
