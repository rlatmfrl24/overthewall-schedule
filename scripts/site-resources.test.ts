import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { assertSiteResourceConfig } from "./site-resources.mjs";
import { createLocalSiteConfig } from "./local-site-config.mjs";

const readConfig = (id: "otw" | "luvdia") => ts.parseConfigFileTextToJson(id, readFileSync(id === "otw" ? "wrangler.jsonc" : "wrangler.luvdia.jsonc", "utf8")).config;
describe("physical site resource configuration", () => {
  it.each(["otw", "luvdia"] as const)("keeps %s canonical and local producer/consumer/dataset aligned", site => {
    const config = readConfig(site);
    expect(() => assertSiteResourceConfig(config, site)).not.toThrow();
    expect(() => assertSiteResourceConfig(createLocalSiteConfig(config, site), site)).not.toThrow();
    for (const mutate of [
      (c: typeof config) => { c.vars.SITE_DEAD_LETTER_QUEUE_NAME = "other-dead-letter"; },
      (c: typeof config) => { c.queues.producers[0].queue = `${site}-wrong`; },
      (c: typeof config) => { c.queues.consumers[0].queue = `${site}-wrong`; },
      (c: typeof config) => { c.queues.consumers[0].dead_letter_queue = "other-dead-letter"; },
      (c: typeof config) => { c.analytics_engine_datasets[0].dataset = "other_events"; },
      (c: typeof config) => { c.queues.consumers.push({ queue: `${site}-unexpected` }); },
    ]) {
      const broken = structuredClone(config); mutate(broken);
      expect(() => assertSiteResourceConfig(broken, site)).toThrow();
    }
  });
});
