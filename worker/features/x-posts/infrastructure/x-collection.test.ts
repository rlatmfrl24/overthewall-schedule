import { describe, expect, it } from "vitest";
import {
  getXCollectionScheduleDecision,
  getXUsageFallbackReason,
  normalizeXCollectionHandles,
} from "./x-collection";

describe("x collection schedule", () => {
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
