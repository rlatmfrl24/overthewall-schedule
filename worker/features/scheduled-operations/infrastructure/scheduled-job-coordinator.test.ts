import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import { D1ScheduledJobRepository } from "../../../platform/scheduled-jobs";
import { ScheduledJobPlanner } from "./scheduled-job-planner";
import {
  getScheduledLaneQueue,
  ScheduledJobCoordinator,
} from "./scheduled-job-coordinator";

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it("does not create durable scheduler rows when a scheduled probe has no due targets", async () => {
    vi.spyOn(ScheduledJobPlanner.prototype, "planScheduled")
      .mockResolvedValue([]);
    vi.spyOn(
      D1ScheduledJobRepository.prototype,
      "readRunByIdempotencyKey",
    ).mockResolvedValue(null);
    const createRun = vi.spyOn(
      D1ScheduledJobRepository.prototype,
      "createRun",
    );

    const result = await new ScheduledJobCoordinator(env).runScheduled(
      "x_collection",
      Date.UTC(2026, 8, 3, 0, 23),
    );

    expect(result).toBeNull();
    expect(createRun).not.toHaveBeenCalled();
  });

  it("returns an existing idempotent run before recalculating due targets", async () => {
    const existing = {
      id: "existing-run",
      job_type: "x_collection",
      source: "scheduled",
      idempotency_key: "scheduled:x_collection:existing",
      scheduled_bucket: "existing",
      status: "running",
      scheduled_for: Date.UTC(2026, 8, 3, 0, 23),
      accepted_at: Date.UTC(2026, 8, 3, 0, 23),
      started_at: Date.UTC(2026, 8, 3, 0, 23),
      finished_at: null,
      last_error: null,
      summary_json: null,
    } as const;
    vi.spyOn(
      D1ScheduledJobRepository.prototype,
      "readRunByIdempotencyKey",
    ).mockResolvedValue(existing);
    const planScheduled = vi.spyOn(
      ScheduledJobPlanner.prototype,
      "planScheduled",
    );

    const result = await new ScheduledJobCoordinator(env).runScheduled(
      "x_collection",
      existing.scheduled_for,
    );

    expect(result).toBe(existing);
    expect(planScheduled).not.toHaveBeenCalled();
  });
});
