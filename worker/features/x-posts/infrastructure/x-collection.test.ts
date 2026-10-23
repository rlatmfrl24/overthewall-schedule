import { describe, expect, it } from "vitest";
import {
  getXCollectionScheduleDecision,
  getXUsageFallbackReason,
  normalizeXCollectionHandles,
} from "./x-collection";

describe("x collection schedule", () => {
  it("does not use a cadence state whose actual completion is still in the future", () => {
    const now = Date.parse("2026-10-22T00:53:00Z"), completedAt = now + 45_000;
    expect(getXCollectionScheduleDecision("0.5", String(completedAt), now,
      JSON.stringify({ completedAt, anchorAt: now - 30 * 60_000 })).shouldRun).toBe(false);
  });
  it.each([0.5, 1, 2, 6, 12, 24])("uses the scheduled anchor at the %sh boundary while retaining actual completion", interval => {
    const anchorAt = Date.parse("2026-10-22T23:23:00Z");
    const completedAt = anchorAt + 45_000;
    const state = JSON.stringify({ anchorAt, completedAt });
    const due = anchorAt + interval * 3_600_000;
    expect(getXCollectionScheduleDecision(String(interval), String(completedAt), due - 1, state).shouldRun).toBe(false);
    expect(getXCollectionScheduleDecision(String(interval), String(completedAt), due, state)).toMatchObject({ shouldRun: true, lastRun: completedAt });
  });

  it.each([null, "bad json", "null", "{}", JSON.stringify({ anchorAt: 1, completedAt: 1 }), JSON.stringify({ anchorAt: 9e15, completedAt: 9e15 })])("falls back to actual completion for legacy or mismatched state %s", state => {
    const now = Date.parse("2026-10-22T00:53:00Z");
    expect(getXCollectionScheduleDecision("0.5", String(now - 1_755_000), now, state).shouldRun).toBe(false);
  });

  it("대소문자가 다른 동일 handle을 하나의 lower-case source로 정규화한다", () => {
    expect(normalizeXCollectionHandles([
      " Kurenai_Natsuki ",
      "kurenai_natsuki",
      "TERRI_NUNNA",
      "",
    ])).toEqual(["kurenai_natsuki", "terri_nunna"]);
  });

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

  it("1시간 주기를 적용하고 잘못된 값은 기본 2시간으로 정규화한다", () => {
    const now = Date.parse("2026-05-28T08:00:00Z");
    const lastRun = String(now - 3 * 60 * 60 * 1000);

    const decision = getXCollectionScheduleDecision("1", lastRun, now);

    expect(decision).toMatchObject({
      shouldRun: true,
      intervalHours: 1,
      lastRun: Number(lastRun),
    });
    expect(getXCollectionScheduleDecision("invalid", lastRun, now).intervalHours).toBe(2);
  });
});

describe("x collection 70% guard", () => {
  it("70% 미만은 30분을 유지하고 경계부터 1시간 완화 사유를 반환한다", () => {
    const row = (consumed: number) => ({
      resource: "d1_rows_read",
      consumed,
      limit_value: 100,
    });
    expect(getXUsageFallbackReason([row(69)], 0, 1_000)).toBeNull();
    expect(getXUsageFallbackReason([row(70)], 0, 1_000)).toBe("d1_reads");
  });

  it("공급자 backoff를 원장보다 우선한다", () => {
    expect(getXUsageFallbackReason([], 2_000, 1_000)).toBe("provider_backoff");
  });
});
