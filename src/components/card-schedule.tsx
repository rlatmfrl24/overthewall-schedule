import type { ScheduleItem } from "@/lib/types";

export const CardSchedule = ({ schedule }: { schedule: ScheduleItem }) => {
  return (
    <div>
      <h1>{schedule.title}</h1>
      <p>{schedule.start_time}</p>
    </div>
  );
};
