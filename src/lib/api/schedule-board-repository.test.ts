import { describe, expect, it } from "vitest";
import {
  isScheduleChangeAction,
  resolveScheduleBoardUpdatedAt,
} from "../../../worker/repositories/schedule-board";

describe("schedule-board updatedAt", () => {
  it("조회 시각이 아니라 실제 최신 변경 시각을 ISO 문자열로 반환한다", () => {
    expect(
      resolveScheduleBoardUpdatedAt("2026-07-13 01:10:00", [
        "2026-07-12 23:00:00",
        "2026-07-13 00:30:00",
      ]),
    ).toBe("2026-07-13T01:10:00.000Z");
  });

  it("변경 로그가 없는 기존 일정은 가장 최근 생성 시각을 사용한다", () => {
    expect(
      resolveScheduleBoardUpdatedAt(null, [
        "2026-07-10 08:00:00",
        "2026-07-11 09:15:00",
      ]),
    ).toBe("2026-07-11T09:15:00.000Z");
  });

  it("변경 이력이 없으면 업데이트 시각을 반환하지 않는다", () => {
    expect(resolveScheduleBoardUpdatedAt(null, [])).toBeNull();
  });

  it("실제로 공개 일정이 변경된 로그만 최종 편집으로 분류한다", () => {
    expect(isScheduleChangeAction("create")).toBe(true);
    expect(isScheduleChangeAction("update")).toBe(true);
    expect(isScheduleChangeAction("delete")).toBe(true);
    expect(isScheduleChangeAction("approve")).toBe(true);
    expect(isScheduleChangeAction("schedule_auto_created")).toBe(true);
    expect(isScheduleChangeAction("schedule_auto_updated")).toBe(true);
  });

  it("승인 대기 후보 수집 로그는 최종 편집으로 분류하지 않는다", () => {
    expect(isScheduleChangeAction("auto_collected")).toBe(false);
    expect(isScheduleChangeAction("auto_updated")).toBe(false);
    expect(isScheduleChangeAction("reject")).toBe(false);
  });
});
