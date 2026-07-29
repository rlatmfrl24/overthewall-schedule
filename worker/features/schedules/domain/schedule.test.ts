import { describe, expect, it } from "vitest";
import {
  isExclusiveScheduleStatus,
  isScheduleStatus,
} from "./schedule";

describe("schedule domain status policy", () => {
  it.each(["휴방", "게릴라"] as const)(
    "상호 배타적인 일정 상태를 식별한다: %s",
    (status) => {
      expect(isExclusiveScheduleStatus(status)).toBe(true);
    },
  );

  it.each(["방송", "미정"] as const)(
    "일반 일정 상태는 상호 배타적이지 않다: %s",
    (status) => {
      expect(isExclusiveScheduleStatus(status)).toBe(false);
    },
  );

  it.each(["방송", "휴방", "게릴라", "미정"])(
    "지원하는 일정 상태를 허용한다: %s",
    (value) => {
      expect(isScheduleStatus(value)).toBe(true);
    },
  );

  it.each([
    "",
    " 방송",
    "방송 ",
    "휴방중",
    "unknown",
    null,
    undefined,
    0,
    {},
  ])("지원하지 않는 일정 상태를 거부한다: %s", (value) => {
    expect(isScheduleStatus(value)).toBe(false);
  });
});
