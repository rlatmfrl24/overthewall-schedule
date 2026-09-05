import { describe, expect, it } from "vitest";
import { getAdminDDayOccurrence } from "./admin-dday";
import type { DDayItem } from "./types";

const item = (date: string, type = "birthday"): DDayItem => ({id: 1, title: "기념일", date, type, color: null, description: null, created_at: null});
describe("관리자 D-Day 표시", () => {
  it("생일 저장 연도를 숨기고 다음 연도 도래일을 표시한다", () => {
    const birthday = item("9999-01-01");
    expect(getAdminDDayOccurrence(birthday, new Date(2026, 11, 31))).toMatchObject({label: "매년 1월 1일", nextLabel: "2027.01.01 · D-1"});
    expect(birthday.date).toBe("9999-01-01");
  });
  it("윤일은 기존 달력 정책대로 평년 3월 1일로 계산한다", () => {
    expect(getAdminDDayOccurrence(item("2024-02-29"), new Date(2027, 1, 27)).nextLabel).toBe("2027.03.01 · D-2");
    expect(getAdminDDayOccurrence(item("2024-02-29"), new Date(2028, 1, 28)).nextLabel).toBe("2028.02.29 · D-1");
  });
  it("데뷔 주년과 지난 이벤트를 구분한다", () => {
    expect(getAdminDDayOccurrence(item("2020-09-05", "debut"), new Date(2026, 8, 5)).nextLabel).toBe("2026.09.05 · 오늘 · 6주년");
    expect(getAdminDDayOccurrence(item("2026-09-04", "event"), new Date(2026, 8, 5)).sort).toBe(Infinity);
    expect(getAdminDDayOccurrence(item("invalid")).nextLabel).toBe("미확인");
  });
});
