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
      (c: typeof config) => { c.analytics_engine_datasets[0].dataset = "other_events"; },
    ]) {
      const broken = structuredClone(config); mutate(broken);
      expect(() => assertSiteResourceConfig(broken, site)).toThrow();
    }
  });
  it("checks the full inventory when queues are configured", () => {
    for (const mutate of [
      (c: ReturnType<typeof readConfig>) => { c.queues.producers[0].queue = "otw-wrong"; },
      (c: ReturnType<typeof readConfig>) => { c.queues.consumers[0].queue = "otw-wrong"; },
      (c: ReturnType<typeof readConfig>) => { c.queues.consumers[0].dead_letter_queue = "other-dead-letter"; },
      (c: ReturnType<typeof readConfig>) => { c.queues.consumers.push({ queue: "otw-unexpected" }); },
      (c: ReturnType<typeof readConfig>) => { delete c.queues.producers; },
    ]) {
      const config = readConfig("otw"); mutate(config);
      expect(() => assertSiteResourceConfig(config, "otw")).toThrow();
    }
  });
  it("allows manual operation without queues only with scheduled operations and AI disabled", () => {
    const config = readConfig("otw");
    delete config.queues; delete config.workflows;
    config.triggers.crons = [];
    config.vars.OTW_PLAY_AI_REVIEW_ENABLED = "false";
    expect(() => assertSiteResourceConfig(config, "otw")).not.toThrow();
    for (const mutate of [
      (c: typeof config) => { c.triggers.crons = ["* * * * *"]; },
      (c: typeof config) => { c.workflows = [{ name: "otw-scheduled-operations" }]; },
      (c: typeof config) => { c.vars.OTW_PLAY_AI_REVIEW_ENABLED = "true"; },
    ]) {
      const broken = structuredClone(config); mutate(broken);
      expect(() => assertSiteResourceConfig(broken, "otw")).toThrow();
    }
  });
});
