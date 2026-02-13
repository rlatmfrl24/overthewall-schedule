import type { ScheduleItem } from "@/lib/types";

type SplitScheduleResult = {
  timelineItems: ScheduleItem[];
  otherItems: ScheduleItem[];
};

const isTimelineSchedule = (schedule: ScheduleItem) =>
  Boolean(schedule.start_time) &&
  schedule.status !== "게릴라" &&
  schedule.status !== "미정";

export const splitSchedulesForTimeline = (
  schedules: ScheduleItem[],
): SplitScheduleResult => {
  const timelineItems: ScheduleItem[] = [];
  const otherItems: ScheduleItem[] = [];

  for (const schedule of schedules) {
    if (schedule.status === "휴방") {
      continue;
    }

    if (isTimelineSchedule(schedule)) {
      timelineItems.push(schedule);
      continue;
    }

    otherItems.push(schedule);
  }

  timelineItems.sort((a, b) =>
    (a.start_time ?? "").localeCompare(b.start_time ?? ""),
  );

  return { timelineItems, otherItems };
};
