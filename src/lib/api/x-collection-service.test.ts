import { describe, expect, it } from "vitest";
import { getXCollectionScheduleDecision } from "../../../worker/services/x-collection";

describe("x collection schedule", () => {
  it("주기가 지나지 않았으면 scheduled 수집을 건너뛴다", () => {
    const now = Date.parse("2026-05-28T08:00:00Z");
    const lastRun = String(now - 60 * 60 * 1000);

    const decision = getXCollectionScheduleDecision("2", lastRun, now);

    expect(decision).toMatchObject({
      shouldRun: false,
      intervalHours: 2,
      lastRun: Number(lastRun),
    });
  });

  it("주기가 지났거나 잘못된 주기 값이면 기본 2시간 기준으로 수집한다", () => {
    const now = Date.parse("2026-05-28T08:00:00Z");
    const lastRun = String(now - 3 * 60 * 60 * 1000);

    const decision = getXCollectionScheduleDecision("1", lastRun, now);

    expect(decision).toMatchObject({
      shouldRun: true,
      intervalHours: 2,
      lastRun: Number(lastRun),
    });
  });
});
