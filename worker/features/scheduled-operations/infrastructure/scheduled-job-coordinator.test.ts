import { describe, expect, it } from "vitest";
import type { Env } from "../../../platform/types";
import { getScheduledLaneQueue } from "./scheduled-job-coordinator";

describe("scheduled job physical queue mapping", () => {
  const control = { send: async () => undefined } as unknown as Queue<unknown>;
  const critical = { send: async () => undefined } as unknown as Queue<unknown>;
  const background = { send: async () => undefined } as unknown as Queue<unknown>;
  const env = {
    OTW_OPS_CONTROL_QUEUE: control,
    OTW_OPS_CRITICAL_QUEUE: critical,
    OTW_OPS_BACKGROUND_QUEUE: background,
  } as unknown as Env;

  it.each(["x", "naver", "auto-update", "maintenance"] as const)(
    "maps %s to the serialized background queue",
    (lane) => {
      expect(getScheduledLaneQueue(env, lane)).toBe(background);
    },
  );

  it.each(["websub", "ingestion", "youtube-critical"] as const)(
    "maps %s to the serialized critical queue",
    (lane) => {
      expect(getScheduledLaneQueue(env, lane)).toBe(critical);
    },
  );

  it("keeps manual control isolated", () => {
    expect(getScheduledLaneQueue(env, "control")).toBe(control);
  });
});
