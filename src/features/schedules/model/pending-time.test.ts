import { describe, expect, it } from "vitest";
import { roundTimeToNearestScheduleHour } from "./pending-time";

describe("pending schedule time helpers", () => {
  it("분 단위 수집 시간을 같은 날짜 안의 정각으로 반올림한다", () => {
    expect(roundTimeToNearestScheduleHour("19:29")).toBe("19:00");
    expect(roundTimeToNearestScheduleHour("19:30")).toBe("20:00");
  });

  it("자정으로 넘어가는 반올림은 같은 날짜의 마지막 정각으로 제한한다", () => {
    expect(roundTimeToNearestScheduleHour("23:45")).toBe("23:00");
  });

  it("빈 값이나 잘못된 값은 기존 값을 유지한다", () => {
    expect(roundTimeToNearestScheduleHour(null)).toBeNull();
    expect(roundTimeToNearestScheduleHour("not-a-time")).toBe("not-a-time");
    expect(roundTimeToNearestScheduleHour("23:")).toBe("23:");
  });
});
