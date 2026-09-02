import { describe, expect, it } from "vitest";
import type { OperationRunDto } from "@contracts/scheduled-operations";
import { classifyOperationJobHealth } from "./operations-application";

const makeRun = (
  status: OperationRunDto["status"],
): OperationRunDto => ({
  runId: `run-${status}`,
  jobType: "x_collection",
  source: "scheduled",
  status,
  idempotencyKey: `scheduled:x:${status}`,
  scheduledFor: null,
  acceptedAt: 1,
  startedAt: 1,
  finishedAt: 2,
  progress: {
    total: 0,
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    throttled: 0,
  },
  failures: [],
  summary: null,
  lastError: null,
});

describe("operation job summary health", () => {
  it("keeps a recent normal skip healthy even when the previous success is old", () => {
    expect(classifyOperationJobHealth(
      true,
      makeRun("skipped"),
      true,
      false,
    )).toBe("healthy");
  });

  it("marks the latest check stale even when that check was a normal skip", () => {
    expect(classifyOperationJobHealth(
      true,
      makeRun("skipped"),
      true,
      true,
    )).toBe("attention");
  });

  it("marks a genuinely stale completed check for attention", () => {
    expect(classifyOperationJobHealth(
      true,
      makeRun("succeeded"),
      false,
      true,
    )).toBe("attention");
  });

  it("preserves actionable failures, throttling, and inactive states", () => {
    expect(classifyOperationJobHealth(true, makeRun("failed"), false, false))
      .toBe("critical");
    expect(classifyOperationJobHealth(true, makeRun("throttled"), false, false))
      .toBe("attention");
    expect(classifyOperationJobHealth(false, makeRun("failed"), false, false))
      .toBe("inactive");
  });
});
