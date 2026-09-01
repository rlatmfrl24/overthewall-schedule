import { describe, expect, it } from "vitest";
import {
  getEstimatedD1RowsPerItem,
  getScheduledBucket,
  shouldThrottleAtUsage,
} from "./job-policy";

describe("scheduled background admission policy", () => {
  it("70/85/95 percent 단계에 맞춰 낮은 우선순위부터 중단한다", () => {
    expect(shouldThrottleAtUsage("retention_prune", 70)).toBe(true);
    expect(shouldThrottleAtUsage("recent_reconcile", 70)).toBe(false);
    expect(shouldThrottleAtUsage("recent_reconcile", 85)).toBe(true);
    expect(shouldThrottleAtUsage("source_health", 85)).toBe(true);
    expect(shouldThrottleAtUsage("x_collection", 85)).toBe(false);
    expect(shouldThrottleAtUsage("x_collection", 95)).toBe(true);
    expect(shouldThrottleAtUsage("websub_maintenance", 95)).toBe(false);
    expect(shouldThrottleAtUsage("ingestion_recovery", 95)).toBe(false);
  });

  it("모든 job item에 양수 D1 read/write 예약량을 둔다", () => {
    for (const jobType of [
      "x_collection",
      "naver_cafe_collection",
      "youtube_feed_collection",
      "schedule_auto_update",
      "ingestion_recovery",
      "websub_maintenance",
      "channel_reconcile",
      "recent_reconcile",
      "source_health",
      "retention_prune",
    ] as const) {
      const estimate = getEstimatedD1RowsPerItem(jobType);
      expect(estimate.rowsRead).toBeGreaterThan(0);
      expect(estimate.rowsWritten).toBeGreaterThan(0);
    }
  });

  it("Compliance 입력 ID를 D1 write 행으로 과대 산정하지 않는다", () => {
    expect(getEstimatedD1RowsPerItem("x_compliance")).toEqual({
      rowsRead: 5_500,
      rowsWritten: 100,
    });
  });

  it("auto-update probe는 hour별 idempotency bucket을 사용한다", () => {
    const firstHour = Date.parse("2026-08-31T01:05:00.000Z");
    const nextHour = Date.parse("2026-08-31T02:05:00.000Z");

    expect(getScheduledBucket("schedule_auto_update", firstHour)).not.toBe(
      getScheduledBucket("schedule_auto_update", nextHour),
    );
    expect(getScheduledBucket("schedule_auto_update", firstHour)).toBe(
      String(Date.parse("2026-08-31T01:00:00.000Z")),
    );
  });

  it.each([
    "ingestion_recovery",
    "websub_maintenance",
    "channel_reconcile",
    "source_health",
  ] as const)("%s probe는 hour별 idempotency bucket을 사용한다", (jobType) => {
    const endOfHour = Date.parse("2026-08-31T01:59:59.999Z");
    const nextHour = Date.parse("2026-08-31T02:00:00.000Z");

    expect(getScheduledBucket(jobType, endOfHour)).toBe(
      String(Date.parse("2026-08-31T01:00:00.000Z")),
    );
    expect(getScheduledBucket(jobType, nextHour)).toBe(
      String(Date.parse("2026-08-31T02:00:00.000Z")),
    );
  });
});
