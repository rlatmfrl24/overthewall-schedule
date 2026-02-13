import { describe, expect, it } from "vitest";
import { formatDDayLabel, getDDaysForDate, normalizeDDayColors } from "./dday";
import type { DDayItem } from "./types";

const makeDday = (partial: Partial<DDayItem>): DDayItem =>
  ({
    id: 1,
    title: "기념일",
    date: "2026-02-13",
    description: null,
    color: null,
    type: "event",
    created_at: null,
    ...partial,
  }) as DDayItem;

describe("dday helpers", () => {
  it("색상 문자열/배열을 normalize 한다", () => {
    expect(normalizeDDayColors("#ff0000, #00ff00 ,")).toEqual([
      "#ff0000",
      "#00ff00",
    ]);
    expect(normalizeDDayColors([" #111111 ", "", "#222222"])).toEqual([
      "#111111",
      "#222222",
    ]);
    expect(normalizeDDayColors(undefined)).toEqual([]);
  });

  it("선택 날짜와 일치하는 디데이만 반환한다", () => {
    const referenceDate = new Date("2026-02-13T00:00:00Z");
    const ddays: DDayItem[] = [
      makeDday({
        id: 10,
        title: "데뷔",
        type: "debut",
        date: "2020-02-13",
        colors: ["#ff0000", "#00ff00"],
      }),
      makeDday({
        id: 11,
        title: "생일",
        type: "birthday",
        date: "2001-02-13",
        color: "#123456",
      }),
      makeDday({
        id: 12,
        title: "지난 이벤트",
        type: "event",
        date: "2025-02-13",
      }),
    ];

    const result = getDDaysForDate(ddays, referenceDate);

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.id)).toEqual(["10", "11"]);
    expect(result[0]?.anniversaryLabel).toBe("6주년");
    expect(result[0]?.colors).toEqual(["#ff0000", "#00ff00"]);
    expect(result[1]?.color).toBe("#123456");
    expect(result.every((item) => item.isToday)).toBe(true);
    expect(
      result.every((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.targetDate)),
    ).toBe(true);
  });

  it("디데이 라벨 포맷을 반환한다", () => {
    expect(formatDDayLabel(0)).toBe("D-DAY");
    expect(formatDDayLabel(3)).toBe("D-3");
  });
});
