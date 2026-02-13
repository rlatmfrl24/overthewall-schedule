import { describe, expect, it } from "vitest";
import type { ScheduleItem } from "@/lib/types";
import { splitSchedulesForTimeline } from "./chronological-schedule-utils";

const makeSchedule = (
  partial: Partial<ScheduleItem> & Pick<ScheduleItem, "status">,
): ScheduleItem =>
  ({
    id: 1,
    member_uid: 1,
    date: "2026-02-13",
    start_time: null,
    title: "테스트",
    created_at: null,
    ...partial,
  }) as ScheduleItem;

describe("splitSchedulesForTimeline", () => {
  it("휴방을 제외하고 timeline/other를 단일 분류한다", () => {
    const schedules: ScheduleItem[] = [
      makeSchedule({ id: 1, status: "휴방", start_time: "19:00" }),
      makeSchedule({ id: 2, status: "방송", start_time: "21:30" }),
      makeSchedule({ id: 3, status: "게릴라", start_time: "18:00" }),
      makeSchedule({ id: 4, status: "방송", start_time: "20:00" }),
      makeSchedule({ id: 5, status: "미정", start_time: null }),
      makeSchedule({ id: 6, status: "방송", start_time: null }),
    ];

    const { timelineItems, otherItems } = splitSchedulesForTimeline(schedules);

    expect(timelineItems.map((item) => item.id)).toEqual([4, 2]);
    expect(otherItems.map((item) => item.id)).toEqual([3, 5, 6]);
  });
});
