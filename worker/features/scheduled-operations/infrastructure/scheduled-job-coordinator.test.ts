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

  it("resumes a queued idempotent run that was interrupted before items were added", async () => {
    const existing = {
      id: "queued-run",
      job_type: "x_collection",
      source: "scheduled",
      idempotency_key: "scheduled:x_collection:queued",
      scheduled_bucket: "queued",
      status: "queued",
      scheduled_for: Date.UTC(2026, 8, 3, 0, 23),
      accepted_at: Date.UTC(2026, 8, 3, 0, 23),
      started_at: null,
      finished_at: null,
      last_error: null,
      summary_json: null,
    } as const;
    const statement = {
      bind: vi.fn(),
      first: vi.fn(async () => ({ value: "true" })),
    };
    statement.bind.mockReturnValue(statement);
    const resumedEnv = {
      ...env,
      otw_db: { prepare: vi.fn(() => statement) },
    } as unknown as Env;
    vi.spyOn(
      D1ScheduledJobRepository.prototype,
      "readRunByIdempotencyKey",
    ).mockResolvedValue(existing);
    vi.spyOn(ScheduledJobPlanner.prototype, "planScheduled").mockResolvedValue([{
      targetKey: "handle:member",
      phase: "collect",
      lane: "x",
    }]);
    const createRun = vi.spyOn(
      D1ScheduledJobRepository.prototype,
      "createRun",
    );
    vi.spyOn(
      D1ScheduledJobRepository.prototype,
      "getBackgroundUsagePercent",
    ).mockResolvedValue(0);
    const addItems = vi.spyOn(
      D1ScheduledJobRepository.prototype,
      "addItems",
    ).mockResolvedValue(["item-1"]);
    vi.spyOn(D1ScheduledJobRepository.prototype, "readRun")
      .mockResolvedValue(existing);
    const dispatchRun = vi.spyOn(
      ScheduledJobCoordinator.prototype,
      "dispatchRun",
    ).mockResolvedValue({ claimed: 1, dispatched: 1, failed: 0 });

    const result = await new ScheduledJobCoordinator(resumedEnv).runScheduled(
      "x_collection",
      existing.scheduled_for,
    );

    expect(result).toBe(existing);
    expect(createRun).not.toHaveBeenCalled();
    expect(addItems).toHaveBeenCalledWith(existing.id, [
      expect.objectContaining({ targetKey: "handle:member" }),
    ]);
    expect(dispatchRun).toHaveBeenCalledWith(existing.id);
  });

  it("closes a resumed queued run when recalculation finds no targets", async () => {
    const existing = {
      id: "queued-no-targets",
      job_type: "x_collection",
      source: "scheduled",
      idempotency_key: "scheduled:x_collection:no-targets",
      scheduled_bucket: "no-targets",
      status: "queued",
      scheduled_for: Date.UTC(2026, 8, 3, 0, 53),
      accepted_at: Date.UTC(2026, 8, 3, 0, 53),
      started_at: null,
      finished_at: null,
      last_error: null,
      summary_json: null,
    } as const;
    const closed = { ...existing, status: "skipped" as const };
    vi.spyOn(
      D1ScheduledJobRepository.prototype,
      "readRunByIdempotencyKey",
    ).mockResolvedValue(existing);
    vi.spyOn(ScheduledJobPlanner.prototype, "planScheduled")
      .mockResolvedValue([]);
    const skipRun = vi.spyOn(
      D1ScheduledJobRepository.prototype,
      "skipRun",
    ).mockResolvedValue();
    vi.spyOn(D1ScheduledJobRepository.prototype, "readRun")
      .mockResolvedValue(closed);

    const result = await new ScheduledJobCoordinator(env).runScheduled(
      "x_collection",
      existing.scheduled_for,
    );

    expect(skipRun).toHaveBeenCalledWith(
      existing.id,
      "no_targets_after_resume",
    );
    expect(result).toBe(closed);
  });
});
