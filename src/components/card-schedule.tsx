import type { Member, ScheduleItem } from "@/lib/types";

export const CardSchedule = ({
  schedule,
  member,
}: {
  schedule: ScheduleItem;
  member: Member;
}) => {
  return (
    <div style={{ backgroundColor: member.main_color }}>
      <h1>{schedule.title}</h1>
      <p>{schedule.start_time}</p>
    </div>
  );
};
